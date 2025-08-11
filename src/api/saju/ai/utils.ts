import { createPrismaClient } from "../../../common/prismaUtils";

// 공통 모델 설정
export const SERVER_MODEL_CONFIG = {
  // 생성 설정 (고정값)
  generationConfig: {
    temperature: 0.4,
    topP: 0.4,
    topK: 40,
    maxOutputTokens: 39999,
  },

  // 안전 설정 (고정값)
  safetySettings: [
    {
      category: "HARM_CATEGORY_HARASSMENT",
      threshold: "BLOCK_MEDIUM_AND_ABOVE",
    },
    {
      category: "HARM_CATEGORY_HATE_SPEECH",
      threshold: "BLOCK_MEDIUM_AND_ABOVE",
    },
    {
      category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
      threshold: "BLOCK_MEDIUM_AND_ABOVE",
    },
    {
      category: "HARM_CATEGORY_DANGEROUS_CONTENT",
      threshold: "BLOCK_MEDIUM_AND_ABOVE",
    },
  ],
};

// 언어별 시스템 프롬프트
export const LANGUAGE_PROMPTS: { [key: string]: string } = {
  en: "You are a professional fortune teller and astrologer. Please provide detailed and friendly fortune analysis based on the user's birth chart information.",
  ja: "あなたは専門の占い師・占星術師です。ユーザーの生年月日情報に基づいて、詳細で親切な運勢分析を提供してください。",
  zh: "您是一位专业的算命师和占星师。请根据用户的生辰八字信息提供详细而友好的运势分析。",
  vi: "Bạn là một nhà chiêm tinh và thầy bói chuyên nghiệp. Vui lòng cung cấp phân tích vận mệnh chi tiết và thân thiện dựa trên thông tin lá số tử vi của người dùng.",
};

// 메시지 타입
export interface SajuAnalysisMessage {
  jobId: string;
  userId: number;
  analysisType: string;
  type: string;
  pointsCost: number;
  reference: string;
  i18n: string;
  timezone: string;
  userPrompt: string;
  systemPrompt?: string;
  sajuData?: any;
  conversationHistory?: any[];
  model: string;
  fortuneType?: string;
  // 완료 후 후처리 목적지(선택)
  destination?: {
    type: "celebrityTranslation";
    celebrityId: string;
    languageCode: string;
  };
  // 신규 추가 속성들
  useProcessBackground?: boolean; // 테스트용 플래그
  analysisId?: number; // DB 분석 ID (업데이트용)
}

// 분석 작업 상태
export interface AnalysisJob {
  id: string;
  userId: number;
  analysisType: string;
  type: string;
  pointsCost: number;
  reference: string;
  i18n: string;
  timezone: string;
  userPrompt: string;
  systemPrompt?: string;
  sajuData?: any;
  conversationHistory?: any[];
  model: string;
  fortuneType?: string;
  // 완료 후 후처리 목적지(선택)
  destination?: {
    type: "celebrityTranslation";
    celebrityId: string;
    languageCode: string;
  };
  createdAt: string;
  status: "pending" | "processing" | "completed" | "failed";
  result?: any;
  error?: string;
  analysisId?: number;
}

/**
 * Gemini API 요청 페이로드 생성
 */
