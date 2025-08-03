import { Context } from "hono";
import {
  getAnalysisTypePoints,
  refundPoints,
  usePoints,
} from "../../../common/paymentUtils";
import { getUserFromToken } from "../../../common/utils";
import {
  generateAnalysisPrompts,
  generateCompatibilityPrompts,
  type PromptParams,
  type 분석관점,
  type 분석요소,
  type 이해도레벨,
} from "./prompt/geminiPrompt";
import { SERVER_MODEL_CONFIG } from "./utils";

// API 사용자가 보내는 요청 본문 타입 정의 (안전한 파라미터만 허용)
interface AnalysisSajuRequest {
  // 사주 데이터 (필수)
  sajuData: any;

  // 분석 옵션
  options?: {
    // 분석 설정
    analysisType?: string; // '종합운세', '대운', '연애', '직업', '사업', '연간운세' 등
    type?: string; // 'individual', 'compatibility'

    // 프롬프트 생성 파라미터
    userQuestion?: string; // 사용자 추가 질문
    userContext?: string; // 사용자 맥락정보
    toneOption?: 분석관점; // '현실적', '약간긍정', '약간부정'
    targetYear?: number; // 연간운세용
    understandingLevel?: 이해도레벨; // '초보', '중수', '전문가'
    selectedAnalysisElements?: 분석요소[]; // ['십성', '신살', '십이신살']

    // 기타 설정
    i18n?: string; // 언어 설정
    timezone?: string; // 시간대 설정
    stream?: boolean; // 스트리밍 여부
  };
}

/**
 * 서버에서 안전하게 프롬프트 생성
 */
function generateServerPrompts(
  request: AnalysisSajuRequest,
  type: string,
  user: any,
  c: Context
): { systemPrompt: string; userPrompt: string; model: string } {
  const options = request.options || {};
  const {
    analysisType,
    userQuestion = "",
    userContext = "",
    toneOption = "현실적",
    targetYear,
    understandingLevel = "중수",
    selectedAnalysisElements = [],
    i18n = "ko",
    stream = false,
  } = options;
  let baseModel = ""; // stream 파라미터에 따라 모델 선택
  
  // 통합된 파라미터 객체 생성
  const promptParams: PromptParams = {
    language: i18n,
    해설유형: analysisType,
    사용자질문: userQuestion,
    사용자맥락정보: userContext,
    톤옵션: toneOption,
    타겟년도: targetYear,
    이해도레벨: understandingLevel,
    선택된분석요소: selectedAnalysisElements,
    user,
  };

  let prompts: { systemPrompt: string; userPrompt: string };
  if (type === "compatibility") {
    prompts = generateCompatibilityPrompts(promptParams);
  } else {
    prompts = generateAnalysisPrompts(promptParams);
  }

  if (stream) {
    baseModel = "gemini-2.5-flash";
  } else {
    /* 
      524 오류 관련해서 해결할 수 없음. DNS 프록시 꺼봐도 안됨. (api2.youram.me)
      엔터프라이즈를 쓰면 된다고 하는데, 200달러 이상이라, 현 시점에서는 무리임.
    */
    if (c.env.ENVIRONMENT === "development") {
      baseModel = "gemini-2.5-pro";
    } else {
      baseModel = "gemini-2.5-flash";
    }
  }

  const result = {
    systemPrompt: prompts.systemPrompt,
    userPrompt: prompts.userPrompt,
    model: baseModel,
  };

  if (c.env.ENVIRONMENT === "development") {
    console.log("promptParams", promptParams);
    console.log("systemPrompt", result.systemPrompt);
    console.log("userPrompt", result.userPrompt);
  }
  return result;
}

/**
 * 통합 사주 분석 API - 모든 분석 유형을 하나의 엔드포인트로 처리
 */
