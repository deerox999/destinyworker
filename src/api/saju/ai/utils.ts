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
  // 완료 후 후처리 목적지(선택)
  destination?: {
    type: "celebrityTranslation";
    celebrityId: string;
    languageCode: string;
  };
  analysisId?: number; // DB 분석 ID (업데이트용)
  // 재질문 모드 여부
  followUpMode?: boolean;
  // 최초 요청 options 원본(JSON 문자열)
  optionsJson?: string;
  // 재질문 시 기존 타이틀 전달용
  previousTitle?: string;
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
  // 품질 미달 시 1회 재시도 제어용 시도 횟수
  retryAttempt?: number;
  // 재질문 모드 여부
  followUpMode?: boolean;
  // 최초 요청 options 원본(JSON 문자열)
  optionsJson?: string;
  // 재질문 시 기존 타이틀 전달용
  previousTitle?: string;
}

/**
 * Gemini API 요청 페이로드 생성
 */
export function buildGeminiPayload(
  message: SajuAnalysisMessage | AnalysisJob
): any {
  const contents: any[] = [];

  // 시스템 프롬프트 구성 → systemInstruction로 분리해 전달
  let systemPrompt =
    message.systemPrompt ||
    "당신은 전문 사주명리학자입니다. 사용자의 사주 정보를 바탕으로 상세하고 친절하게 운세를 분석해주세요.";

  const isFollowUp = Boolean((message as any).followUpMode);

  // 사주 데이터 추가 (재질문 모드에서는 강제로 생략)
  if (!isFollowUp && message.sajuData) {
    // 초기 분석 시에는 프론트에서 넘어온 sajuData 원문 전체를 그대로 포함 (궁합 포함 전체 필드 보존)
    contents.push({
      role: "user",
      parts: [
        { text: `사주 데이터: ${JSON.stringify(message.sajuData)}` },
      ],
    });
  }

  // 유쾌한 톤 Few-shot 스타일 앵커(모델이 systemInstruction를 약하게 처리할 경우 보강) - 초기/재질문 모두 적용
  let responseTone: string | undefined = undefined;
  try {
    const options = (message as any).optionsJson ? JSON.parse((message as any).optionsJson) : undefined;
    responseTone = options?.responseStyle;
  } catch (_) { /* ignore */ }
  if (responseTone === "유쾌한") {
    contents.push(
      { role: "user", parts: [{ text: "스타일 샘플: 다음 답변은 재치 있는 한 줄로 시작하고, 각 섹션마다 자연스러운 위트를 한 줄 포함해줘." }] },
      { role: "model", parts: [{ text: "시작부터 한 줄 위트로 문을 열어볼게요!\n\n## 핵심 포인트\n- 에너지 흐름이 좋아요. (스포일러: 기대해도 좋아요)\n\n## 조언\n- 작은 시도를 오늘의 이벤트로 만들기! (의식의 차이가 반전을 만듭니다)" }] },
    );
  }

  if (isFollowUp) {
    // 재질문: 대화 히스토리를 먼저 넣고, 마지막에 현재 사용자 질문을 배치해야 모델이 올바르게 응답함
    if (message.conversationHistory && message.conversationHistory.length > 0) {
      contents.push(...message.conversationHistory);
    }
    contents.push({ role: "user", parts: [{ text: message.userPrompt }] });
  } else {
    // 초기 분석: 기존 순서 유지 (사주데이터 → 히스토리 → 지시)
    if (message.conversationHistory && message.conversationHistory.length > 0) {
      contents.push(...message.conversationHistory);
    }
    contents.push({ role: "user", parts: [{ text: message.userPrompt }] });
  }

  // console.log("message.sajuData", message.sajuData);
  // console.log("message.systemPrompt", message.systemPrompt);
  // console.log("message.userPrompt", message.userPrompt);
  
  // 톤에 따른 생성 설정 동적 조정
  const baseGen = SERVER_MODEL_CONFIG.generationConfig;
  const generationConfig = { ...baseGen } as any;
  let tone: string | undefined = responseTone;
  if (tone === "유쾌한") {
    generationConfig.temperature = Math.max(generationConfig.temperature || 0.4, 0.9);
    generationConfig.topP = Math.max(generationConfig.topP || 0.4, 0.95);
  } else if (tone === "상냥한") {
    generationConfig.temperature = Math.max(generationConfig.temperature || 0.4, 0.7);
    generationConfig.topP = Math.max(generationConfig.topP || 0.4, 0.9);
  }

  // 페이로드 반환
  return {
    model: message.model,
    // 시스템 지시는 별도로 전달 (role 지정 불필요; 지정 시 'user' | 'model'만 허용됨)
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: contents,
    generationConfig,
    safetySettings: SERVER_MODEL_CONFIG.safetySettings,
  };
}

