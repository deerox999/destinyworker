import { GoogleGenAI } from "@google/genai";
import {
  buildGeminiPayload,
  generateTitle,
  saveSajuAnalysisInitial,
  updateSajuAnalysis,
  type SajuAnalysisMessage,
} from "../utils";

/**
 * Queue Consumer - 사주 분석 작업을 백그라운드에서 처리
 */
export async function saju_analysis_queue_handler(
  batch: MessageBatch<SajuAnalysisMessage>,
  env: any
): Promise<void> {
  // 병렬 처리를 위한 Promise 배열 생성
  const processingPromises = batch.messages.map(async (message) => {
    let initialSaveResult: {
      success: boolean;
      analysisId?: number;
      error?: string;
    } | null = null;

    try {
      // 분석 시작 시 DB에 미리 저장
      const analysisStartedAt = new Date();
      const title = generateTitle(message.body);

      initialSaveResult = await saveSajuAnalysisInitial(
        message.body,
        title,
        analysisStartedAt,
        env
      );

      if (!initialSaveResult.success) {
        throw new Error(
          `분석 작업 초기화에 실패했습니다: ${initialSaveResult.error}`
        );
      }

      // Gemini API 직접 호출 (Durable Object 거치지 않음)
      const ai = new GoogleGenAI({
        apiKey: env.GOOGLE_GEMINI_API_KEY,
      });

      const payload = buildGeminiPayload(message.body);
      const result = await ai.models.generateContent(payload);

      if (!result) {
        throw new Error("AI 응답을 받을 수 없습니다.");
      }

      const text = result.text || "죄송합니다. 답변을 생성할 수 없습니다.";
      const analysisCompletedAt = new Date();

      // 분석 완료 후 DB 업데이트
      const updateResult = await updateSajuAnalysis(
        initialSaveResult.analysisId!,
        text,
        analysisCompletedAt,
        env
      );

      if (!updateResult.success) {
        throw new Error(
          `분석 결과 업데이트에 실패했습니다: ${updateResult.error}`
        );
      }

      // 포인트 거래 기록의 analysisId 업데이트
      try {
        const { updatePointTransactionAnalysisId } = await import(
          "../../../../common/paymentUtils"
        );
        const updateTransactionResult = await updatePointTransactionAnalysisId(
          env,
          message.body.userId,
          message.body.reference,
          initialSaveResult.analysisId!
        );

        if (updateTransactionResult) {
          console.log(
            `[Queue] 포인트 거래 analysisId 업데이트 성공: ${initialSaveResult.analysisId}`
          );
        } else {
          console.warn(
            `[Queue] 포인트 거래 analysisId 업데이트 실패: ${initialSaveResult.analysisId}`
          );
        }
      } catch (updateTransactionError) {
        console.error(
          "[Queue] 포인트 거래 analysisId 업데이트 오류:",
          updateTransactionError
        );
      }

      console.log(`[Queue] 작업 완료: ${message.body.jobId}`);
    } catch (error) {
      console.error(`Error processing job ${message.body.jobId}:`, error);

      // 실패 시 포인트 환불
      let refundSuccess = false;
      let refundMessage = "";
      try {
        const { refundPoints } = await import(
          "../../../../common/paymentUtils"
        );
        const refundResult = await refundPoints(
          env.DB,
          message.body.userId,
          message.body.pointsCost,
          `사주 분석 작업 실패로 인한 포인트 환불 (${message.body.type})`,
          `analysis_saju_${message.body.type}_refund_${Date.now()}`
        );
        
        if (refundResult.success) {
          refundSuccess = true;
          refundMessage = `포인트 환불 완료: ${message.body.pointsCost}포인트가 환불되었습니다.`;
          console.log(`[Queue] 포인트 환불 성공: ${message.body.pointsCost}포인트`);
        } else {
          refundMessage = `포인트 환불 실패: ${refundResult.message}`;
          console.error(`[Queue] 포인트 환불 실패: ${refundResult.message}`);
        }
      } catch (refundError) {
        refundMessage = `포인트 환불 중 오류 발생: ${refundError instanceof Error ? refundError.message : "Unknown error"}`;
        console.error("[Queue] 포인트 환불 실패:", refundError);
      }

      // 실패 시 DB 업데이트 (에러 메시지 + 환불 정보)
      if (initialSaveResult?.analysisId) {
        try {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          const failureMessage = `분석 실패: ${errorMessage}\n\n${refundMessage}`;
          
          await updateSajuAnalysis(
            initialSaveResult.analysisId,
            failureMessage,
            new Date(),
            env
          );
        } catch (updateError) {
          console.error("[Queue] 실패 상태 DB 업데이트 실패:", updateError);
        }
      }
    }
  });

  // 모든 작업을 병렬로 실행하고 완료 대기
  await Promise.all(processingPromises);
}
