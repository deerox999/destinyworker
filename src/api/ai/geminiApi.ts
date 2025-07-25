import { GoogleGenAI } from '@google/genai';
import { PrismaClient } from "@prisma/client";
import { Context } from "hono";
import { createPrismaClient } from "../../common/prismaUtils";
import {
  createEmbedding,
  findSimilarVectors,
  getDocumentsFromD1,
  RagEnv
} from "../../common/ragUtils";
import { getUserFromToken } from "../../common/utils";

// Gemini API와 통신하기 위한 환경 변수 확장
export interface Env extends RagEnv {
  AI: Ai; // Cloudflare AI (임베딩용)
  VECTORIZE_INDEX: VectorizeIndex;
  DB: D1Database;
  GOOGLE_GEMINI_API_KEY: string; // Gemini API 키
}

// Gemini API 요청 본문 타입 정의
// 공식 API 문서를 기반으로 가능한 모든 옵션을 포함합니다.
// https://ai.google.dev/api/rest/v1beta/models/generateContent
interface GeminiApiRequest {
  contents: Content[];
  tools?: Tool[];
  toolConfig?: ToolConfig;
  safetySettings?: SafetySetting[];
  generationConfig?: GenerationConfig;
  // 스트리밍 응답을 클라이언트에서 직접 제어하기 위한 커스텀 필드
  stream?: boolean;
}

// API 사용자가 보내는 요청 본문 타입 정의
interface SajuAnalysisRequest {
  model?: string; // 사용할 Gemini 모델 (e.g., "gemini-2.5-pro-latest")
  userPrompt: string;
  systemPrompt?: string; // systemInstruction을 간편하게 설정하기 위한 필드
  conversationId?: string | null; // 대화 ID (기존 대화 이어가기용)
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
  // codeExecution: {}; // 현재는 functionDeclarations만 주로 사용
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
 * D1에서 특정 대화 ID에 해당하는 기록을 가져옵니다.
 */
async function getConversationHistory(
  db: PrismaClient,
  conversationId: string
): Promise<Content[]> {
  const history = await db.conversationHistory.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      content: true,
    },
  });

  // Prisma 결과를 Gemini Content 형식으로 변환
  return history.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));
}

/**
 * 사주 정보를 대화별로 저장합니다.
 */
async function saveSajuData(
  db: PrismaClient,
  conversationId: string,
  userId: number,
  sajuData: SajuData
) {
  // 사주 정보를 JSON 형태로 저장
  await db.conversationHistory.create({
    data: {
      conversationId,
      userId,
      role: "system", // 시스템 메시지로 저장
      content: JSON.stringify({
        type: "saju_data",
        data: sajuData,
        timestamp: new Date().toISOString()
      }),
    },
  });
}

/**
 * 대화에서 사주 정보를 가져옵니다.
 */
async function getSajuData(
  db: PrismaClient,
  conversationId: string
): Promise<SajuData | null> {
  const sajuMessage = await db.conversationHistory.findFirst({
    where: {
      conversationId,
      role: "system",
      content: {
        contains: '"type":"saju_data"'
      }
    },
    orderBy: { createdAt: "asc" }
  });

  if (sajuMessage) {
    try {
      const parsed = JSON.parse(sajuMessage.content);
      return parsed.data;
    } catch (error) {
      console.error("사주 정보 파싱 오류:", error);
      return null;
    }
  }

  return null;
}

/**
 * 사용자의 질문과 AI의 답변을 대화 기록에 저장합니다.
 */
async function saveConversationTurn(
  db: PrismaClient,
  conversationId: string,
  userId: number,
  userMessage: string,
  assistantMessage: string
) {
  await db.conversationHistory.createMany({
    data: [
      {
        conversationId,
        userId,
        role: "user",
        content: userMessage,
      },
      {
        conversationId,
        userId,
        role: "assistant",
        content: assistantMessage,
      },
    ],
  });
}

/**
 * 사용자 요청을 바탕으로 Gemini API에 보낼 요청 본문을 생성합니다.
 */
