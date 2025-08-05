import {
  generateTitle,
  saveSajuAnalysisInitial,
  type SajuAnalysisMessage,
} from "../utils";

/**
 * Queue Consumer - 사주 분석 작업을 Durable Object에 위임
 * 
 * 새로운 역할:
 * 1. 작업 검증 및 초기 설정
 * 2. Durable Object에 장시간 작업 위임
 * 3. 즉시 완료 (timeout 방지)
 */
export async function saju_analysis_queue_handler(
  batch: MessageBatch<SajuAnalysisMessage>,
  env: any
): Promise<void> {
  // 병렬 처리를 위한 Promise 배열 생성
  const processingPromises = batch.messages.map(async (message) => {
    try {
      // 1. 분석 시작 시 DB에 미리 저장 (초기 상태)
      const analysisStartedAt = new Date();
      const title = generateTitle(message.body);

      const initialSaveResult = await saveSajuAnalysisInitial(
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
      // 2. Durable Object에 장시간 작업 위임
      await delegateToLongRunningProcessor(env, message.body, initialSaveResult.analysisId!);

    } catch (error) {
      console.error(`Error delegating job ${message.body.jobId}:`, error);

      // 즉시 실패 처리 (포인트 환불)
      await refundPointsOnFailure(env, message.body);

      // DO 상태를 'failed'로 업데이트
      await updateDurableObjectStatus(env, message.body.userId, message.body.jobId, "failed", null, 
        error instanceof Error ? error.message : "Queue delegation failed"
      );
    }
  });

  // 모든 작업을 병렬로 실행하고 완료 대기 (빠른 완료)
  await Promise.all(processingPromises);
}

/**
 * Durable Object에 장시간 처리 작업 위임
 */
async function delegateToLongRunningProcessor(
  env: any, 
  messageBody: any, 
  analysisId: number
): Promise<void> {
  try {
    const durableObjectId = env.SAJU_ANALYSIS_WORKER.idFromName(
      `user_${messageBody.userId}_${messageBody.jobId}`
    );
    const durableObject = env.SAJU_ANALYSIS_WORKER.get(durableObjectId);

    const response = await durableObject.fetch("http://localhost/jobs/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...messageBody,
        analysisId, // 미리 생성된 analysisId 전달
        delegatedAt: new Date().toISOString(),
      }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`DO 위임 실패: ${errorData.error || "Unknown error"}`);
    }
  } catch (error) {
    console.error(`[Queue] DO 위임 오류: ${messageBody.jobId}`, error);
    throw error;
  }
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
    const durableObjectId = env.SAJU_ANALYSIS_WORKER.idFromName(`user_${userId}_${jobId}`);
    const durableObject = env.SAJU_ANALYSIS_WORKER.get(durableObjectId);

    await durableObject.fetch("http://localhost/jobs/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        status,
        result,
        error,
      }),
    })
  } catch (error) {
    console.error(`[Queue] DO 상태 업데이트 오류: ${jobId}`, error);
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
    )
    
    if (refundResult.success) {
      console.log(`[Queue] 포인트 환불 성공: ${messageBody.pointsCost}포인트`);
    } else {
      console.error(`[Queue] 포인트 환불 실패: ${refundResult.message}`);
    }
  } catch (refundError) {
    console.error("[Queue] 포인트 환불 실패:", refundError);
  }
}


