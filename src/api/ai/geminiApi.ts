import { GoogleGenAI } from '@google/genai';
import { Context } from "hono";
import { getUserFromToken } from "../../common/utils";
import { usePoints, refundPoints } from "../../common/paymentUtils";

// Gemini API와 통신하기 위한 환경 변수 확장
export interface Env {
  GOOGLE_GEMINI_API_KEY: string; // Gemini API 키
}

// API 사용자가 보내는 요청 본문 타입 정의
interface SajuAnalysisRequest {
  model?: string; // 사용할 Gemini 모델 (e.g., "gemini-2.5-pro-latest")
  userPrompt: string;
  systemPrompt?: string; // systemInstruction을 간편하게 설정하기 위한 필드
  conversationHistory?: Content[]; // 프론트에서 관리하는 전체 대화 기록
  sajuData?: SajuData; // 사주 정보 (첫 대화에서만 전송)
  analysisType?: string;
  i18n?: string; // 언어 설정 (ko, en, ja, zh, vi 등)
  timezone?: string; // 시간대 (Asia/Seoul, America/New_York 등)
  stream?: boolean; // 스트리밍 응답 여부
  generationConfig?: GenerationConfig; // 생성 관련 고급 설정
  safetySettings?: SafetySetting[]; // 안전 관련 고급 설정
  tools?: Tool[]; // 함수 호출 기능
  toolConfig?: ToolConfig;
  fortuneType?: string; // 'this_year', 'next_year', 'both'
}

// 사주 정보 타입 정의 (방대한 계산된 데이터이므로 any로 처리)
type SajuData = any;

// --- Gemini API의 세부 타입 정의 ---

interface Content {
  role: "user" | "model" | "function" | "tool";
  parts: Part[];
}

interface Part {
  text?: string;
  inlineData?: BlobPart;
  fileData?: FileData;
  functionCall?: FunctionCall;
  functionResponse?: FunctionResponse;
}

interface BlobPart {
  mimeType: string;
  data: string; // base64 encoded
}

interface FileData {
  mimeType: string;
  fileUri: string;
}

interface FunctionCall {
  name: string;
  args: object;
}

interface FunctionResponse {
  name: string;
  response: object;
}

interface Tool {
  functionDeclarations?: FunctionDeclaration[];
}

interface FunctionDeclaration {
  name: string;
  description: string;
  parameters?: object; // OpenAPI 3.0.3 JSON Schema
}

interface ToolConfig {
  functionCallingConfig?: {
    mode: "AUTO" | "ANY" | "NONE";
  };
}

interface SafetySetting {
  category:
    | "HARM_CATEGORY_HARASSMENT"
    | "HARM_CATEGORY_HATE_SPEECH"
    | "HARM_CATEGORY_SEXUALLY_EXPLICIT"
    | "HARM_CATEGORY_DANGEROUS_CONTENT";
  threshold:
    | "BLOCK_NONE"
    | "BLOCK_ONLY_HIGH"
    | "BLOCK_MEDIUM_AND_ABOVE"
    | "BLOCK_LOW_AND_ABOVE"
    | "OFF";
}

interface GenerationConfig {
  /**
   * 생성할 응답 후보의 수.
   * @default 1
   */
  candidateCount?: number;
  /**
   * 생성을 중단할 시퀀스 목록.
   */
  stopSequences?: string[];
  /**
   * 생성할 토큰의 최대 개수.
   * @default 2048
   */
  maxOutputTokens?: number;
  /**
   * 샘플링 온도를 제어합니다 (0.0 ~ 1.0). 값이 높을수록 더 창의적인 결과가 나옵니다.
   * @default 1.0
   */
  temperature?: number;
  /**
   * Top-p 샘플링. 확률의 합이 이 값 이상이 되는 토큰들만 고려합니다.
   * @default 1.0
   */
  topP?: number;
  /**
   * Top-k 샘플링. 가장 확률이 높은 k개의 토큰만 고려합니다.
   * @default 1
   */
  topK?: number;
  /**
   * 응답의 MIME 타입을 지정합니다. 'application/json'으로 설정하여 JSON 출력을 강제할 수 있습니다.
   */
  responseMimeType?: "text/plain" | "application/json";
  /**
   * 시드 값 (재현 가능한 결과를 위한)
   */
  seed?: number;
}

/**
 * 사용자 요청을 바탕으로 Gemini API에 보낼 요청 본문을 생성합니다.
 */
