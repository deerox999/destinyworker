/*
 GEMINI_API_KEY = "YOUR_GEMINI_API_KEY_HERE"
 사용하려면, GEMINI API키 추가 필요함.
*/
import { Ai, D1Database, VectorizeIndex } from "@cloudflare/workers-types";
import {
  createEmbedding,
  findSimilarVectors,
  getDocumentsFromD1,
  RagEnv
} from "../../common/ragUtils";
import {
  corsHeaders,
  getUserFromToken,
  jsonResponse
} from "../../common/utils";

// Gemini API와 통신하기 위한 환경 변수 확장
export interface Env extends RagEnv {
  AI: Ai; // Cloudflare AI (임베딩용)
  VECTORIZE_INDEX: VectorizeIndex;
  DB: D1Database;
  GEMINI_API_KEY: string; // Gemini API 키
}

// Gemini API 요청 본문 타입 정의
// 공식 API 문서를 기반으로 가능한 모든 옵션을 포함합니다.
// https://ai.google.dev/api/rest/v1beta/models/generateContent
interface GeminiApiRequest {
  contents: Content[];
  systemInstruction?: Content;
  tools?: Tool[];
  toolConfig?: ToolConfig;
  safetySettings?: SafetySetting[];
  generationConfig?: GenerationConfig;
  // 스트리밍 응답을 클라이언트에서 직접 제어하기 위한 커스텀 필드
  stream?: boolean;
}

// API 사용자가 보내는 요청 본문 타입 정의
interface SajuAnalysisRequest {
  model?: string; // 사용할 Gemini 모델 (e.g., "gemini-1.5-pro-latest")
  userPrompt: string;
  systemPrompt?: string; // systemInstruction을 간편하게 설정하기 위한 필드
  history?: Content[]; // 대화 기록
  stream?: boolean; // 스트리밍 응답 여부
  generationConfig?: GenerationConfig; // 생성 관련 고급 설정
  safetySettings?: SafetySetting[]; // 안전 관련 고급 설정
  tools?: Tool[]; // 함수 호출 기능
  toolConfig?: ToolConfig;
}

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
    | "BLOCK_LOW_AND_ABOVE";
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
}

/**
 * 사용자 요청을 바탕으로 Gemini API에 보낼 요청 본문을 생성합니다.
 */
function buildGeminiPayload(
  body: SajuAnalysisRequest,
  ragContext: string
): GeminiApiRequest {
  // 1. 대화 기록(history) 구성
  const contents: Content[] = body.history || [];

  // 2. 현재 사용자 프롬프트 추가
  contents.push({
    role: "user",
    parts: [{ text: body.userPrompt }],
  });

  // 3. 시스템 프롬프트 구성 (RAG 컨텍스트 포함)
  const originalSystemPrompt =
    body.systemPrompt ||
    "당신은 전문 사주명리학자입니다. 사용자의 사주 정보를 바탕으로 상세하고 친절하게 운세를 분석해주세요.";
  const finalSystemPrompt = `${ragContext}\n\n---\n\n${originalSystemPrompt}`;

  const systemInstruction: Content = {
    role: "tool", // Gemini에서는 시스템 프롬프트를 'tool' 역할로 전달하는 것을 권장하기도 합니다.
    parts: [{ text: finalSystemPrompt }],
  };

  // 4. 최종 API 요청 객체 생성
  const payload: GeminiApiRequest = {
    contents,
    systemInstruction,
    generationConfig: body.generationConfig || {
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
      maxOutputTokens: 2048,
    },
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
  request: Request,
  env: Env,
  params?: Record<string, string>
): Promise<Response> {
  // 1. 사용자 인증 (기존 로직 재사용)
  const user = await getUserFromToken(request);
  if (!user) {
    return jsonResponse({ error: "Unauthorized: Invalid token" }, 401, request);
  }

  try {
    const body: SajuAnalysisRequest = await request.json();
    const model = body.model || "gemini-1.5-pro-latest";

    // 2. RAG 파이프라인 실행 (기존 로직 재사용)
    const queryVector = await createEmbedding(env.AI, body.userPrompt);
    const similarDocIds = await findSimilarVectors(
      env.VECTORIZE_INDEX,
      queryVector
    );
    const contextDocs = await getDocumentsFromD1(
      env.DB,
      similarDocIds.map((id) => id.toString())
    );
    const ragContext =
      contextDocs.length > 0
        ? `Here is some context from my knowledge base, use it to answer the user's question:\n${contextDocs
            .map((doc) => doc.text)
            .join("\n---\n")}`
        : "No relevant context found in the knowledge base.";

    // 3. Gemini API 요청 페이로드 생성
    const geminiPayload = buildGeminiPayload(body, ragContext);

    // 4. Gemini API 호출
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${
      body.stream ? "streamGenerateContent" : "generateContent"
    }?key=${env.GEMINI_API_KEY}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(geminiPayload),
    });

    if (!geminiResponse.ok) {
      const errorBody = await geminiResponse.json();
      console.error("Gemini API Error:", errorBody);
      return jsonResponse(
        {
          error: "Gemini API request failed",
          details: errorBody,
        },
        geminiResponse.status,
        request
      );
    }

    // 5. 응답 처리 (스트리밍 / 일반)
    if (body.stream) {
      // 스트리밍 응답인 경우, ReadableStream을 그대로 반환
      const headers = new Headers(geminiResponse.headers);
      Object.entries(corsHeaders(request)).forEach(([key, value]) => {
        headers.set(key, value);
      });
      // SSE(Server-Sent Events) 형식임을 명시
      headers.set("Content-Type", "text/event-stream; charset=utf-8");
      headers.set("Cache-Control", "no-cache");
      headers.set("Connection", "keep-alive");
      headers.set("X-AI-Model", model);
      headers.set("X-Stream-Response", "true");

      return new Response(geminiResponse.body, {
        status: geminiResponse.status,
        headers: headers,
      });
    } else {
      // 일반 응답인 경우, JSON 파싱 후 반환
      const result = await geminiResponse.json();

      // AI 사용량 로깅 (Gemini 응답 형식에 따라 추후 수정 필요)
      // Gemini API는 응답에 직접적인 토큰 사용량을 포함하지 않을 수 있음.
      // 필요 시 프롬프트/응답 텍스트 기반으로 토큰 수 계산 로직 추가 필요.
      // if (result.usage) {
      //   await logAiUsage(env.DB, user.id, model, result.usage);
      // }

      return jsonResponse(result, 200, request);
    }
  } catch (error) {
    console.error("Gemini 사주 분석 API 오류:", error);
    return jsonResponse(
      {
        error: "An error occurred while processing your request.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500,
      request
    );
  }
} 