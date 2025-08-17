import { Context } from "hono";
import {
  getAnalysisTypePoints,
  refundPoints,
  usePoints,
} from "../../../common/paymentUtils";
import { createPrismaClient, isAdmin } from "../../../common/prismaUtils";
import { getUserFromToken } from "../../../common/utils";
import {
  PromptParams,
  분석관점,
  분석요소,
  어조,
  이해도레벨
} from "./prompt/commonPrompt";
import {
  generateAnalysisPrompts,
  generateCompatibilityPrompts,
} from "./prompt/geminiPrompt";
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
    profileId?: number; // 프로필 ID (선택적 - 분석 후 해당 프로필의 context 업데이트용)
    analysisStyle?: 분석관점; // '현실적', '약간긍정', '약간부정'
    understandingLevel?: 이해도레벨; // '초보', '중수', '전문가'
    selectedAnalysisElements?: 분석요소[]; // ['십성', '신살', '십이신살']

    // 기타 설정
    i18n?: string; // 언어 설정
    timezone?: string; // 시간대 설정
    highQuality?: boolean; // 고품질 분석 여부 (모델 pro 사용)
    isDevelop?: boolean; // 개발자 모드 (특별추가질문 활성화)
    responseStyle?: 어조; // 응답 어조: '유쾌한' | '전문적인' | '상냥한'
    // 완료 후 후처리 목적지(선택) - 자동 반영 모드
    destination?: {
      type: "celebrityTranslation"; // 확장 가능성 고려해 유니온 시작
      celebrityId: string;
      languageCode: string; // i18n과 동일하게 사용 가능
    };
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
    analysisStyle = "현실적",
    understandingLevel = "중수",
    selectedAnalysisElements = [],
    i18n = "ko",
    highQuality = false,
    isDevelop = false,
    responseStyle = "전문적인",
  } = options;
  let baseModel = ""; // highQuality 파라미터에 따라 모델 선택

  // 통합된 파라미터 객체 생성
  const promptParams: PromptParams = {
    language: i18n,
    해설유형: analysisType,
    사용자질문: userQuestion,
    사용자맥락정보: userContext,
    분석관점: analysisStyle,
    이해도레벨: understandingLevel,
    선택된분석요소: selectedAnalysisElements,
    어조옵션: responseStyle,
    user,
    isDevelop,
    highQuality,
  };

  let prompts: { systemPrompt: string; userPrompt: string };
  if (type === "compatibility") {
    prompts = generateCompatibilityPrompts(promptParams);
  } else {
    prompts = generateAnalysisPrompts(promptParams);
  }

  // 환경과 무관하게 highQuality만으로 모델 선택
  baseModel = highQuality ? "gemini-2.5-pro" : "gemini-2.5-flash";

  const result = {
    systemPrompt: prompts.systemPrompt,
    userPrompt: prompts.userPrompt,
    model: baseModel,
  };

  if (c.env.ENVIRONMENT === "development") {
    // console.log("promptParams", promptParams);
    // console.log("systemPrompt", result.systemPrompt);
    // console.log("userPrompt", result.userPrompt);
  }
  return result;
}

/**
 * Durable Object와의 통신을 담당하는 헬퍼 함수
 */
class DurableObjectClient {
  constructor(
    private env: any,
    private userId: number
  ) {}

  /**
   * Job 생성
   */
  async createJob(
    jobData: any
  ): Promise<{ success: boolean; jobId?: string; error?: string }> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const durableObjectId = this.env.SAJU_ANALYSIS_WORKER.idFromName(
      `user_${this.userId}_${jobId}`
    );
    const durableObject = this.env.SAJU_ANALYSIS_WORKER.get(durableObjectId);

    try {
      const response = await durableObject.fetch(
        "http://localhost/jobs/create",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...jobData, jobId }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.error || "Unknown error" };
      }

      const result = await response.json();
      return { success: true, jobId: result.jobId };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Job 상태 조회
   */
  async getJobStatus(
    jobId: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const durableObjectId = this.env.SAJU_ANALYSIS_WORKER.idFromName(
      `user_${this.userId}_${jobId}`
    );
    const durableObject = this.env.SAJU_ANALYSIS_WORKER.get(durableObjectId);

    try {
      const response = await durableObject.fetch(
        `http://localhost/jobs/status?jobId=${jobId}`,
        { method: "GET" }
      );

      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.error || "Unknown error" };
      }

      const result = await response.json();
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * 스트리밍 처리
   */
  async startStreaming(jobData: any): Promise<Response> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const durableObjectId = this.env.SAJU_ANALYSIS_WORKER.idFromName(
      `user_${this.userId}_${jobId}`
    );
    const durableObject = this.env.SAJU_ANALYSIS_WORKER.get(durableObjectId);

    try {
      const response = await durableObject.fetch(
        "http://localhost/jobs/stream",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...jobData, jobId }),
        }
      );

      return response;
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: "스트리밍 시작 실패",
          details: error instanceof Error ? error.message : "Unknown error",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }
}

