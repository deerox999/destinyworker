import { Context } from "hono";
import { createPrismaClient } from "../../../common/prismaUtils";
import { getUserFromToken } from "../../../common/utils";
import { getAnalysisTypePoints, refundPoints, usePoints } from "../../../common/paymentUtils";
import { buildFollowUpPrompts } from "./prompt/afterPrompt";
import { buildGeminiPayload } from "./utils";

class DurableObjectClient {
  constructor(private env: any, private userId: number) {}

  async createJob(jobData: any): Promise<{ success: boolean; jobId?: string; error?: string }> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const durableObjectId = this.env.SAJU_ANALYSIS_WORKER.idFromName(`user_${this.userId}_${jobId}`);
    const durableObject = this.env.SAJU_ANALYSIS_WORKER.get(durableObjectId);
    try {
      const response = await durableObject.fetch("http://localhost/jobs/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...jobData, jobId }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.error || "Unknown error" };
      }
      const result = await response.json();
      return { success: true, jobId: result.jobId };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }
}

export async function FollowUpAnalysisSaju(c: Context): Promise<Response> {
  const user = await getUserFromToken(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  try {
    const body = await c.req.json<{
      options?: { followUpOfAnalysisId?: number; userQuestion?: string };
    }>();

    const options = body.options || {};
    const followUpId = options.followUpOfAnalysisId;
    const userQuestion = (options.userQuestion || "").trim();

    if (!followUpId) {
      return c.json({ error: "followUpOfAnalysisId는 필수입니다." }, 400);
    }
    if (!userQuestion) {
      return c.json({ error: "userQuestion은 필수입니다." }, 400);
    }

    // 이전 분석 상속값 조회
    const prisma = createPrismaClient(c.env.DB);
    const previous = await prisma.sajuAnalysis.findFirst({
      where: { id: followUpId, userId: user.id },
      select: {
        userPrompt: true,
        aiResponse: true,
        analysisType: true,
        type: true,
        i18n: true,
        timezone: true,
        modelUsed: true,
      },
    });
    await prisma.$disconnect();

    if (!previous) {
      return c.json({ error: "이전 분석을 찾을 수 없습니다." }, 404);
    }

    const analysisType = previous.analysisType || "종합운세";
    const type = previous.type || "individual";
    const i18n = previous.i18n || "ko";
    const timezone = previous.timezone || "Asia/Seoul";
    const inheritedModel = previous.modelUsed || "gemini-2.5-flash";

    // 대화 히스토리: 직전 2턴
    const conversationHistory = [
      { role: "user", parts: [{ text: previous.userPrompt || "" }] },
      { role: "model", parts: [{ text: previous.aiResponse || "" }] },
    ];

    // 포인트 비용 계산: 동일 모델 기준 정상가의 50%
    const basePrice = getAnalysisTypePoints(analysisType);
    const modelFactor = inheritedModel.includes("pro") ? 1.5 : 1;
    const pointsCost = Math.round(basePrice * modelFactor * 0.5);

    // 포인트 차감
    const reference = `analysis_saju_followup_${Date.now()}`;
    const pointValidation = await usePoints(
      c.env.DB,
      user.id,
      pointsCost,
      `사주 재질문 서비스 이용 (${type})`,
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

    // 재질문 전용 프롬프트 생성
    const { systemPrompt, userPrompt } = buildFollowUpPrompts({
      language: (i18n as any) || "ko",
      tone: "전문적인",
      understandingLevel: "중수",
      userContext: undefined,
      userQuestion,
    });

    const model = inheritedModel;

    // DO 잡 생성
    const doClient = new DurableObjectClient(c.env, user.id);
    const jobData = {
      userId: user.id,
      analysisType,
      type,
      pointsCost,
      reference,
      i18n,
      timezone,
      userPrompt,
      systemPrompt, // 기존 시스템 프롬프트는 사용하지 않음(재질문 전용 프롬프트만 사용)
      sajuData: undefined,
      model,
      conversationHistory,
      followUpMode: true,
    };

    // 디버그용: 실제 AI에 전달될 payload 미리보기 구성
    const payloadPreview = buildGeminiPayload({
      ...jobData,
      // 타입 일치 위해 불필요 속성 제거/유지 무관
    } as any);

    const createResult = await doClient.createJob(jobData);
    if (!createResult.success) {
      await refundPoints(
        c.env.DB,
        user.id,
        pointsCost,
        `사주 재질문 작업 제출 실패로 인한 포인트 환불 (${type})`,
        `analysis_saju_followup_refund_${Date.now()}`
      );
      return c.json(
        {
          error: "재질문 작업 제출에 실패했습니다.",
          details: createResult.error || "Unknown error",
        },
        500
      );
    }

    // 디버그용 프롬프트 반환 포함
    return c.json(
      {
        success: true,
        jobId: createResult.jobId,
        message: "재질문 작업이 등록되었습니다. 처리 대기 중입니다.",
        status: "pending",
        points: {
          deducted: pointsCost,
          remaining: pointValidation.remainingPoints || null,
          message: pointValidation.message || null,
        },
        debugPrompts: {
          model,
          systemPrompt,
          userPrompt,
          // conversationHistory,
          payloadPreview: {
            model: payloadPreview.model,
            contents: payloadPreview.contents,
          },
          // previous: {
          //   userPrompt: previous.userPrompt,
          //   aiResponse: previous.aiResponse,
          // },
        },
      },
      200
    );
  } catch (error) {
    console.error("Follow-up 사주 분석 API 오류:", error);
    return c.json(
      {
        error: "재질문 작업을 처리하는 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}


