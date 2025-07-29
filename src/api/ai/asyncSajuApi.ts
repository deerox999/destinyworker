import { Context } from "hono";
import { getUserFromToken } from "../../common/utils";
import { usePoints, refundPoints } from "../../common/paymentUtils";
import { POINT_COSTS } from "../../common/paymentUtils";

// API 사용자가 보내는 요청 본문 타입 정의
interface AsyncSajuAnalysisRequest {
  model?: string;
  userPrompt: string;
  systemPrompt?: string;
  conversationHistory?: any[];
  sajuData?: any;
  analysisType?: string;
  type?: string;
  i18n?: string;
  timezone?: string;
  fortuneType?: string;
  generationConfig?: any;
  safetySettings?: any[];
  tools?: any[];
  toolConfig?: any;
}

/**
 * 비동기 사주 분석 API - 즉시 응답하고 백그라운드에서 처리
 */
export async function AsyncSajuAnalysis(c: Context): Promise<Response> {
  const user = await getUserFromToken(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  try {
    const body: AsyncSajuAnalysisRequest = await c.req.json();

    // 필수 필드 검증
    if (!body.userPrompt) {
      return c.json({ error: "userPrompt는 필수입니다." }, 400);
    }

    // 분석 타입에 따른 포인트 비용 결정
    const analysisType = body.analysisType || "general";
    const type = body.type || "individual";
    let pointsCost: number = POINT_COSTS.SAJU_ANALYSIS;

    if (type === "compatibility") {
      pointsCost = POINT_COSTS.COMPATIBILITY_ANALYSIS;
    } else if (type === "yearly_fortune") {
      pointsCost = POINT_COSTS.YEARLY_FORTUNE;
    }

    // 포인트 검증
    const reference = `async_saju_analysis_${Date.now()}`;
    const pointValidation = await usePoints(
      c.env.DB,
      user.id,
      pointsCost,
      `비동기 사주 분석 서비스 이용`,
      reference,
      undefined
    );

    if (!pointValidation.success) {
      return c.json(
        {
          error: "포인트가 부족합니다.",
          details: pointValidation.message,
          data: pointValidation.data,
        },
        402
      );
    }

    // Durable Object에 작업 제출
    const durableObjectId = c.env.SAJU_ANALYSIS_WORKER.idFromName(
      `user_${user.id}`
    );
    const durableObject = c.env.SAJU_ANALYSIS_WORKER.get(durableObjectId);

    const jobId = `job_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    const jobData = {
      userId: user.id,
      analysisType,
      type,
      pointsCost,
      reference,
      i18n: body.i18n || "ko",
      timezone: body.timezone || "Asia/Seoul",
      userPrompt: body.userPrompt,
      systemPrompt: body.systemPrompt,
      sajuData: body.sajuData,
      conversationHistory: body.conversationHistory,
      model: body.model || "gemini-2.5-pro",
      fortuneType: body.fortuneType,
    };

    // Durable Object에 작업 등록
    const response = await durableObject.fetch("http://localhost/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...jobData,
        jobId,
      }),
    });

    if (!response.ok) {
      // 실패 시 포인트 환불
      await refundPoints(
        c.env.DB,
        user.id,
        pointsCost,
        "비동기 사주 분석 작업 제출 실패로 인한 포인트 환불",
        `async_saju_analysis_refund_${Date.now()}`
      );

      const errorData = await response.json();
      return c.json(
        {
          error: "분석 작업 제출에 실패했습니다.",
          details: errorData.error || "Unknown error",
        },
        500
      );
    }

    // Queue에 작업 전송
    await c.env.analysis.send({
      ...jobData,
      jobId,
      durableObjectId: durableObjectId.toString(),
    });

    const result = await response.json();

    return c.json(
      {
        success: true,
        jobId: result.jobId,
        message: result.message,
        status: result.status,
        points: {
          deducted: pointsCost,
          remaining: pointValidation.remainingPoints || null,
          message: pointValidation.message || null,
        },
        data: pointValidation.data,
      },
      200
    );
  } catch (error) {
    console.error("비동기 사주 분석 API 오류:", error);
    return c.json(
      {
        error: "분석 작업을 처리하는 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * 비동기 사주 분석 작업 상태 조회 API
 */
export async function GetAsyncSajuAnalysisStatus(
  c: Context
): Promise<Response> {
  const user = await getUserFromToken(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  try {
    const { searchParams } = new URL(c.req.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return c.json({ error: "jobId 파라미터가 필요합니다." }, 400);
    }

    // Durable Object에서 작업 상태 조회
    const durableObjectId = c.env.SAJU_ANALYSIS_WORKER.idFromName(
      `user_${user.id}`
    );
    const durableObject = c.env.SAJU_ANALYSIS_WORKER.get(durableObjectId);

    const response = await durableObject.fetch(
      `http://localhost/status?jobId=${jobId}`,
      {
        method: "GET",
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      return c.json(
        {
          error: "작업 상태 조회에 실패했습니다.",
          details: errorData.error || "Unknown error",
        },
        response.status
      );
    }

    const result = await response.json();

    return c.json(
      {
        success: true,
        jobId: result.jobId,
        status: result.status,
        createdAt: result.createdAt,
        result: result.result,
        error: result.error,
      },
      200
    );
  } catch (error) {
    console.error("비동기 사주 분석 상태 조회 오류:", error);
    return c.json(
      {
        error: "작업 상태를 조회하는 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * 비동기 궁합 분석 API
 */
export async function AsyncSajuCompatibilityAnalysis(
  c: Context
): Promise<Response> {
  const user = await getUserFromToken(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  try {
    const body: AsyncSajuAnalysisRequest = await c.req.json();

    // 궁합 데이터 검증
    if (!body.sajuData || !body.sajuData.person1 || !body.sajuData.person2) {
      return c.json(
        {
          error: "궁합 분석을 위해서는 두 사람의 사주 데이터가 필요합니다.",
          details: "sajuData에 person1과 person2가 포함되어야 합니다.",
        },
        400
      );
    }

    // 포인트 검증
    const reference = `async_compatibility_analysis_${Date.now()}`;
    const pointValidation = await usePoints(
      c.env.DB,
      user.id,
      POINT_COSTS.COMPATIBILITY_ANALYSIS,
      `비동기 궁합 분석 서비스 이용`,
      reference,
      undefined
    );

    if (!pointValidation.success) {
      return c.json(
        {
          error: "포인트가 부족합니다.",
          details: pointValidation.message,
          data: pointValidation.data,
        },
        402
      );
    }

    // Durable Object에 작업 제출
    const durableObjectId = c.env.SAJU_ANALYSIS_WORKER.idFromName(
      `user_${user.id}`
    );
    const durableObject = c.env.SAJU_ANALYSIS_WORKER.get(durableObjectId);

    const jobId = `job_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    const jobData = {
      userId: user.id,
      analysisType: body.analysisType || "compatibility",
      type: "compatibility",
      pointsCost: POINT_COSTS.COMPATIBILITY_ANALYSIS,
      reference,
      i18n: body.i18n || "ko",
      timezone: body.timezone || "Asia/Seoul",
      userPrompt: body.userPrompt,
      systemPrompt: body.systemPrompt,
      sajuData: body.sajuData,
      conversationHistory: body.conversationHistory,
      model: body.model || "gemini-2.5-flash",
      fortuneType: body.fortuneType,
    };

    // Durable Object에 작업 등록
    const response = await durableObject.fetch("http://localhost/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...jobData,
        jobId,
      }),
    });

    if (!response.ok) {
      // 실패 시 포인트 환불
      await refundPoints(
        c.env.DB,
        user.id,
        POINT_COSTS.COMPATIBILITY_ANALYSIS,
        "비동기 궁합 분석 작업 제출 실패로 인한 포인트 환불",
        `async_compatibility_analysis_refund_${Date.now()}`
      );

      const errorData = await response.json();
      return c.json(
        {
          error: "궁합 분석 작업 제출에 실패했습니다.",
          details: errorData.error || "Unknown error",
        },
        500
      );
    }

    // Queue에 작업 전송
    await c.env.analysis.send({
      ...jobData,
      jobId,
      durableObjectId: durableObjectId.toString(),
    });

    const result = await response.json();

    return c.json(
      {
        success: true,
        jobId: result.jobId,
        message: result.message,
        status: result.status,
        points: {
          deducted: POINT_COSTS.COMPATIBILITY_ANALYSIS,
          remaining: pointValidation.remainingPoints || null,
          message: pointValidation.message || null,
        },
        data: pointValidation.data,
      },
      200
    );
  } catch (error) {
    console.error("비동기 궁합 분석 API 오류:", error);
    return c.json(
      {
        error: "궁합 분석 작업을 처리하는 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * 비동기 연간운세 분석 API
 */
export async function AsyncYearlyFortuneAnalysis(
  c: Context
): Promise<Response> {
  const user = await getUserFromToken(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  try {
    const body: AsyncSajuAnalysisRequest = await c.req.json();

    // 포인트 검증
    const reference = `async_yearly_fortune_analysis_${Date.now()}`;
    const pointValidation = await usePoints(
      c.env.DB,
      user.id,
      POINT_COSTS.YEARLY_FORTUNE,
      `비동기 연간운세 분석 서비스 이용`,
      reference,
      undefined
    );

    if (!pointValidation.success) {
      return c.json(
        {
          error: "포인트가 부족합니다.",
          details: pointValidation.message,
          data: pointValidation.data,
        },
        402
      );
    }

    // Durable Object에 작업 제출
    const durableObjectId = c.env.SAJU_ANALYSIS_WORKER.idFromName(
      `user_${user.id}`
    );
    const durableObject = c.env.SAJU_ANALYSIS_WORKER.get(durableObjectId);

    const jobId = `job_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    const jobData = {
      userId: user.id,
      analysisType: body.analysisType || "yearly_fortune",
      type: "yearly_fortune",
      pointsCost: POINT_COSTS.YEARLY_FORTUNE,
      reference,
      i18n: body.i18n || "ko",
      timezone: body.timezone || "Asia/Seoul",
      userPrompt: body.userPrompt,
      systemPrompt: body.systemPrompt,
      sajuData: body.sajuData,
      conversationHistory: body.conversationHistory,
      model: "gemini-2.5-flash",
      fortuneType: body.fortuneType,
    };

    // Durable Object에 작업 등록
    const response = await durableObject.fetch("http://localhost/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...jobData,
        jobId,
      }),
    });

    if (!response.ok) {
      // 실패 시 포인트 환불
      await refundPoints(
        c.env.DB,
        user.id,
        POINT_COSTS.YEARLY_FORTUNE,
        "비동기 연간운세 분석 작업 제출 실패로 인한 포인트 환불",
        `async_yearly_fortune_analysis_refund_${Date.now()}`
      );

      const errorData = await response.json();
      return c.json(
        {
          error: "연간운세 분석 작업 제출에 실패했습니다.",
          details: errorData.error || "Unknown error",
        },
        500
      );
    }

    // Queue에 작업 전송
    await c.env.analysis.send({
      ...jobData,
      jobId,
      durableObjectId: durableObjectId.toString(),
    });

    const result = await response.json();

    return c.json(
      {
        success: true,
        jobId: result.jobId,
        message: result.message,
        status: result.status,
        points: {
          deducted: POINT_COSTS.YEARLY_FORTUNE,
          remaining: pointValidation.remainingPoints || null,
          message: pointValidation.message || null,
        },
        data: pointValidation.data,
      },
      200
    );
  } catch (error) {
    console.error("비동기 연간운세 분석 API 오류:", error);
    return c.json(
      {
        error: "연간운세 분석 작업을 처리하는 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}
