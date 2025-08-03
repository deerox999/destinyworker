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

      // 신규 방식: Durable Object /process-background로 위임 (기본값)
      if (message.body.useProcessBackground !== false) { // false가 아니면 신규 방식 사용
        const durableObjectId = env.SAJU_ANALYSIS_WORKER.idFromName(
          `user_${message.body.userId}_${message.body.jobId || Date.now()}`
        );
        const durableObject = env.SAJU_ANALYSIS_WORKER.get(durableObjectId);
        const response = await durableObject.fetch("http://localhost/process-background", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            ...message.body, 
            jobId: message.body.jobId,
            analysisId: initialSaveResult.analysisId // DB 분석 ID 전달
          }),
        });
        
        // 스트리밍 응답 수신 (하트비트 포함)
        const reader = response.body?.getReader();
        let fullResponse = "";
        let buffer = ""; // 불완전한 청크를 위한 버퍼
        
        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = new TextDecoder().decode(value);
          buffer += chunk;
          
          // 완전한 라인만 처리
          const lines = buffer.split('\n');
          buffer = lines.pop() || ""; // 마지막 불완전한 라인은 버퍼에 보관
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const jsonStr = line.slice(6);
                // [DONE] 메시지 처리
                if (jsonStr === '[DONE]') {
                  continue;
                }
                
                const data = JSON.parse(jsonStr);
                if (data.type === 'heartbeat') {
                  // 하트비트 처리 (로그만)
                  // 개발 환경에서만 로그 출력
                } else if (data.type === 'content') {
                  fullResponse += data.text;
                } else if (data.type === 'error') {
                  throw new Error(data.message);
                }
              } catch (parseError) {
                console.error(`[Queue] JSON 파싱 오류 (라인: ${line}):`, parseError);
                // 파싱 실패해도 계속 진행
                continue;
              }
            }
          }
        }
        
        // 분석 완료 후 DB 업데이트
        const analysisCompletedAt = new Date();
        const updateResult = await updateSajuAnalysis(
          initialSaveResult.analysisId!,
          fullResponse,
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
            env.DB,
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

        console.log(`[Queue] 신규 방식 작업 완료: ${message.body.jobId}`);
        return; // 신규 방식 완료
      }

      // 기존 방식: Gemini API 직접 호출 (useProcessBackground가 false일 때만)
      console.log(`[Queue] 기존 방식 사용: ${message.body.jobId}`);
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
          env.DB,
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

      console.log(`[Queue] 기존 방식 작업 완료: ${message.body.jobId}`);
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
