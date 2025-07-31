import { GoogleGenAI } from "@google/genai";
import { createPrismaClient } from "../../../../common/prismaUtils";

// Queue 메시지 타입
interface SajuAnalysisMessage {
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
  // durableObjectId 제거 - Queue Consumer에서 직접 처리
}

/**
 * Queue Consumer - 사주 분석 작업을 백그라운드에서 처리
 */
export async function saju_analysis_queue_handler(
  batch: MessageBatch<SajuAnalysisMessage>,
  env: any
): Promise<void> {
  // 병렬 처리를 위한 Promise 배열 생성
  const processingPromises = batch.messages.map(async (message) => {
    let initialSaveResult: { success: boolean; analysisId?: number; error?: string } | null = null;
    
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
        throw new Error(`분석 작업 초기화에 실패했습니다: ${initialSaveResult.error}`);
      }

      // Gemini API 직접 호출 (Durable Object 거치지 않음)
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
        throw new Error(`분석 결과 업데이트에 실패했습니다: ${updateResult.error}`);
      }

      console.log(`[Queue] 작업 완료: ${message.body.jobId}`);
    } catch (error) {
      console.error(`Error processing job ${message.body.jobId}:`, error);

      // 실패 시 DB 업데이트 (에러 메시지로)
      if (initialSaveResult?.analysisId) {
        try {
          await updateSajuAnalysis(
            initialSaveResult.analysisId,
            `분석 실패: ${error instanceof Error ? error.message : "Unknown error"}`,
            new Date(),
            env
          );
        } catch (updateError) {
          console.error("[Queue] 실패 상태 DB 업데이트 실패:", updateError);
        }
      }

      // 실패 시 포인트 환불
      try {
        const { refundPoints } = await import("../../../../common/paymentUtils");
        await refundPoints(
          env.DB,
          message.body.userId,
          message.body.pointsCost,
          `사주 분석 작업 실패로 인한 포인트 환불 (${message.body.type})`,
          `analysis_saju_${message.body.type}_refund_${Date.now()}`
        );
      } catch (refundError) {
        console.error("[Queue] 포인트 환불 실패:", refundError);
      }
    }
  });

  // 모든 작업을 병렬로 실행하고 완료 대기
  await Promise.all(processingPromises);
}

/**
 * Gemini API 요청 페이로드 생성
 */
function buildGeminiPayload(message: SajuAnalysisMessage): any {
  const contents: any[] = [];

  // 시스템 프롬프트 구성
  let systemPrompt =
    message.systemPrompt ||
    "당신은 전문 사주명리학자입니다. 사용자의 사주 정보를 바탕으로 상세하고 친절하게 운세를 분석해주세요.";

  if (message.i18n && message.i18n !== "ko") {
    const languagePrompts: { [key: string]: string } = {
      en: "You are a professional fortune teller and astrologer. Please provide detailed and friendly fortune analysis based on the user's birth chart information.",
      ja: "あなたは専門の占い師・占星術師です。ユーザーの生年月日情報に基づいて、詳細で親切な運勢分析を提供してください。",
      zh: "您是一位专业的算命师和占星师。请根据用户的生辰八字信息提供详细而友好的运势分析。",
      vi: "Bạn là một nhà chiêm tinh và thầy bói chuyên nghiệp. Vui lòng cung cấp phân tích vận mệnh chi tiết và thân thiện dựa trên thông tin lá số tử vi của người dùng.",
    };
    systemPrompt =
      message.systemPrompt || languagePrompts[message.i18n] || systemPrompt;
  }

  // 사주 데이터 추가
  if (message.sajuData) {
    if (message.sajuData.person1 && message.sajuData.person2) {
      contents.push({
        role: "user",
        parts: [
          {
            text: `궁합 분석용 사주 데이터:\n\n첫 번째 사람 (${
              message.sajuData.person1.name
            }):\n${JSON.stringify(
              message.sajuData.person1.sajuData,
              null,
              2
            )}\n\n두 번째 사람 (${
              message.sajuData.person2.name
            }):\n${JSON.stringify(message.sajuData.person2.sajuData, null, 2)}`,
          },
        ],
      });
    } else {
      contents.push({
        role: "user",
        parts: [
          { text: `사주 데이터: ${JSON.stringify(message.sajuData, null, 2)}` },
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

  return {
    model: message.model,
    contents,
    temperature: 0.3,
    topP: 0.8,
    topK: 20,
    maxOutputTokens: 4000,
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
}

/**
 * 제목 생성 함수
 */
function generateTitle(message: SajuAnalysisMessage): string {
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
function getFortuneTypeTitle(fortuneType: string): string {
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
 * 사주 분석 초기 데이터를 DB에 저장하는 함수 (분석 시작 시)
 */
async function saveSajuAnalysisInitial(
  message: SajuAnalysisMessage,
  title: string,
  analysisStartedAt: Date,
  env: any
): Promise<{ success: boolean; analysisId?: number; error?: string }> {
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

    const prisma = createPrismaClient(env.DB);
    
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
        analysisCompletedAt: null // 완료 시 업데이트
      }
    });

    await prisma.$disconnect();

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
  }
}

/**
 * 사주 분석 결과를 DB에서 업데이트하는 함수 (분석 완료 시)
 */
async function updateSajuAnalysis(
  analysisId: number,
  aiResponse: string,
  analysisCompletedAt: Date,
  env: any
): Promise<{ success: boolean; analysisId?: number; error?: string }> {
  try {
    const prisma = createPrismaClient(env.DB);
    
    const analysis = await prisma.sajuAnalysis.update({
      where: { id: analysisId },
      data: {
        aiResponse: aiResponse,
        analysisCompletedAt: analysisCompletedAt
      }
    });

    await prisma.$disconnect();

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
  }
}