function buildGeminiPayload(
  body: SajuAnalysisRequest,
  ragContext: string,
  history: Content[] = [],
  sajuData?: SajuData
): any {
  // 1. 시스템 프롬프트 구성 (단순화)
  const originalSystemPrompt =
    body.systemPrompt ||
    "당신은 전문 사주명리학자입니다. 사용자의 사주 정보를 바탕으로 상세하고 친절하게 운세를 분석해주세요.";
  
  let finalSystemPrompt = originalSystemPrompt;

  // RAG 컨텍스트 추가 (간단하게)
  if (ragContext) {
    finalSystemPrompt = `${ragContext}\n\n${finalSystemPrompt}`;
  }

  // 사주 정보가 있으면 간단한 형태로 추가
  if (sajuData) {
    finalSystemPrompt = `${finalSystemPrompt}\n\n사용자 사주 정보가 제공되었습니다. 이를 바탕으로 분석해주세요.`;
  }

  // 2. contents 배열 구성 (단순화)
  const contents: Content[] = [];

  // 사주 데이터가 있으면 별도 메시지로 추가
  if (sajuData) {
    contents.push({
      role: "user",
      parts: [{ text: `사주 데이터: ${JSON.stringify(sajuData, null, 2)}` }],
    });
  }

  // 대화 기록 추가
  contents.push(...history);

  // 현재 사용자 프롬프트와 시스템 프롬프트를 합쳐서 추가
  const combinedPrompt = `${finalSystemPrompt}\n\n${body.userPrompt}`;
  contents.push({
    role: "user",
    parts: [{ text: combinedPrompt }],
  });

  // 5. 최종 API 요청 객체 생성 - 구조 수정
  const payload: any = {
    model: body.model || "gemini-2.5-flash",
    contents,
    // config 객체 제거하고 최상위 레벨로 이동
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
 * Gemini AI를 활용한 상세 사주 풀이 API
 */
export async function SajuAnalysisWithGemini(
  c: Context
): Promise<Response> {
  const user = await getUserFromToken(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  const prisma = createPrismaClient(c.env.DB);

  try {
    const body: SajuAnalysisRequest = await c.req.json();
    const model = body.model || "gemini-2.5-pro"; // default는 Gemini 2.5 pro 사용 (더 안정적)
    // 대화 ID 생성 또는 기존 ID 사용
    const conversationId = body.conversationId || crypto.randomUUID();

    // 2. 대화 기록 가져오기 (기존 대화인 경우)
    const history = body.conversationId && body.conversationId !== null
      ? await getConversationHistory(prisma, body.conversationId)
      : [];

    // 3. 사주 정보 처리
    let sajuData: SajuData | undefined;
    
    if (body.sajuData) {
      // 새로운 사주 정보가 전송된 경우 저장
      sajuData = body.sajuData;
      await saveSajuData(prisma, conversationId, user.id, sajuData);
    } else if (body.conversationId && body.conversationId !== null) {
      // 기존 대화에서 사주 정보 가져오기
      const cachedSajuData = await getSajuData(prisma, body.conversationId);
      if (cachedSajuData) {
        sajuData = cachedSajuData;
      }
    }

    // 4. RAG 파이프라인 실행 (기존 로직 재사용)
    const queryVector = await createEmbedding(c.env.AI, body.userPrompt);
    const similarDocIds = await findSimilarVectors(
      c.env.VECTORIZE_INDEX,
      queryVector
    );
    const contextDocs = await getDocumentsFromD1(
      c.env.DB,
      similarDocIds.map((id) => id.toString())
    );
    const ragContext =
      contextDocs.length > 0
        ? `Here is some context from my knowledge base, use it to answer the user's question:\n${contextDocs
            .map((doc) => doc.text)
            .join("\n---\n")}`
        : "No relevant context found in the knowledge base.";

    // 5. Gemini API 요청 페이로드 생성 (사주 정보 포함)
    const geminiPayload = buildGeminiPayload(body, ragContext, history, sajuData);

    // 6. Google GenAI SDK 초기화
    const ai = new GoogleGenAI({
      apiKey: c.env.GOOGLE_GEMINI_API_KEY
    });

    // 7. Gemini API 호출 (SDK 사용)
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
      Object.entries(c.req.header()).forEach(([key, value]) => {
        headers.set(key, value as string);
      });
      headers.set("Content-Type", "text/event-stream; charset=utf-8");
      headers.set("Cache-Control", "no-cache");
      headers.set("Connection", "keep-alive");
      headers.set("X-AI-Model", model);
      headers.set("X-Stream-Response", "true");
      headers.set("X-Conversation-Id", conversationId);

      return new Response(stream, {
        status: 200,
        headers: headers,
      });
    } else {
      // 일반 응답
      const result = await ai.models.generateContent(geminiPayload);
      const text = result.text || "죄송합니다. 답변을 생성할 수 없습니다.";

      // 8. 대화 기록 저장
      await saveConversationTurn(
        prisma,
        conversationId,
        user.id,
        body.userPrompt,
        text
      );

      // AI 사용량 로깅 (SDK에서는 usage 정보를 직접 제공하지 않으므로 생략)
      // await logAiUsage(c.env.DB, user.id, model, resultData.usage);

      // 응답 형식 변환 (SajuKnowledgeApi와 유사하게)
      const enhancedResponse = {
        conversationId: conversationId,
        answer: text,
        metadata: {
          model_used: model,
          gateway_enabled: false,
          timestamp: new Date().toISOString(),
          stream_enabled: false,
          response_type: "text",
        },
      };

      return c.json(enhancedResponse, 200);
    }
  } catch (error) {
    console.error("Gemini 사주 분석 API 오류:", error);
    return c.json(
      {
        error: "An error occurred while processing your request.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500,
      c.req.header()
    );
  } finally {
    await prisma.$disconnect();
  }
} 

/**
 * 테스트용 간단한 Gemini API
 * systemPrompt와 userPrompt만 받아서 응답하는 최소한의 API
 */
export async function TestGeminiApi(
  c: Context
): Promise<Response> {
  try {
    const body = await c.req.json();
    const { systemPrompt, userPrompt } = body;

    if (!userPrompt) {
      return c.json({ error: "userPrompt는 필수입니다." }, 400);
    }

    // Google GenAI SDK 초기화
    const ai = new GoogleGenAI({
      apiKey: c.env.GOOGLE_GEMINI_API_KEY
    });

    // 간단한 페이로드 생성
    const payload = {
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: systemPrompt 
                ? `${systemPrompt}\n\n${userPrompt}`
                : userPrompt
            }
          ]
        }
      ],
      config: {
        temperature: 0.3,
        topP: 0.8,
        topK: 20,
        maxOutputTokens: 2000,
      }
    };

    // Gemini API 호출
    const result = await ai.models.generateContent(payload);
    const text = result.text || "응답을 생성할 수 없습니다.";

    return c.json({
      success: true,
      response: text,
      model: "gemini-2.5-flash",
      timestamp: new Date().toISOString()
    }, 200);

  } catch (error) {
    console.error("테스트 Gemini API 오류:", error);
    return c.json(
      {
        error: "API 호출 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
} 