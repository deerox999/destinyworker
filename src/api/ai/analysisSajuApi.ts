/**
 * 통합 사주 분석 API 작동 흐름
 * 
 * 1. 사용자 요청 → API 엔드포인트
 *    - POST /api/ai/analysis (통합 사주 분석)
 *    - type 파라미터로 분석 유형 구분:
 *      - "individual": 일반 사주 분석
 *      - "compatibility": 궁합 분석  
 *      - "yearly_fortune": 연간운세 분석
 * 
 * 2. 인증 및 검증
 *    - JWT 토큰으로 사용자 인증
 *    - 필수 필드 검증 (sajuData 등)
 *    - 궁합 분석의 경우 person1, person2 데이터 검증
 * 
 * 3. 포인트 차감
 *    - 분석 타입에 따른 포인트 비용 결정
 *    - usePoints() 함수로 포인트 차감
 *    - 실패 시 즉시 402 에러 반환
 * 
 * 4. 서버에서 프롬프트 생성
 *    - 프론트엔드에서 받은 파라미터로 안전하게 프롬프트 생성
 *    - 모델 관련 설정은 서버에서 고정값 사용
 * 
 * 5. Durable Object 작업 등록
 *    - 사용자별 고유 Durable Object 생성/접근
 *    - 작업 정보를 Durable Object에 등록
 *    - jobId 생성 및 작업 상태를 'pending'으로 설정
 * 
 * 6. Queue 작업 전송
 *    - Cloudflare Queue에 분석 작업 전송
 *    - 백그라운드에서 Queue Consumer가 처리
 * 
 * 7. 즉시 응답
 *    - jobId와 함께 성공 응답 반환
 *    - 사용자는 jobId로 상태 조회 가능
 * 
 * 8. 백그라운드 처리 (Queue Consumer)
 *    - Gemini API 호출
 *    - AI 분석 결과 생성
 *    - DB에 분석 결과 저장
 *    - Durable Object 상태 업데이트
 * 
 * 9. 상태 조회
 *    - GET /api/ai/analysis/status?jobId=xxx
 *    - Durable Object에서 작업 상태 조회
 *    - pending → processing → completed/failed
 * 
 * 10. 에러 처리
 *    - 각 단계별 실패 시 포인트 환불
 *    - 상세한 에러 메시지 제공
 * 
 * 주요 특징:
 * - 통합 API: 하나의 엔드포인트로 모든 분석 유형 처리
 * - 즉시 응답: 사용자는 jobId를 받고 대기
 * - 비동기 처리: Queue를 통한 안정적인 백그라운드 처리
 * - 상태 추적: Durable Object로 작업 상태 관리
 * - 자동 저장: 완료된 분석은 DB에 자동 저장
 * - 포인트 관리: 실패 시 자동 환불 처리
 * - 안전한 프롬프트 생성: 서버에서 프롬프트 생성으로 조작 방지
 */

import { Context } from "hono";
import { getUserFromToken } from "../../common/utils";
import { usePoints, refundPoints } from "../../common/paymentUtils";
import { POINT_COSTS } from "../../common/paymentUtils";
import { 
  generateAnalysisPrompts, 
  generateCompatibilityPrompts,
  type 분석관점,
  type 이해도레벨,
  type 분석요소
} from "./prompt/geminiPrompt";

// API 사용자가 보내는 요청 본문 타입 정의 (안전한 파라미터만 허용)
interface AnalysisSajuRequest {
  // 사주 데이터 (필수)
  sajuData: any;
  
  // 분석 설정
  analysisType?: string; // '종합운세', '대운', '연애', '직업', '사업' 등
  type?: string; // 'individual', 'compatibility', 'yearly_fortune'
  
  // 프롬프트 생성 파라미터
  해설유형?: string; // '대운', '연애', '직업', '사업' 등
  궁합유형?: string; // '연인궁합', '부부궁합', '친구궁합' 등
  사용자질문?: string; // 사용자 추가 질문
  톤옵션?: 분석관점; // '현실적', '약간긍정', '약간부정'
  타겟년도?: number; // 연간운세용
  이해도레벨?: 이해도레벨; // '초보', '중수', '전문가'
  선택된분석요소?: 분석요소[]; // ['십성', '신살', '십이신살']
  