/**
 * 제목 생성 함수
 */
export function generateTitle(message: SajuAnalysisMessage | AnalysisJob): string {
  // 재질문 모드이고, 기존 타이틀을 전달받은 경우 이를 우선 사용
  const isFollowUp = Boolean((message as any).followUpMode);
  const previousTitle = (message as any).previousTitle as string | undefined;
  if (isFollowUp && previousTitle && previousTitle.trim().length > 0) {
    return `${previousTitle} + 재질문`;
  }

  let title = `[${message.analysisType}]`;

  if (message.sajuData) {
    const arr = Array.isArray(message.sajuData) ? message.sajuData : [message.sajuData];
    const names = arr
      .map((person: any) => {
        const bd = person?.정보?.생년월일;
        if (!bd) return undefined;
        return bd.name || bd.이름 || undefined;
      })
      .filter((name: string | undefined) => !!name)
      .map((name: string) => `${name}님`);
    if (names.length > 0) {
      title += ` ${names.join(" & ")}`;
    }
  }

  return title;
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
    const birthArray = extractSimplifiedBirthArray((message as any).sajuData);

    const analysis = await prisma.sajuAnalysis.create({
      data: {
        userId: message.userId,
        analysisType: message.analysisType,
        type: message.type,
        title: title,
        sajuData: JSON.stringify(birthArray),
        userPrompt: message.userPrompt,
        systemPrompt: message.systemPrompt || null,
        aiResponse: "분석 중... 처리중이오니, 잠시만 기다려주세요.", // 초기값
        modelUsed: message.model,
        pointsSpent: message.pointsCost,
        i18n: message.i18n,
        timezone: message.timezone,
        analysisStartedAt: analysisStartedAt,
        analysisCompletedAt: null, // 완료 시 업데이트
        ...(message as any).optionsJson
          ? { optionsJson: (message as any).optionsJson as string }
          : {},
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
    const birthArray = extractSimplifiedBirthArray((job as any).sajuData);

    const createData: any = {
      userId: job.userId,
      analysisType: job.analysisType,
      type: job.type,
      title: title,
      sajuData: JSON.stringify(birthArray),
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

    // 최초 요청 options 원본이 있으면 함께 저장
    if (job.optionsJson) {
      createData.optionsJson = job.optionsJson;
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

// 배열 기반 간소화 생년월일 추출 유틸
export function extractSimplifiedBirthArray(sajuData: any): any[] | null {
  const toBirth = (record: any) => {
    const bd = record?.정보?.생년월일;
    if (!bd) return null;
    return {
      name: bd.name || bd.이름 || undefined,
      year: bd.year || bd.년 || undefined,
      month: bd.month || bd.월 || undefined,
      day: bd.day || bd.일 || undefined,
      hour: bd.hour || bd.시 || undefined,
      minute: bd.minute || bd.분 || undefined,
      gender: bd.gender || bd.성별 || undefined,
      calendar: bd.calendar || bd.달력 || bd.calendarType || undefined,
      city: bd.city || bd.도시 || undefined,
      country: bd.country || bd.국가 || undefined,
      calculationMethod: bd.calculationMethod || bd.계산방식 || undefined,
      userId: bd.userId || undefined,
    };
  };
  if (!sajuData) return null;
  const arr = Array.isArray(sajuData) ? sajuData : [sajuData];
  const simplified = arr.map(toBirth).filter((x) => x);
  return simplified.length > 0 ? simplified : null;
}