function buildGeminiPayload(body: SajuAnalysisRequest): any {
  const contents: Content[] = [];

  // 1. 시스템 프롬프트 구성 (언어 설정 반영)
  let systemPrompt = body.systemPrompt || 
    "당신은 전문 사주명리학자입니다. 사용자의 사주 정보를 바탕으로 상세하고 친절하게 운세를 분석해주세요.";
  
  // 언어별 기본 시스템 프롬프트 설정
  if (body.i18n && body.i18n !== 'ko') {
    const languagePrompts: { [key: string]: string } = {
      'en': "You are a professional fortune teller and astrologer. Please provide detailed and friendly fortune analysis based on the user's birth chart information.",
      'ja': "あなたは専門の占い師・占星術師です。ユーザーの生年月日情報に基づいて、詳細で親切な運勢分析を提供してください。",
      'zh': "您是一位专业的算命师和占星师。请根据用户的生辰八字信息提供详细而友好的运势分析。",
      'vi': "Bạn là một nhà chiêm tinh và thầy bói chuyên nghiệp. Vui lòng cung cấp phân tích vận mệnh chi tiết và thân thiện dựa trên thông tin lá số tử vi của người dùng."
    };
    systemPrompt = body.systemPrompt || languagePrompts[body.i18n] || systemPrompt;
  }

  // 2. 사주 데이터가 있으면 첫 번째 메시지로 추가
  if (body.sajuData) {
    // 궁합 분석용 데이터인지 확인 (person1, person2 구조)
    if (body.sajuData.person1 && body.sajuData.person2) {
      contents.push({
        role: "user",
        parts: [{ text: `궁합 분석용 사주 데이터:\n\n첫 번째 사람 (${body.sajuData.person1.name}):\n${JSON.stringify(body.sajuData.person1.sajuData, null, 2)}\n\n두 번째 사람 (${body.sajuData.person2.name}):\n${JSON.stringify(body.sajuData.person2.sajuData, null, 2)}` }],
      });
    } else {
      // 일반 개인 사주 데이터
      contents.push({
        role: "user",
        parts: [{ text: `사주 데이터: ${JSON.stringify(body.sajuData, null, 2)}` }],
      });
    }
  }

  // 3. 기존 대화 기록 추가
  if (body.conversationHistory && body.conversationHistory.length > 0) {
    contents.push(...body.conversationHistory);
  }

  // 4. 현재 사용자 프롬프트와 시스템 프롬프트를 합쳐서 추가
  const combinedPrompt = `${systemPrompt}\n\n${body.userPrompt}`;
  contents.push({
    role: "user",
    parts: [{ text: combinedPrompt }],
  });

  // 5. 최종 API 요청 객체 생성
  const payload: any = {
    model: body.model || "gemini-2.5-pro",
    contents,
    ...(body.generationConfig || {
      temperature: 0.3,
      topP: 0.8,
      topK: 20,
      maxOutputTokens: 4000,
    }),
    safetySettings: body.safetySettings || [
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

  if (body.tools) {
    payload.tools = body.tools;
  }
  if (body.toolConfig) {
    payload.toolConfig = body.toolConfig;
  }

  return payload;
}

/**
 * 사주 분석 결과를 DB에 저장하는 함수
 */
async function saveSajuAnalysis(
  db: any,
  userId: number,
  analysisType: string,
  type: string,
  title: string,
  sajuData: any,
  userPrompt: string,
  systemPrompt: string | undefined,
  aiResponse: string,
  modelUsed: string,
  pointsSpent: number,
  i18n?: string,
  timezone?: string,
  analysisStartedAt?: Date,
  analysisCompletedAt?: Date
) {
  try {
    // sajuData에서 생년월일 정보만 추출
    let birthData = null;
    if (sajuData) {
      if (sajuData.정보 && sajuData.정보.생년월일) {
        birthData = sajuData.정보.생년월일;
      } else if (sajuData.person1 && sajuData.person1.정보 && sajuData.person1.정보.생년월일) {
        // 궁합 분석의 경우 두 사람의 생년월일 정보
        birthData = {
          person1: sajuData.person1.정보.생년월일,
          person2: sajuData.person2?.정보?.생년월일 || null
        };
      }
    }

    // 시간은 UTC로 저장하고 프론트엔드에서 처리
    const now = new Date();
    const createdAt = now.toISOString();
    const updatedAt = now.toISOString();
    const startedAt = analysisStartedAt ? analysisStartedAt.toISOString() : null;
    const completedAt = analysisCompletedAt ? analysisCompletedAt.toISOString() : null;

    const result = await db.prepare(`
      INSERT INTO saju_analyses (
        user_id, analysis_type, type, title, sajuData, user_prompt, 
        system_prompt, ai_response, model_used, points_spent, 
        created_at, updated_at, i18n, timezone, analysis_started_at, analysis_completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      analysisType,
      type,
      title,
      JSON.stringify(birthData),
      userPrompt,
      systemPrompt || null,
      aiResponse,
      modelUsed,
      pointsSpent,
      createdAt,
      updatedAt,
      i18n || 'ko',
      timezone || 'Asia/Seoul',
      startedAt,
      completedAt
    ).run();



    return {
      success: true,
      analysisId: result.meta.last_row_id
    };
  } catch (error) {
    console.error("사주 분석 결과 저장 실패:", error);
    console.error("저장 시도한 데이터:", {
      userId,
      analysisType,
      title,
      userPromptLength: userPrompt.length,
      aiResponseLength: aiResponse.length,
      modelUsed,
      pointsSpent
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}



// 재시도 로직 함수
async function retryGeminiCall(ai: GoogleGenAI, payload: any, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);
      
      const result = await ai.models.generateContent(payload);
      
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      console.error(`Gemini API 호출 실패 (시도 ${attempt}/${maxRetries}):`, error);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // 지수 백오프로 재시도
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
}

// 스트리밍 재시도 로직 함수
async function retryGeminiStreamCall(ai: GoogleGenAI, payload: any, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);
      
      const result = await ai.models.generateContentStream(payload);
      
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      console.error(`Gemini 스트리밍 API 호출 실패 (시도 ${attempt}/${maxRetries}):`, error);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // 지수 백오프로 재시도
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
}

/**
 * Gemini AI를 활용한 상세 사주 풀이 API (단순화된 버전)
 */
export async function SajuAnalysisWithGemini(
  c: Context
): Promise<Response> {
  const user = await getUserFromToken(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  // 포인트 검증 (사주 분석 비용: 1000포인트)
  const pointValidation = await usePoints(
    c.env.DB,
    user.id,
    1000,
    "사주 분석 서비스 이용",
    `saju_analysis_${Date.now()}`
  );

  if (!pointValidation.success) {
    return c.json({ 
      error: "포인트가 부족합니다.", 
      details: pointValidation.message,
      data: pointValidation.data // 구조화된 데이터 추가
    }, 402);
  }

  try {
    const body: SajuAnalysisRequest = await c.req.json();
    const model = body.model || "gemini-2.5-pro";
    const analysisType = body.analysisType || 'general'; // 프론트에서 정의한 분석 유형
    const type = 'individual'; // 표준화된 분석 유형
    const i18n = body.i18n || 'ko'; // 기본 언어는 한국어
    const timezone = body.timezone || 'Asia/Seoul'; // 기본 시간대는 한국

    // 분석 시작 시간 기록
    const analysisStartedAt = new Date();

    // 1. Gemini API 요청 페이로드 생성
    const geminiPayload = buildGeminiPayload(body);

    // 2. Google GenAI SDK 초기화
    const ai = new GoogleGenAI({
      apiKey: c.env.GOOGLE_GEMINI_API_KEY
    });

    // 3. Gemini API 호출
    if (body.stream) {
      // 스트리밍 응답
      const streamingResp = await retryGeminiStreamCall(ai, geminiPayload);
      
      if (!streamingResp) {
        throw new Error("스트리밍 응답을 받을 수 없습니다.");
      }
      
      // 스트리밍 응답을 수집하기 위한 변수
      let fullResponse = "";
      let analysisId: number | null = null;

      // ReadableStream 생성
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of streamingResp) {
              if (chunk.text) {
                // 전체 응답 수집
                fullResponse += chunk.text;
                
                // SSE 형식으로 데이터 전송
                const data = `data: ${JSON.stringify({ text: chunk.text })}\n\n`;
                controller.enqueue(new TextEncoder().encode(data));
              } else {
                // 메타데이터나 다른 정보도 전송
                const data = `data: ${JSON.stringify(chunk)}\n\n`;
                controller.enqueue(new TextEncoder().encode(data));
              }
              
              // 연결 유지를 위한 heartbeat
              if (Math.random() < 0.1) { // 10% 확률로 heartbeat 전송
                const heartbeat = `data: ${JSON.stringify({ type: "heartbeat", timestamp: Date.now() })}\n\n`;
                controller.enqueue(new TextEncoder().encode(heartbeat));
              }
            }

            // 분석 완료 시간 기록
            const analysisCompletedAt = new Date();

            // 제목 생성: "[분석유형] 이름님" 형식
            let title = `[${analysisType}]`;
            if (body.sajuData) {
              if (body.sajuData.정보 && body.sajuData.정보.생년월일 && body.sajuData.정보.생년월일.이름) {
                title += ` ${body.sajuData.정보.생년월일.이름}님`;
              } else if (body.sajuData.person1 && body.sajuData.person1.정보 && body.sajuData.person1.정보.생년월일 && body.sajuData.person1.정보.생년월일.이름) {
                title += ` ${body.sajuData.person1.정보.생년월일.이름}님`;
              }
            }

            const saveResult = await saveSajuAnalysis(
              c.env.DB,
              user.id,
              analysisType,
              type,
              title,
              body.sajuData || {},
              body.userPrompt,
              body.systemPrompt,
              fullResponse,
              model,
              1000,
              i18n,
              timezone,
              analysisStartedAt,
              analysisCompletedAt
            );

            if (saveResult.success) {
              analysisId = saveResult.analysisId;
            } else {
              console.error("스트리밍 응답 저장 실패:", saveResult.error);
            }

            // 스트림 종료
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            controller.close();
          } catch (error) {
            console.error("스트리밍 오류:", error);
            // 에러 정보를 클라이언트에 전송
            const errorData = `data: ${JSON.stringify({ 
              type: "error", 
              message: error instanceof Error ? error.message : "Unknown error" 
            })}\n\n`;
            controller.enqueue(new TextEncoder().encode(errorData));
            controller.close();
          }
        }
      });

      const headers = new Headers();
      headers.set("Content-Type", "text/event-stream; charset=utf-8");
      headers.set("Cache-Control", "no-cache");
      headers.set("Connection", "keep-alive");
      headers.set("X-AI-Model", model);
      headers.set("X-Points-Deducted", "1000");
      headers.set("X-Points-Remaining", pointValidation.remainingPoints?.toString() || "0");
      // 타임아웃 정보 추가
      headers.set("X-Timeout-Seconds", "45");
      headers.set("X-Connection-Keep-Alive", "true");
      // 구조화된 데이터를 JSON으로 헤더에 추가
      if (pointValidation.data) {
        headers.set("X-Points-Data", JSON.stringify(pointValidation.data));
      }

      return new Response(stream, {
        status: 200,
        headers: headers,
      });
    } else {
      // 일반 응답
      const result = await retryGeminiCall(ai, geminiPayload);
      
      if (!result) {
        throw new Error("AI 응답을 받을 수 없습니다.");
      }
      
      const text = result.text || "죄송합니다. 답변을 생성할 수 없습니다.";

      // 분석 완료 시간 기록
      const analysisCompletedAt = new Date();

      // 응답 형식
      const response = {
        answer: text,
        metadata: {
          model_used: model,
          timestamp: new Date().toISOString(),
          stream_enabled: false,
          response_type: "text",
        },
        points: {
          deducted: 1000,
          remaining: pointValidation.remainingPoints,
          message: pointValidation.message
        },
        data: pointValidation.data // 구조화된 데이터 추가
      };

      // 제목 생성: "[분석유형] 이름님" 형식
      let title = `[${analysisType}]`;
      if (body.sajuData) {
        if (body.sajuData.정보 && body.sajuData.정보.생년월일 && body.sajuData.정보.생년월일.이름) {
          title += ` ${body.sajuData.정보.생년월일.이름}님`;
        } else if (body.sajuData.person1 && body.sajuData.person1.정보 && body.sajuData.person1.정보.생년월일 && body.sajuData.person1.정보.생년월일.이름) {
          title += ` ${body.sajuData.person1.정보.생년월일.이름}님`;
        }
      }

      const saveResult = await saveSajuAnalysis(
        c.env.DB,
        user.id,
        analysisType,
        type,
        title,
        body.sajuData || {},
        body.userPrompt,
        body.systemPrompt,
        text,
        model,
        1000,
        i18n,
        timezone,
        analysisStartedAt,
        analysisCompletedAt
      );

      if (saveResult.success) {
        (response as any).analysis_id = saveResult.analysisId;
      } else {
        console.error("사주 분석 결과 저장 실패:", saveResult.error);
      }

      return c.json(response, 200);
    }
  } catch (error) {
    console.error("Gemini 사주 분석 API 오류:", error);
    
    // API 호출 실패 시 포인트 환불
    try {
      await refundPoints(
        c.env.DB,
        user.id,
        1000,
        "사주 분석 서비스 실패로 인한 포인트 환불",
        `saju_analysis_refund_${Date.now()}`
      );
    } catch (refundError) {
      console.error("포인트 환불 실패:", refundError);
    }
    
    return c.json(
      {
        error: "An error occurred while processing your request.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * Gemini AI를 활용한 궁합 분석 API
 */
export async function SajuCompatibilityAnalysis(
  c: Context
): Promise<Response> {
  const user = await getUserFromToken(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  // 포인트 검증 (궁합 분석 비용: 1500포인트)
  const pointValidation = await usePoints(
    c.env.DB,
    user.id,
    1500,
    "궁합 분석 서비스 이용",
    `compatibility_analysis_${Date.now()}`
  );

  if (!pointValidation.success) {
    return c.json({ 
      error: "포인트가 부족합니다.", 
      details: pointValidation.message,
      data: pointValidation.data
    }, 402);
  }

  try {
    const body: SajuAnalysisRequest = await c.req.json();
    const model = body.model || "gemini-2.5-flash";
    const analysisType = body.analysisType || 'compatibility'; // 프론트에서 정의한 분석 유형
    const type = 'compatibility'; // 표준화된 분석 유형
    const i18n = body.i18n || 'ko'; // 기본 언어는 한국어
    const timezone = body.timezone || 'Asia/Seoul'; // 기본 시간대는 한국

    // 분석 시작 시간 기록
    const analysisStartedAt = new Date();

    // 궁합 데이터 검증
    if (!body.sajuData || !body.sajuData.person1 || !body.sajuData.person2) {
      return c.json({ 
        error: "궁합 분석을 위해서는 두 사람의 사주 데이터가 필요합니다.",
        details: "sajuData에 person1과 person2가 포함되어야 합니다."
      }, 400);
    }

    // 1. 궁합 분석용 시스템 프롬프트 설정
    const compatibilitySystemPrompt = body.systemPrompt;

    // 2. 궁합 분석용 페이로드 생성
    const contents: Content[] = [];
    
    // 궁합 데이터 추가
    contents.push({
      role: "user",
      parts: [{ 
        text: `궁합 분석용 사주 데이터:

첫 번째 사람 (${body.sajuData.person1.정보.생년월일.이름}):
${JSON.stringify(body.sajuData.person1, null, 2)}

두 번째 사람 (${body.sajuData.person2.정보.생년월일.이름}):
${JSON.stringify(body.sajuData.person2, null, 2)}` 
      }],
    });

    // 기존 대화 기록 추가
    if (body.conversationHistory && body.conversationHistory.length > 0) {
      contents.push(...body.conversationHistory);
    }

    // 현재 사용자 프롬프트와 시스템 프롬프트를 합쳐서 추가
    const combinedPrompt = `${compatibilitySystemPrompt}\n\n${body.userPrompt}`;
    contents.push({
      role: "user",
      parts: [{ text: combinedPrompt }],
    });

    // 3. Gemini API 요청 페이로드 생성
    const geminiPayload: any = {
      model: model,
      contents,
      ...(body.generationConfig || {
        temperature: 0.4,
        topP: 0.4,
        topK: 40,
        maxOutputTokens: 6000,
      }),
      safetySettings: body.safetySettings || [
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

    if (body.tools) {
      geminiPayload.tools = body.tools;
    }
    if (body.toolConfig) {
      geminiPayload.toolConfig = body.toolConfig;
    }

    // 4. Google GenAI SDK 초기화
    const ai = new GoogleGenAI({
      apiKey: c.env.GOOGLE_GEMINI_API_KEY
    });

    // 5. Gemini API 호출
    if (body.stream) {
      // 스트리밍 응답
      const streamingResp = await retryGeminiStreamCall(ai, geminiPayload);
      
      if (!streamingResp) {
        throw new Error("궁합 분석 스트리밍 응답을 받을 수 없습니다.");
      }
      
      // 스트리밍 응답을 수집하기 위한 변수
      let fullResponse = "";
      let analysisId: number | null = null;

      // ReadableStream 생성
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of streamingResp) {
              if (chunk.text) {
                // 전체 응답 수집
                fullResponse += chunk.text;
                
                // SSE 형식으로 데이터 전송
                const data = `data: ${JSON.stringify({ text: chunk.text })}\n\n`;
                controller.enqueue(new TextEncoder().encode(data));
              } else {
                // 메타데이터나 다른 정보도 전송
                const data = `data: ${JSON.stringify(chunk)}\n\n`;
                controller.enqueue(new TextEncoder().encode(data));
              }
              
              // 연결 유지를 위한 heartbeat
              if (Math.random() < 0.1) { // 10% 확률로 heartbeat 전송
                const heartbeat = `data: ${JSON.stringify({ type: "heartbeat", timestamp: Date.now() })}\n\n`;
                controller.enqueue(new TextEncoder().encode(heartbeat));
              }
            }
            
            // 스트리밍 완료 후 DB에 저장

            // 분석 완료 시간 기록
            const analysisCompletedAt = new Date();

            // 제목 생성: "[분석유형] 이름님" 형식
            let title = `[${analysisType}]`;
            if (body.sajuData) {
              if (body.sajuData.person1 && body.sajuData.person1.정보 && body.sajuData.person1.정보.생년월일 && body.sajuData.person1.정보.생년월일.이름) {
                title += ` ${body.sajuData.person1.정보.생년월일.이름}님`;
              }
              if (body.sajuData.person2 && body.sajuData.person2.정보 && body.sajuData.person2.정보.생년월일 && body.sajuData.person2.정보.생년월일.이름) {
                title += ` & ${body.sajuData.person2.정보.생년월일.이름}님`;
              }
            }

            const saveResult = await saveSajuAnalysis(
              c.env.DB,
              user.id,
              analysisType,
              type,
              title,
              body.sajuData || {},
              body.userPrompt,
              body.systemPrompt,
              fullResponse,
              model,
              1500,
              i18n,
              timezone,
              analysisStartedAt,
              analysisCompletedAt
            );

            if (saveResult.success) {
              analysisId = saveResult.analysisId;
            } else {
              console.error("궁합 분석 스트리밍 응답 저장 실패:", saveResult.error);
            }

            // 스트림 종료
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            controller.close();
          } catch (error) {
            console.error("궁합 분석 스트리밍 오류:", error);
            // 에러 정보를 클라이언트에 전송
            const errorData = `data: ${JSON.stringify({ 
              type: "error", 
              message: error instanceof Error ? error.message : "Unknown error" 
            })}\n\n`;
            controller.enqueue(new TextEncoder().encode(errorData));
            controller.close();
          }
        }
      });

      const headers = new Headers();
      headers.set("Content-Type", "text/event-stream; charset=utf-8");
      headers.set("Cache-Control", "no-cache");
      headers.set("Connection", "keep-alive");
      headers.set("X-AI-Model", model);
      headers.set("X-Points-Deducted", "1500");
      headers.set("X-Points-Remaining", pointValidation.remainingPoints?.toString() || "0");
      // 타임아웃 정보 추가
      headers.set("X-Timeout-Seconds", "45");
      headers.set("X-Connection-Keep-Alive", "true");
      if (pointValidation.data) {
        headers.set("X-Points-Data", JSON.stringify(pointValidation.data));
      }

      return new Response(stream, {
        status: 200,
        headers: headers,
      });
    } else {
      // 일반 응답
      const result = await retryGeminiCall(ai, geminiPayload);
      
      if (!result) {
        throw new Error("궁합 분석 응답을 받을 수 없습니다.");
      }
      
      const text = result.text || "죄송합니다. 궁합 분석을 생성할 수 없습니다.";

      // 분석 완료 시간 기록
      const analysisCompletedAt = new Date();

      // 응답 형식
      const response = {
        answer: text,
        metadata: {
          model_used: model,
          timestamp: new Date().toISOString(),
          stream_enabled: false,
          response_type: "compatibility_analysis",
          person1_name: body.sajuData.person1.name,
          person2_name: body.sajuData.person2.name,
        },
        points: {
          deducted: 1500,
          remaining: pointValidation.remainingPoints,
          message: pointValidation.message
        },
        data: pointValidation.data
      };

      // 결과를 DB에 저장

      // 제목 생성: "[분석유형] 이름님" 형식
      let title = `[${analysisType}]`;
      if (body.sajuData) {
        if (body.sajuData.person1 && body.sajuData.person1.정보 && body.sajuData.person1.정보.생년월일 && body.sajuData.person1.정보.생년월일.이름) {
          title += ` ${body.sajuData.person1.정보.생년월일.이름}님`;
        }
        if (body.sajuData.person2 && body.sajuData.person2.정보 && body.sajuData.person2.정보.생년월일 && body.sajuData.person2.정보.생년월일.이름) {
          title += ` & ${body.sajuData.person2.정보.생년월일.이름}님`;
        }
      }

      const saveResult = await saveSajuAnalysis(
        c.env.DB,
        user.id,
        analysisType,
        type,
        title,
        body.sajuData || {},
        body.userPrompt,
        body.systemPrompt,
        text,
        model,
        1500,
        i18n,
        timezone,
        analysisStartedAt,
        analysisCompletedAt
      );

      if (saveResult.success) {
        (response as any).analysis_id = saveResult.analysisId;
      } else {
        console.error("궁합 분석 결과 저장 실패:", saveResult.error);
      }

      return c.json(response, 200);
    }
  } catch (error) {
    console.error("Gemini 궁합 분석 API 오류:", error);
    
    // API 호출 실패 시 포인트 환불
    try {
      await refundPoints(
        c.env.DB,
        user.id,
        1500,
        "궁합 분석 서비스 실패로 인한 포인트 환불",
        `compatibility_analysis_refund_${Date.now()}`
      );
    } catch (refundError) {
      console.error("포인트 환불 실패:", refundError);
    }
    
    return c.json(
      {
        error: "An error occurred while processing your compatibility analysis request.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * 올해운세/내년운세 분석 API (무료 서비스)
 */
export async function YearlyFortuneAnalysis(
  c: Context
): Promise<Response> {
  const user = await getUserFromToken(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  try {
    const body: SajuAnalysisRequest = await c.req.json();
    const model = "gemini-2.5-flash"; // 하드코딩
    const analysisType = body.analysisType || 'yearly_fortune'; // 프론트에서 정의한 분석 유형
    const fortuneType = body.fortuneType || 'this_year'; // 'this_year', 'next_year', 'both'
    const type = 'yearly_fortune'; // 표준화된 분석 유형
    const i18n = body.i18n || 'ko'; // 기본 언어는 한국어
    const timezone = body.timezone || 'Asia/Seoul'; // 기본 시간대는 한국

    // 분석 시작 시간 기록
    const analysisStartedAt = new Date();

    // 1. Gemini API 요청 페이로드 생성
    const geminiPayload = buildGeminiPayload(body);

    // 2. Google GenAI SDK 초기화
    const ai = new GoogleGenAI({
      apiKey: c.env.GOOGLE_GEMINI_API_KEY
    });

    // 3. Gemini API 호출
    if (body.stream) {
      // 스트리밍 응답
      const streamingResp = await retryGeminiStreamCall(ai, geminiPayload);
      
      if (!streamingResp) {
        throw new Error("스트리밍 응답을 받을 수 없습니다.");
      }
      
      // 스트리밍 응답을 수집하기 위한 변수
      let fullResponse = "";
      let analysisId: number | null = null;

      // ReadableStream 생성
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of streamingResp) {
              if (chunk.text) {
                // 전체 응답 수집
                fullResponse += chunk.text;
                
                // SSE 형식으로 데이터 전송
                const data = `data: ${JSON.stringify({ text: chunk.text })}\n\n`;
                controller.enqueue(new TextEncoder().encode(data));
              } else {
                // 메타데이터나 다른 정보도 전송
                const data = `data: ${JSON.stringify(chunk)}\n\n`;
                controller.enqueue(new TextEncoder().encode(data));
              }
              
              // 연결 유지를 위한 heartbeat
              if (Math.random() < 0.1) { // 10% 확률로 heartbeat 전송
                const heartbeat = `data: ${JSON.stringify({ type: "heartbeat", timestamp: Date.now() })}\n\n`;
                controller.enqueue(new TextEncoder().encode(heartbeat));
              }
            }

            // 분석 완료 시간 기록
            const analysisCompletedAt = new Date();

            // 제목 생성: "[운세유형] 이름님" 형식
            let title = `[${getFortuneTypeTitle(fortuneType)}]`;
            if (body.sajuData) {
              if (body.sajuData.정보 && body.sajuData.정보.생년월일 && body.sajuData.정보.생년월일.이름) {
                title += ` ${body.sajuData.정보.생년월일.이름}님`;
              } else if (body.sajuData.person1 && body.sajuData.person1.정보 && body.sajuData.person1.정보.생년월일 && body.sajuData.person1.정보.생년월일.이름) {
                title += ` ${body.sajuData.person1.정보.생년월일.이름}님`;
              }
            }

            const saveResult = await saveSajuAnalysis(
              c.env.DB,
              user.id,
              analysisType,
              type,
              title,
              body.sajuData || {},
              body.userPrompt,
              body.systemPrompt,
              fullResponse,
              model,
              0, // 무료 서비스이므로 포인트 차감 없음
              i18n,
              timezone,
              analysisStartedAt,
              analysisCompletedAt
            );

            if (saveResult.success) {
              analysisId = saveResult.analysisId;
            } else {
              console.error("연간운세 스트리밍 응답 저장 실패:", saveResult.error);
            }

            // 스트림 종료
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            controller.close();
          } catch (error) {
            console.error("연간운세 스트리밍 오류:", error);
            // 에러 정보를 클라이언트에 전송
            const errorData = `data: ${JSON.stringify({ 
              type: "error", 
              message: error instanceof Error ? error.message : "Unknown error" 
            })}\n\n`;
            controller.enqueue(new TextEncoder().encode(errorData));
            controller.close();
          }
        }
      });

      const headers = new Headers();
      headers.set("Content-Type", "text/event-stream; charset=utf-8");
      headers.set("Cache-Control", "no-cache");
      headers.set("Connection", "keep-alive");
      headers.set("X-AI-Model", model);
      headers.set("X-Points-Deducted", "0"); // 무료 서비스
      headers.set("X-Service-Type", "free");
      headers.set("X-Fortune-Type", fortuneType);
      // 타임아웃 정보 추가
      headers.set("X-Timeout-Seconds", "45");
      headers.set("X-Connection-Keep-Alive", "true");

      return new Response(stream, {
        status: 200,
        headers: headers,
      });
    } else {
      // 일반 응답
      const result = await retryGeminiCall(ai, geminiPayload);
      
      if (!result) {
        throw new Error("AI 응답을 받을 수 없습니다.");
      }
      
      const text = result.text || "죄송합니다. 연간운세를 생성할 수 없습니다.";

      // 분석 완료 시간 기록
      const analysisCompletedAt = new Date();

      // 응답 형식
      const response = {
        answer: text,
        metadata: {
          model_used: model,
          timestamp: new Date().toISOString(),
          stream_enabled: false,
          response_type: "yearly_fortune",
          service_type: "free",
          fortune_type: fortuneType
        },
        points: {
          deducted: 0,
          remaining: null, // 무료 서비스이므로 포인트 정보 없음
          message: "무료 서비스입니다."
        }
      };

      // 제목 생성: "[운세유형] 이름님" 형식
      let title = `[${getFortuneTypeTitle(fortuneType)}]`;
      if (body.sajuData) {
        if (body.sajuData.정보 && body.sajuData.정보.생년월일 && body.sajuData.정보.생년월일.이름) {
          title += ` ${body.sajuData.정보.생년월일.이름}님`;
        } else if (body.sajuData.person1 && body.sajuData.person1.정보 && body.sajuData.person1.정보.생년월일 && body.sajuData.person1.정보.생년월일.이름) {
          title += ` ${body.sajuData.person1.정보.생년월일.이름}님`;
        }
      }

      const saveResult = await saveSajuAnalysis(
        c.env.DB,
        user.id,
        analysisType,
        type,
        title,
        body.sajuData || {},
        body.userPrompt,
        body.systemPrompt,
        text,
        model,
        0, // 무료 서비스이므로 포인트 차감 없음
        i18n,
        timezone,
        analysisStartedAt,
        analysisCompletedAt
      );

      if (saveResult.success) {
        (response as any).analysis_id = saveResult.analysisId;
      } else {
        console.error("연간운세 분석 결과 저장 실패:", saveResult.error);
      }

      return c.json(response, 200);
    }
  } catch (error) {
    console.error("Gemini 연간운세 분석 API 오류:", error);
    
    return c.json(
      {
        error: "An error occurred while processing your yearly fortune analysis request.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * 운세 유형에 따른 제목 생성 헬퍼 함수
 */
function getFortuneTypeTitle(fortuneType: string): string {
  switch (fortuneType) {
    case 'this_year':
      return '올해운세';
    case 'next_year':
      return '내년운세';
    case 'both':
      return '연간운세';
    default:
      return '연간운세';
  }
}

/**
 * 사용자의 사주 분석 결과 목록을 조회하는 API
 */
export async function getSajuAnalysisList(
  c: Context
): Promise<Response> {
  const user = await getUserFromToken(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  try {
    const { searchParams } = new URL(c.req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const analysisType = searchParams.get('type'); // 'individual', 'compatibility', 또는 null (전체)
    const isFavorite = searchParams.get('favorite'); // 'true', 'false', 또는 null (전체)
    
    const offset = (page - 1) * limit;

    // 기본 쿼리
    let query = `
      SELECT 
        id, analysis_type, type, title, user_prompt, ai_response, 
        model_used, points_spent, is_favorite, created_at, analysis_started_at, analysis_completed_at
      FROM saju_analyses 
      WHERE user_id = ?
    `;
    const params: any[] = [user.id];

    // 필터 조건 추가 (type 필드 사용)
    if (analysisType) {
      query += ` AND type = ?`;
      params.push(analysisType);
    }
    
    if (isFavorite === 'true') {
      query += ` AND is_favorite = 1`;
    } else if (isFavorite === 'false') {
      query += ` AND is_favorite = 0`;
    }

    // 정렬 및 페이징 (즐겨찾기 우선, 그 다음 최신순)
    query += ` ORDER BY is_favorite DESC, created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    // 총 개수 조회
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM saju_analyses 
      WHERE user_id = ?
    `;
    const countParams: any[] = [user.id];

    if (analysisType) {
      countQuery += ` AND type = ?`;
      countParams.push(analysisType);
    }
    
    if (isFavorite === 'true') {
      countQuery += ` AND is_favorite = 1`;
    } else if (isFavorite === 'false') {
      countQuery += ` AND is_favorite = 0`;
    }

    const [analyses, totalCount] = await Promise.all([
      c.env.DB.prepare(query).bind(...params).all(),
      c.env.DB.prepare(countQuery).bind(...countParams).first()
    ]);

    const total = totalCount?.total || 0;
    const totalPages = Math.ceil(total / limit);

    // SQLite boolean 값을 JavaScript boolean으로 변환
    const processedAnalyses = (analyses.results || []).map((analysis: any) => ({
      ...analysis,
      is_favorite: Boolean(analysis.is_favorite)
    }));



    return c.json({
      analyses: processedAnalyses,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }, 200);

  } catch (error) {
    console.error("사주 분석 목록 조회 오류:", error);
    return c.json(
      {
        error: "사주 분석 목록을 조회하는 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * 특정 사주 분석 결과를 조회하는 API
 */
export async function getSajuAnalysisDetail(
  c: Context
): Promise<Response> {
  const user = await getUserFromToken(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  try {
    const analysisId = c.req.param('id');
    if (!analysisId) {
      return c.json({ error: "분석 ID가 필요합니다." }, 400);
    }

    const analysis = await c.env.DB.prepare(`
      SELECT 
        id, analysis_type, type, title, sajuData, user_prompt, 
        system_prompt, ai_response, model_used, points_spent, 
        is_favorite, i18n, timezone, analysis_started_at, analysis_completed_at
      FROM saju_analyses 
      WHERE id = ? AND user_id = ?
    `).bind(analysisId, user.id).first();

    if (!analysis) {
      return c.json({ error: "분석 결과를 찾을 수 없습니다." }, 404);
    }

    // 사주 데이터를 JSON으로 파싱
    let sajuData = null;
    try {
      sajuData = JSON.parse(analysis.sajuData);
    } catch (e) {
      console.error("사주 데이터 파싱 오류:", e);
    }

    return c.json({
      id: analysis.id,
      analysis_type: analysis.analysis_type,
      type: analysis.type,
      title: analysis.title,
      user_prompt: analysis.user_prompt,
      system_prompt: analysis.system_prompt,
      ai_response: analysis.ai_response,
      model_used: analysis.model_used,
      points_spent: analysis.points_spent,
      is_favorite: Boolean(analysis.is_favorite),
      analysis_started_at: analysis.analysis_started_at,
      analysis_completed_at: analysis.analysis_completed_at,
      saju_data: sajuData,
      i18n: analysis.i18n,
      timezone: analysis.timezone
    }, 200);

  } catch (error) {
    console.error("사주 분석 상세 조회 오류:", error);
    return c.json(
      {
        error: "사주 분석 결과를 조회하는 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * 사주 분석 결과의 즐겨찾기 상태를 토글하는 API
 */
export async function toggleSajuAnalysisFavorite(
  c: Context
): Promise<Response> {
  const user = await getUserFromToken(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  try {
    const analysisId = c.req.param('id');
    if (!analysisId) {
      return c.json({ error: "분석 ID가 필요합니다." }, 400);
    }

    // 현재 즐겨찾기 상태 확인
    const current = await c.env.DB.prepare(`
      SELECT is_favorite FROM saju_analyses 
      WHERE id = ? AND user_id = ?
    `).bind(analysisId, user.id).first();

    if (!current) {
      return c.json({ error: "분석 결과를 찾을 수 없습니다." }, 404);
    }

    // SQLite boolean 값을 JavaScript boolean으로 변환
    const currentFavoriteState = Boolean(current.is_favorite);

    // 즐겨찾기 상태 토글
    const newFavoriteState = !currentFavoriteState;
    
    await c.env.DB.prepare(`
      UPDATE saju_analyses 
      SET is_favorite = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).bind(newFavoriteState ? 1 : 0, analysisId, user.id).run();

    return c.json({
      success: true,
      is_favorite: newFavoriteState,
      message: newFavoriteState ? "즐겨찾기에 추가되었습니다." : "즐겨찾기에서 제거되었습니다."
    }, 200);

  } catch (error) {
    console.error("즐겨찾기 토글 오류:", error);
    return c.json(
      {
        error: "즐겨찾기 상태를 변경하는 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * 사주 분석 결과의 제목을 수정하는 API
 */
export async function updateSajuAnalysisTitle(
  c: Context
): Promise<Response> {
  const user = await getUserFromToken(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  try {
    const analysisId = c.req.param('id');
    if (!analysisId) {
      return c.json({ error: "분석 ID가 필요합니다." }, 400);
    }

    const body = await c.req.json();
    const { title } = body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return c.json({ error: "유효한 제목이 필요합니다." }, 400);
    }

    if (title.length > 100) {
      return c.json({ error: "제목은 100자를 초과할 수 없습니다." }, 400);
    }

    const result = await c.env.DB.prepare(`
      UPDATE saju_analyses 
      SET title = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).bind(title.trim(), analysisId, user.id).run();

    if (result.meta.changes === 0) {
      return c.json({ error: "분석 결과를 찾을 수 없습니다." }, 404);
    }

    return c.json({
      success: true,
      title: title.trim(),
      message: "제목이 수정되었습니다."
    }, 200);

  } catch (error) {
    console.error("제목 수정 오류:", error);
    return c.json(
      {
        error: "제목을 수정하는 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * 사주 분석 결과를 삭제하는 API
 */
export async function deleteSajuAnalysis(
  c: Context
): Promise<Response> {
  const user = await getUserFromToken(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  try {
    const analysisId = c.req.param('id');
    if (!analysisId) {
      return c.json({ error: "분석 ID가 필요합니다." }, 400);
    }

    const result = await c.env.DB.prepare(`
      DELETE FROM saju_analyses 
      WHERE id = ? AND user_id = ?
    `).bind(analysisId, user.id).run();

    if (result.meta.changes === 0) {
      return c.json({ error: "분석 결과를 찾을 수 없습니다." }, 404);
    }

    return c.json({
      success: true,
      message: "분석 결과가 삭제되었습니다."
    }, 200);

  } catch (error) {
    console.error("분석 결과 삭제 오류:", error);
    return c.json(
      {
        error: "분석 결과를 삭제하는 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}