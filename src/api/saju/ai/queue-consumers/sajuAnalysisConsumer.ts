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
 * 
 * 역할:
 * 1. AI 분석 실행
 * 2. DB 저장
 * 3. DO 상태 업데이트
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
      console.log(`[Queue] 사주 분석 작업 시작: ${message.body.jobId}`);

      // 1. 분석 시작 시 DB에 미리 저장
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

      // 2. DO 상태를 'processing'으로 업데이트
      await updateDurableObjectStatus(env, message.body.userId, message.body.jobId, "processing");

      // 3. Gemini API 호출하여 AI 분석 실행
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

      // 4. 분석 완료 후 DB 업데이트
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

      // 5. 포인트 거래 기록의 analysisId 업데이트
      await updatePointTransactionAnalysisId(env, message.body, initialSaveResult.analysisId!);

      // 6. DO 상태를 'completed'로 업데이트
      await updateDurableObjectStatus(env, message.body.userId, message.body.jobId, "completed", {
        answer: text,
        analysisId: initialSaveResult.analysisId,
        metadata: {
          modelUsed: message.body.model,
          timestamp: new Date().toISOString(),
          responseType: "individual", // TODO: 동적으로 설정
        },
      });

      console.log(`[Queue] 작업 완료: ${message.body.jobId}`);
    } catch (error) {
      console.error(`Error processing job ${message.body.jobId}:`, error);

      // 7. 실패 시 포인트 환불
      await refundPointsOnFailure(env, message.body);

      // 8. 실패 시 DB 업데이트
      if (initialSaveResult?.analysisId) {
        await updateAnalysisOnFailure(env, initialSaveResult.analysisId, error);
      }

      // 9. DO 상태를 'failed'로 업데이트
      await updateDurableObjectStatus(env, message.body.userId, message.body.jobId, "failed", null, 
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  });

  // 모든 작업을 병렬로 실행하고 완료 대기
  await Promise.all(processingPromises);
}

/**
 * Durable Object 상태 업데이트 헬퍼 함수
 */
async function updateDurableObjectStatus(
  env: any, 
  userId: number, 
  jobId: string, 
  status: string, 
  result?: any, 
  error?: string
): Promise<void> {
  try {
    const durableObjectId = env.SAJU_ANALYSIS_WORKER.idFromName(
      `user_${userId}_${jobId}`
    );
    const durableObject = env.SAJU_ANALYSIS_WORKER.get(durableObjectId);

    const response = await durableObject.fetch("http://localhost/jobs/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        status,
        result,
        error,
      }),
    });

    if (!response.ok) {
      console.error(`[Queue] DO 상태 업데이트 실패: ${jobId} -> ${status}`);
    } else {
      console.log(`[Queue] DO 상태 업데이트 성공: ${jobId} -> ${status}`);
    }
  } catch (error) {
    console.error(`[Queue] DO 상태 업데이트 오류: ${jobId}`, error);
  }
}

/**
 * 포인트 거래 analysisId 업데이트 헬퍼 함수
 */
async function updatePointTransactionAnalysisId(
  env: any, 
  messageBody: any, 
  analysisId: number
): Promise<void> {
  try {
    const { updatePointTransactionAnalysisId } = await import(
      "../../../../common/paymentUtils"
    );
    
    const updateTransactionResult = await updatePointTransactionAnalysisId(
      env.DB,
      messageBody.userId,
      messageBody.reference,
      analysisId
    );

    if (updateTransactionResult) {
      console.log(`[Queue] 포인트 거래 analysisId 업데이트 성공: ${analysisId}`);
    } else {
      console.warn(`[Queue] 포인트 거래 analysisId 업데이트 실패: ${analysisId}`);
    }
  } catch (updateTransactionError) {
    console.error("[Queue] 포인트 거래 analysisId 업데이트 오류:", updateTransactionError);
  }
}

/**
 * 실패 시 포인트 환불 헬퍼 함수
 */
async function refundPointsOnFailure(env: any, messageBody: any): Promise<void> {
  try {
    const { refundPoints } = await import("../../../../common/paymentUtils");
    
    const refundResult = await refundPoints(
      env.DB,
      messageBody.userId,
      messageBody.pointsCost,
      `사주 분석 작업 실패로 인한 포인트 환불 (${messageBody.type})`,
      `analysis_saju_${messageBody.type}_refund_${Date.now()}`
    );
    
    if (refundResult.success) {
      console.log(`[Queue] 포인트 환불 성공: ${messageBody.pointsCost}포인트`);
    } else {
      console.error(`[Queue] 포인트 환불 실패: ${refundResult.message}`);
    }
  } catch (refundError) {
    console.error("[Queue] 포인트 환불 실패:", refundError);
  }
}

/**
 * 실패 시 DB 업데이트 헬퍼 함수
 */
async function updateAnalysisOnFailure(env: any, analysisId: number, error: any): Promise<void> {
  try {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const failureMessage = `분석 실패: ${errorMessage}`;
    
    await updateSajuAnalysis(
      analysisId,
      failureMessage,
      new Date(),
      env
    );
  } catch (updateError) {
    console.error("[Queue] 실패 상태 DB 업데이트 실패:", updateError);
  }
}