export async function AnalysisSaju(c: Context): Promise<Response> {
  const user = await getUserFromToken(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }
  try {
    const body: AnalysisSajuRequest = await c.req.json();
    // 필수 필드 검증
    if (!body.sajuData) {
      return c.json({ error: "sajuData는 필수입니다." }, 400);
    }

    const options = body.options || {};

    // 분석 타입 결정 및 검증
    const type = options.type || "individual";

    // 궁합 분석의 경우 추가 검증
    if (type === "compatibility") {
      if (!body.sajuData.person1 || !body.sajuData.person2) {
        return c.json(
          {
            error:
              "궁합 분석을 위해서는 person1과 person2 데이터가 필요합니다.",
            details: "sajuData에 person1과 person2가 포함되어야 합니다.",
          },
          400
        );
      }
    }

    // 분석 타입에 따른 포인트 비용 결정
    const analysisType = options.analysisType || "종합운세";
    let pointsCost = getAnalysisTypePoints(analysisType);

    // streaming이 false일 때 (더 비싼 모델 사용) 포인트 가격을 1.5배로 조정
    if (!options.stream) {
      pointsCost = Math.round(pointsCost * 1.5);
    }

    // 포인트 검증
    const reference = `analysis_saju_${type}_${Date.now()}`;
    const pointValidation = await usePoints(
      c.env.DB,
      user.id,
      pointsCost,
      `사주 분석 서비스 이용 (${type})`,
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

    // 서버에서 안전하게 프롬프트 생성
    const { systemPrompt, userPrompt, model } = generateServerPrompts(
      body,
      type,
      user,
      c
    );

    const jobId = `job_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // Durable Object에 작업 제출 - jobId를 포함하여 고유한 Durable Object 생성
    const durableObjectId = c.env.SAJU_ANALYSIS_WORKER.idFromName(
      `user_${user.id}_${jobId}`
    );
    const durableObject = c.env.SAJU_ANALYSIS_WORKER.get(durableObjectId);

    const jobData = {
      userId: user.id,
      analysisType,
      type,
      pointsCost,
      reference,
      i18n: options.i18n || "ko",
      timezone: options.timezone || "Asia/Seoul",
      userPrompt,
      systemPrompt,
      sajuData: body.sajuData,
      model,
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
        `사주 분석 작업 제출 실패로 인한 포인트 환불 (${type})`,
        `analysis_saju_${type}_refund_${Date.now()}`
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

    // 스트리밍 요청인지 확인
    if (options.stream) {
      // 스트리밍 응답 처리
      const streamResponse = await durableObject.fetch(
        "http://localhost/stream",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...jobData,
            jobId,
          }),
        }
      );

      if (!streamResponse.ok) {
        // 실패 시 포인트 환불
        await refundPoints(
          c.env.DB,
          user.id,
          pointsCost,
          `스트리밍 분석 작업 제출 실패로 인한 포인트 환불 (${type})`,
          `analysis_saju_${type}_stream_refund_${Date.now()}`
        );

        const errorData = await streamResponse.json();
        return c.json(
          {
            error: "스트리밍 분석 작업 제출에 실패했습니다.",
            details: errorData.error || "Unknown error",
          },
          500
        );
      }

      // 스트리밍 응답 반환
      const headers = new Headers();
      headers.set("Content-Type", "text/event-stream; charset=utf-8");
      headers.set("Cache-Control", "no-cache");
      headers.set("Connection", "keep-alive");
      headers.set("X-AI-Model", model);
      headers.set("X-Points-Deducted", pointsCost.toString());
      headers.set("X-Points-Remaining", pointValidation.remainingPoints?.toString() || "0");

      return new Response(streamResponse.body, {
        status: 200,
        headers: headers,
      });
    } else {
      // 비동기 처리 (기존 방식)
      // Queue가 있는 경우에만 전송
      if (c.env.QUEUE) {
        try {
          await c.env.QUEUE.send({
            ...jobData,
            jobId,
            useProcessBackground: true, // 신규 방식 사용 (기본값)
            // durableObjectId 제거 - Queue Consumer에서 직접 처리
          });
          console.log(`[Queue] 작업 전송 성공: ${jobId} (신규 방식)`);
        } catch (queueError) {
          console.error("[Queue] 전송 실패:", queueError);
          // Queue 실패 시에도 작업은 등록되었으므로 계속 진행
          // 하지만 사용자에게 알림
          console.warn(`[Queue] Queue 전송 실패했지만 작업은 등록됨: ${jobId}`);
        }
      } else {
        console.warn("[Queue] QUEUE가 설정되지 않음");
      }

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
    }
  } catch (error) {
    console.error("통합 사주 분석 API 오류:", error);
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
 * 사주 분석 작업 상태 조회 API
 */
export async function GetAnalysisSajuStatus(c: Context): Promise<Response> {
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
    console.error("사주 분석 상태 조회 오류:", error);
    return c.json(
      {
        error: "작업 상태를 조회하는 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}