  // 기타 설정
  i18n?: string; // 언어 설정
  timezone?: string; // 시간대 설정
  stream?: boolean; // 스트리밍 여부
  conversationHistory?: any[]; // 대화 히스토리
}

// 서버에서 고정할 모델 설정
const SERVER_MODEL_CONFIG = {
  // 생성 설정 (고정값)
  generationConfig: {
    temperature: 0.4,
    topP: 0.4,
    topK: 40,
    maxOutputTokens: 65535
  },
  
  // 안전 설정 (고정값)
  safetySettings: [
    {
      category: "HARM_CATEGORY_HARASSMENT",
      threshold: "BLOCK_MEDIUM_AND_ABOVE"
    },
    {
      category: "HARM_CATEGORY_HATE_SPEECH",
      threshold: "BLOCK_MEDIUM_AND_ABOVE"
    }
  ]
};

/**
 * 서버에서 안전하게 프롬프트 생성
 */
function generateServerPrompts(
  request: AnalysisSajuRequest,
  type: string
): { systemPrompt: string; userPrompt: string; model: string } {
  const {
    해설유형 = "대운",
    궁합유형 = "연인궁합",
    사용자질문 = "",
    톤옵션 = "현실적",
    타겟년도,
    이해도레벨 = "중수",
    선택된분석요소 = [],
    i18n = "ko",
    stream = false
  } = request;

  let prompts: { systemPrompt: string; userPrompt: string };
  let model: string;

  // stream 파라미터에 따라 모델 선택
  const baseModel = stream ? "gemini-2.5-flash" : "gemini-2.5-pro";

  if (type === "compatibility") {
    // 궁합 분석
    prompts = generateCompatibilityPrompts(
      i18n,
      궁합유형,
      사용자질문,
      톤옵션,
      이해도레벨,
      선택된분석요소
    );
    model = baseModel;
  } else if (type === "yearly_fortune") {
    // 연간운세 분석
    prompts = generateAnalysisPrompts(
      i18n,
      해설유형,
      사용자질문,
      톤옵션,
      타겟년도,
      이해도레벨,
      선택된분석요소
    );
    model = baseModel;
  } else {
    // 일반 분석
    prompts = generateAnalysisPrompts(
      i18n,
      해설유형,
      사용자질문,
      톤옵션,
      타겟년도,
      이해도레벨,
      선택된분석요소
    );
    model = baseModel;
  }

  return {
    systemPrompt: prompts.systemPrompt,
    userPrompt: prompts.userPrompt,
    model
  };
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

    // 분석 타입 결정 및 검증
    const type = body.type || "individual";
    
    // 궁합 분석의 경우 추가 검증
    if (type === "compatibility") {
      if (!body.sajuData.person1 || !body.sajuData.person2) {
        return c.json(
          {
            error: "궁합 분석을 위해서는 두 사람의 사주 데이터가 필요합니다.",
            details: "sajuData에 person1과 person2가 포함되어야 합니다.",
          },
          400
        );
      }
    }

    // 분석 타입에 따른 포인트 비용 결정
    const analysisType = body.analysisType || "general";
    let pointsCost: number = POINT_COSTS.SAJU_ANALYSIS;

    if (type === "compatibility") {
      pointsCost = POINT_COSTS.COMPATIBILITY_ANALYSIS;
    } else if (type === "yearly_fortune") {
      pointsCost = POINT_COSTS.YEARLY_FORTUNE;
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
    const { systemPrompt, userPrompt, model } = generateServerPrompts(body, type);
    // Durable Object에 작업 제출
    const durableObjectId = c.env.SAJU_ANALYSIS_WORKER.idFromName(`user_${user.id}`);
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
      userPrompt,
      systemPrompt,
      sajuData: body.sajuData,
      conversationHistory: body.conversationHistory,
      model,
      generationConfig: SERVER_MODEL_CONFIG.generationConfig,
      safetySettings: SERVER_MODEL_CONFIG.safetySettings,
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
    if (body.stream) {
      // 스트리밍 응답 처리
      const streamResponse = await durableObject.fetch("http://localhost/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...jobData,
          jobId,
        }),
      });

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
      headers.set(
        "X-Points-Remaining",
        pointValidation.remainingPoints?.toString() || "0"
      );

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
            durableObjectId: durableObjectId.toString(),
          });
          console.log(`[Queue] 작업 전송 성공: ${jobId}`);
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
export async function GetAnalysisSajuStatus(
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