/**
 * 프로필의 context를 업데이트하는 헬퍼 함수
 */
async function updateProfileContext(
  env: any,
  userId: number,
  profileId?: number,
  userContext?: string
): Promise<void> {
  if (!profileId || !userContext) return;
  try {
    const prisma = createPrismaClient(env.DB);

    // 해당 프로필이 사용자 소유인지 확인 후 업데이트
    await prisma.sajuProfile.updateMany({
      where: {
        id: profileId,
        userId: userId,
      },
      data: {
        context: userContext,
      },
    });
    await prisma.$disconnect();
  } catch (error) {
    console.error("프로필 context 업데이트 실패:", error);
  }
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
    const options = body.options || {};
    const type = options.type || "individual";

    // 필수 필드 검증
    if (!body.sajuData) {
      return c.json({ error: "sajuData는 필수입니다." }, 400);
    }

    // 궁합 분석의 경우 추가 검증
    if (type === "compatibility") {
      if (body.sajuData.length < 2) {
        return c.json(
          {
            error:
              "궁합 분석을 위해서는 최소 2명 이상의 데이터가 필요합니다.",
            details: "sajuData에 최소 2명 이상의 데이터가 포함되어야 합니다.",
          },
          400
        );
      }
    }

    // 분석 타입에 따른 포인트 비용 결정
    const analysisType = options.analysisType || "종합운세";
    let pointsCost = getAnalysisTypePoints(analysisType);

    // highQuality(true → pro 모델 사용)일 때 포인트 가격을 1.5배로 조정
    if (options.highQuality) {
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

    // 서버에서 안전하게 프롬프트 생성 (초기 분석 전용)
    const { systemPrompt, userPrompt, model } = generateServerPrompts(
      body,
      type,
      user,
      c
    );

    // Durable Object 클라이언트 생성
    const doClient = new DurableObjectClient(c.env, user.id);

    // 항상 백그라운드 잡 생성 방식으로 처리
    // 목적지(destination)는 관리자만 허용
    let safeDestination = options.destination;
    if (options.destination) {
      const admin = await isAdmin(c);
      if (!admin) {
        safeDestination = undefined; // 비관리자는 목적지 반영 금지
      }
    }
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
      destination: safeDestination,
      // 최초 요청 options 원본 저장용
      optionsJson: JSON.stringify(options || {}),
    };

    // Job 생성
    const createResult = await doClient.createJob(jobData);

    if (!createResult.success) {
      // 실패 시 포인트 환불
      await refundPoints(
        c.env.DB,
        user.id,
        pointsCost,
        `사주 분석 작업 제출 실패로 인한 포인트 환불 (${type})`,
        `analysis_saju_${type}_refund_${Date.now()}`
      );

      return c.json(
        {
          error: "분석 작업 제출에 실패했습니다.",
          details: createResult.error || "Unknown error",
        },
        500
      );
    }

    // 궁합이 아닐경우에만, 프로필 업데이트를 병렬로 처리 (응답에 영향 없음)
    if (options.type !== 'compatibility') {
      updateProfileContext(
        c.env,
        user.id,
        options.profileId,
        options.userContext
      );
    }

    return c.json(
      {
        success: true,
        jobId: createResult.jobId,
        message: "분석 작업이 등록되었습니다. 처리 대기 중입니다.",
        status: "pending",
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

    // Durable Object 클라이언트 생성
    const doClient = new DurableObjectClient(c.env, user.id);
    const statusResult = await doClient.getJobStatus(jobId);

    if (!statusResult.success) {
      return c.json(
        {
          error: "작업 상태 조회에 실패했습니다.",
          details: statusResult.error || "Unknown error",
        },
        500
      );
    }

    return c.json(
      {
        success: true,
        jobId: statusResult.data.jobId,
        status: statusResult.data.status,
        createdAt: statusResult.data.createdAt,
        result: statusResult.data.result,
        error: statusResult.data.error,
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