export function buildGeminiPayload(
  message: SajuAnalysisMessage | AnalysisJob
): any {
  const contents: any[] = [];

  // 시스템 프롬프트 구성
  let systemPrompt =
    message.systemPrompt ||
    "당신은 전문 사주명리학자입니다. 사용자의 사주 정보를 바탕으로 상세하고 친절하게 운세를 분석해주세요.";

  if (message.i18n && message.i18n !== "ko") {
    systemPrompt =
      message.systemPrompt || LANGUAGE_PROMPTS[message.i18n] || systemPrompt;
  }

  // 사주 데이터 추가
  if (message.sajuData) {
    if (message.sajuData.person1 && message.sajuData.person2) {
      contents.push({
        role: "user",
        parts: [
          {
            text: `궁합 분석용 사주 데이터:\n${JSON.stringify(message.sajuData.person1)}\n${JSON.stringify(message.sajuData.person2)}`,
          },
        ],
      });
    } else {
      contents.push({
        role: "user",
        parts: [
          { text: `사주 데이터: ${JSON.stringify(message.sajuData)}` },
        ],
      });
    }
  }

  // 대화 기록 추가
  if (message.conversationHistory && message.conversationHistory.length > 0) {
    contents.push(...message.conversationHistory);
  }

  // 현재 사용자 프롬프트와 시스템 프롬프트 합치기
  const combinedPrompt = `${systemPrompt}\n\n${message.userPrompt}`;
  contents.push({
    role: "user",
    parts: [{ text: combinedPrompt }],
  });

  // SERVER_MODEL_CONFIG를 직접 사용
  return {
    model: message.model,
    contents,
    generationConfig: SERVER_MODEL_CONFIG.generationConfig,
    safetySettings: SERVER_MODEL_CONFIG.safetySettings,
  };
}

/**
 * 제목 생성 함수
 */
export function generateTitle(
  message: SajuAnalysisMessage | AnalysisJob
): string {
  let title = `[${message.analysisType}]`;

  if (message.fortuneType) {
    title = `[${getFortuneTypeTitle(message.fortuneType)}]`;
  }

  if (message.sajuData) {
    if (
      message.sajuData.정보 &&
      message.sajuData.정보.생년월일 &&
      message.sajuData.정보.생년월일.이름
    ) {
      title += ` ${message.sajuData.정보.생년월일.이름}님`;
    } else if (
      message.sajuData.person1 &&
      message.sajuData.person1.정보 &&
      message.sajuData.person1.정보.생년월일 &&
      message.sajuData.person1.정보.생년월일.이름
    ) {
      title += ` ${message.sajuData.person1.정보.생년월일.이름}님`;
      if (
        message.sajuData.person2 &&
        message.sajuData.person2.정보 &&
        message.sajuData.person2.정보.생년월일 &&
        message.sajuData.person2.정보.생년월일.이름
      ) {
        title += ` & ${message.sajuData.person2.정보.생년월일.이름}님`;
      }
    }
  }

  return title;
}

/**
 * 운세 유형에 따른 제목 생성 헬퍼 함수
 */
export function getFortuneTypeTitle(fortuneType: string): string {
  switch (fortuneType) {
    case "this_year":
      return "올해운세";
    case "next_year":
      return "내년운세";
    default:
      return "연간운세";
  }
}

/**
 * 응답 타입 결정 함수
 */
export function getResponseType(type: string): string {
  switch (type) {
    case "compatibility":
      return "compatibility_analysis";
    default:
      return "text";
  }
}

/**
 * 사주 분석 초기 데이터를 DB에 저장하는 함수 (분석 시작 시)
 */
