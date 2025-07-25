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
  stream?: boolean; // 스트리밍 응답 여부
  generationConfig?: GenerationConfig; // 생성 관련 고급 설정
  safetySettings?: SafetySetting[]; // 안전 관련 고급 설정
  tools?: Tool[]; // 함수 호출 기능
  toolConfig?: ToolConfig;
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

  // 1. 시스템 프롬프트 구성
  const systemPrompt = body.systemPrompt || 
    "당신은 전문 사주명리학자입니다. 사용자의 사주 정보를 바탕으로 상세하고 친절하게 운세를 분석해주세요.";

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

    // 1. Gemini API 요청 페이로드 생성
    const geminiPayload = buildGeminiPayload(body);

    // 2. Google GenAI SDK 초기화
    const ai = new GoogleGenAI({
      apiKey: c.env.GOOGLE_GEMINI_API_KEY
    });

    // 3. Gemini API 호출
    if (body.stream) {
      // 스트리밍 응답
      const streamingResp = await ai.models.generateContentStream(geminiPayload);
      
      // ReadableStream 생성
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of streamingResp) {
              if (chunk.text) {
                // SSE 형식으로 데이터 전송
                const data = `data: ${JSON.stringify({ text: chunk.text })}\n\n`;
                controller.enqueue(new TextEncoder().encode(data));
              } else {
                // 메타데이터나 다른 정보도 전송
                const data = `data: ${JSON.stringify(chunk)}\n\n`;
                controller.enqueue(new TextEncoder().encode(data));
              }
            }
            // 스트림 종료
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            controller.close();
          } catch (error) {
            console.error("스트리밍 오류:", error);
            controller.error(error);
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
      const result = await ai.models.generateContent(geminiPayload);
      const text = result.text || "죄송합니다. 답변을 생성할 수 없습니다.";

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
      const streamingResp = await ai.models.generateContentStream(geminiPayload);
      
      // ReadableStream 생성
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of streamingResp) {
              if (chunk.text) {
                // SSE 형식으로 데이터 전송
                const data = `data: ${JSON.stringify({ text: chunk.text })}\n\n`;
                controller.enqueue(new TextEncoder().encode(data));
              } else {
                // 메타데이터나 다른 정보도 전송
                const data = `data: ${JSON.stringify(chunk)}\n\n`;
                controller.enqueue(new TextEncoder().encode(data));
              }
            }
            // 스트림 종료
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            controller.close();
          } catch (error) {
            console.error("궁합 분석 스트리밍 오류:", error);
            controller.error(error);
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
      if (pointValidation.data) {
        headers.set("X-Points-Data", JSON.stringify(pointValidation.data));
      }

      return new Response(stream, {
        status: 200,
        headers: headers,
      });
    } else {
      // 일반 응답
      const result = await ai.models.generateContent(geminiPayload);
      const text = result.text || "죄송합니다. 궁합 분석을 생성할 수 없습니다.";

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