export async function saveSajuAnalysisInitial(
  message: SajuAnalysisMessage | AnalysisJob,
  title: string,
  analysisStartedAt: Date,
  env: any
): Promise<{ success: boolean; analysisId?: number; error?: string }> {
  const prisma = createPrismaClient(env.DB);
  try {
    let birthData = null;
    if (message.sajuData) {
      if (message.sajuData.정보 && message.sajuData.정보.생년월일) {
        birthData = message.sajuData.정보.생년월일;
      } else if (
        message.sajuData.person1 &&
        message.sajuData.person1.정보 &&
        message.sajuData.person1.정보.생년월일
      ) {
        birthData = {
          person1: message.sajuData.person1.정보.생년월일,
          person2: message.sajuData.person2?.정보?.생년월일 || null,
        };
      }
    }

    const analysis = await prisma.sajuAnalysis.create({
      data: {
        userId: message.userId,
        analysisType: message.analysisType,
        type: message.type,
        title: title,
        sajuData: JSON.stringify(birthData),
        userPrompt: message.userPrompt,
        systemPrompt: message.systemPrompt || null,
        aiResponse: "분석 중... 처리중이오니, 잠시만 기다려주세요.", // 초기값
        modelUsed: message.model,
        pointsSpent: message.pointsCost,
        i18n: message.i18n,
        timezone: message.timezone,
        analysisStartedAt: analysisStartedAt,
        analysisCompletedAt: null, // 완료 시 업데이트
      },
    });

    return {
      success: true,
      analysisId: analysis.id,
    };
  } catch (error) {
    console.error("[DB] 사주 분석 초기 저장 실패:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * 사주 분석 결과를 DB에서 업데이트하는 함수 (분석 완료/실패 시)
 */
export async function updateSajuAnalysis(
  analysisId: number,
  aiResponse: string,
  analysisCompletedAt: Date,
  env: any,
  usageMetadata?: any,
  chartJson?: string | null
): Promise<{ success: boolean; analysisId?: number; error?: string }> {
  const prisma = createPrismaClient(env.DB);
  try {
    const updateData: any = {
      aiResponse: aiResponse,
      analysisCompletedAt: analysisCompletedAt,
    };

    // usageMetadata가 있으면 토큰 정보도 업데이트
    if (usageMetadata) {
      updateData.usageMetadata = JSON.stringify(usageMetadata);
    }

    // 차트 JSON이 있으면 저장
    if (typeof chartJson === "string") {
      updateData.chartJson = chartJson;
    }

    const analysis = await prisma.sajuAnalysis.update({
      where: { id: analysisId },
      data: updateData,
    });

    return {
      success: true,
      analysisId: analysis.id,
    };
  } catch (error) {
    console.error("[DB] 사주 분석 결과 업데이트 실패:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * 사주 분석 결과를 DB에 저장하는 함수 (스트리밍 완료 시 사용)
 */
export async function saveSajuAnalysis(
  job: AnalysisJob,
  aiResponse: string,
  title: string,
  analysisCompletedAt: Date,
  env: any,
  usageMetadata?: any,
  chartJson?: string | null
): Promise<{ success: boolean; analysisId?: number; error?: string }> {
  const prisma = createPrismaClient(env.DB);
  try {
    let birthData = null;
    if (job.sajuData) {
      if (job.sajuData.정보 && job.sajuData.정보.생년월일) {
        birthData = job.sajuData.정보.생년월일;
      } else if (
        job.sajuData.person1 &&
        job.sajuData.person1.정보 &&
        job.sajuData.person1.정보.생년월일
      ) {
        birthData = {
          person1: job.sajuData.person1.정보.생년월일,
          person2: job.sajuData.person2?.정보?.생년월일 || null,
        };
      }
    }

    const createData: any = {
      userId: job.userId,
      analysisType: job.analysisType,
      type: job.type,
      title: title,
      sajuData: JSON.stringify(birthData),
      userPrompt: job.userPrompt,
      systemPrompt: job.systemPrompt || null,
      aiResponse: aiResponse,
      modelUsed: job.model,
      pointsSpent: job.pointsCost,
      i18n: job.i18n,
      timezone: job.timezone,
      analysisStartedAt: new Date(job.createdAt),
      analysisCompletedAt: analysisCompletedAt,
    };

    // usageMetadata가 있으면 토큰 정보도 저장
    if (usageMetadata) {
      createData.usageMetadata = JSON.stringify(usageMetadata);
    }

    // chartJson이 있으면 함께 저장
    if (typeof chartJson === "string") {
      createData.chartJson = chartJson;
    }

    const result = await prisma.sajuAnalysis.create({
      data: createData,
    });

    return {
      success: true,
      analysisId: result.id,
    };
  } catch (error) {
    console.error("사주 분석 결과 저장 실패:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    await prisma.$disconnect();
  }
}
