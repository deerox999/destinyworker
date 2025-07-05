import { Ai, D1Database, VectorizeIndex } from "@cloudflare/workers-types";
import {
  createEmbedding,
  findSimilarVectors,
  getDocumentsFromD1,
  RagEnv,
} from "../../common/ragUtils";

export interface Env extends RagEnv {
  AI: Ai;
  VECTORIZE_INDEX: VectorizeIndex;
  DB: D1Database;
}

/**
 * Cloudflare Workers AI 고급 사용법 가이드
 *
 * 1. AI Gateway: 요청 로깅, 캐싱, 재시도, 폴백 모델 설정 가능
 * 2. 타입 안전성: 모델별 특화된 입력/출력 타입 활용
 * 3. 다양한 옵션: returnRawResponse, stream, 모델별 특수 파라미터
 * 4. AutoRAG: 자동 검색 증강 생성 (RAG) 기능
 * 5. 모델 검색: 사용 가능한 모델 동적 탐색
 *
 * @cf/qwen/qwen2.5-coder-32b-instruct는 'Coder'로서의 논리적, 구조적 사고에 강점이 있습니다.
 * 사주 명리학도 일종의 규칙과 패턴을 따르는 시스템이므로, 이 점이 파인튜닝 시 긍정적인 영향을 줄 수 있습니다.
 *
 * price
 * 사용량은 10000개의 뉴런 당 US$0.11의 비율을 기준으로 청구서에 뉴런으로 표시됩니다.
 * US$0.66 per M input tokens
 * US$1 per M output tokens
 *
 * Workers AI: 월 10,000 뉴런 (Workers Paid 플랜에 포함)
 * 예상 사용량: 한 번의 요청당 약 1.78 뉴런
 * 월 무료 할당량으로 약 5,617번의 요청 처리 가능
 */

/**
 * API 요청 본문에 대한 타입 정의
 */
interface DetailedFortuneTellingRequest {
  systemPrompt?: string;
  userPrompt?: string;
  max_tokens?: number;
  temperature?: number;
  model?: string;
  useGateway?: boolean;
  gatewayId?: string;
  returnRawResponse?: boolean;
  stream?: boolean;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  seed?: number;
}

/**
 * AI 모델에 전달할 파라미터를 생성합니다.
 * @param body 요청 본문
 * @returns AI.run()에 사용될 파라미터 객체
 */
function buildAiParams(body: DetailedFortuneTellingRequest): object {
  const params: any = {
    messages: [
      {
        role: "system",
        content: body.systemPrompt || "당신은 전문 사주명리학자입니다.",
      },
      { role: "user", content: body.userPrompt || "사주 분석을 해주세요." },
    ],
    max_tokens: Math.max(1, Math.min(body.max_tokens || 1500, 32000)),
    temperature: Math.max(
      0,
      Math.min(body.temperature !== undefined ? body.temperature : 0.3, 2.0)
    ),
  };

  if (body.stream) {
    params.stream = true;
  }
  if (body.returnRawResponse) {
    params.returnRawResponse = true;
  }

  // 고급 파라미터들을 조건부로 추가 (유효한 값만)
  if (typeof body.top_p === "number" && body.top_p >= 0 && body.top_p <= 1) {
    params.top_p = body.top_p;
  }
  if (
    typeof body.frequency_penalty === "number" &&
    body.frequency_penalty >= -2 &&
    body.frequency_penalty <= 2
  ) {
    params.frequency_penalty = body.frequency_penalty;
  }
  if (
    typeof body.presence_penalty === "number" &&
    body.presence_penalty >= -2 &&
    body.presence_penalty <= 2
  ) {
    params.presence_penalty = body.presence_penalty;
  }
  if (typeof body.seed === "number" && Number.isInteger(body.seed)) {
    params.seed = body.seed;
  }

  return params;
}

/**
 * AI Gateway 사용 설정을 생성합니다.
 * @param body 요청 본문
 * @returns AI.run()에 사용될 게이트웨이 설정 객체
 */
function buildGatewayConfig(
  body: DetailedFortuneTellingRequest
): { gateway: { id: string } } | undefined {
  if (body.useGateway && body.gatewayId && body.gatewayId.trim().length > 0) {
    return { gateway: { id: body.gatewayId.trim() } };
  }
  return undefined;
}

/**
 * AI 모델의 응답을 바탕으로 최종 HTTP 응답을 생성합니다.
 * @param aiResult AI 모델의 실행 결과
 * @param requestBody 원본 요청 본문
 * @param model 사용된 모델명
 * @returns 최종 Response 객체
 */
function createApiResponse(
  aiResult: any,
  requestBody: DetailedFortuneTellingRequest,
  model: string
): Response {
  const { useGateway = false, stream = false } = requestBody;

  // 스트리밍 응답 처리
  if (
    stream &&
    (aiResult instanceof Response || aiResult instanceof ReadableStream)
  ) {
    const responseStream =
      aiResult instanceof ReadableStream ? new Response(aiResult) : aiResult;

    const headers = new Headers(responseStream.headers);
    headers.set("Content-Type", "text/event-stream; charset=utf-8");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("X-AI-Model", model);
    headers.set("X-Gateway-Enabled", useGateway.toString());
    headers.set("X-Stream-Response", "true");

    return new Response(responseStream.body, {
      status: responseStream.status,
      headers: headers,
    });
  }

  // 일반(non-streaming) 응답 처리
  if (
    !aiResult ||
    (typeof aiResult === "object" && Object.keys(aiResult).length === 0)
  ) {
    throw new Error("AI 모델로부터 유효한 응답을 받지 못했습니다.");
  }

  const enhancedResponse = {
    ...(aiResult || {}),
    metadata: {
      model_used: model,
      gateway_enabled: useGateway,
      timestamp: new Date().toISOString(),
      stream_enabled: stream,
      response_type: typeof aiResult,
    },
  };

  return new Response(JSON.stringify(enhancedResponse), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "X-AI-Model": model,
      "X-Gateway-Enabled": useGateway.toString(),
    },
  });
}

/**
 * 상세 사주 풀이 요청을 처리합니다.
 */
async function handleDetailedFortuneTelling(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body: DetailedFortuneTellingRequest = await request.json();

    const model = body.model || "@cf/qwen/qwen2.5-coder-32b-instruct";
    
    // RAG 파이프라인 실행
    // 1. 사용자의 프롬프트를 기반으로 관련 문서 검색
    const queryVector = await createEmbedding(env.AI, body.userPrompt || "");
    const similarDocIds = await findSimilarVectors(
      env.VECTORIZE_INDEX,
      queryVector
    );
    const contextDocs = await getDocumentsFromD1(env.DB, similarDocIds);

    // 2. 검색된 문서를 시스템 프롬프트에 컨텍스트로 추가
    const ragContext =
      contextDocs.length > 0
        ? `Here is some context from my knowledge base, use it to answer the user's question:\n${contextDocs.join(
            "\n---\n"
          )}`
        : "";

    const originalSystemPrompt =
      body.systemPrompt || "당신은 전문 사주명리학자입니다.";
    const finalSystemPrompt = `${ragContext}\n\n${originalSystemPrompt}`;

    // 3. RAG 컨텍스트가 포함된 프롬프트로 AI 파라미터 빌드
    const aiParams = buildAiParams({
      ...body,
      systemPrompt: finalSystemPrompt,
    });

    console.log(
      "AI 요청 파라미터 (RAG 적용):",
      JSON.stringify(
        { model, params: aiParams, gateway: buildGatewayConfig(body)?.gateway },
        null,
        2
      )
    );

    const result = await env.AI.run(
      model as any,
      aiParams,
      buildGatewayConfig(body)
    );

    console.log("AI 응답 수신:", {
      type: typeof result,
      isResponse: result instanceof Response,
      isStream: result instanceof ReadableStream,
    });

    return createApiResponse(result, body, model);
  } catch (error) {
    console.error("상세 사주 풀이 오류:", error);
    const errorResponse = {
      message: "상세 사주 풀이 중 오류가 발생했습니다",
      error: error instanceof Error ? error.message : String(error),
      details: error instanceof Error ? error.stack : "알 수 없는 오류",
      timestamp: new Date().toISOString(),
      debug_info: {
        url: request.url,
        method: request.method,
      },
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}

/**
 * 사주 분석에 대한 모델 적합성 점수 계산
 * @param model 모델 정보
 * @returns 0-100 사이의 점수
 */
function calculateSajuSuitability(model: any): number {
  // model이 null/undefined인 경우 기본 점수 반환
  if (!model || typeof model !== "object") {
    return 30; // 기본 최소 점수
  }

  let score = 50; // 기본 점수

  const name = (model.name || "").toLowerCase();
  const description = (model.description || "").toLowerCase();

  // 논리적 사고에 강한 모델들 가점
  if (name.includes("coder")) score += 20;
  if (name.includes("instruct")) score += 15;
  if (description.includes("reasoning")) score += 15;
  if (description.includes("logic")) score += 10;

  // 대화형 모델 가점
  if (name.includes("chat") || name.includes("assistant")) score += 10;

  // 큰 모델일수록 복잡한 사주 분석에 유리
  try {
    const parameterMatch = name.match(/(\d+)b/);
    if (parameterMatch && parameterMatch[1]) {
      const params = parseInt(parameterMatch[1]);
      if (!isNaN(params)) {
        if (params >= 30) score += 15;
        else if (params >= 13) score += 10;
        else if (params >= 7) score += 5;
      }
    }
  } catch (error) {
    console.warn("파라미터 매칭 중 오류:", error);
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * CORS Preflight 요청을 처리합니다.
 */
function handleOptionsRequest(): Response {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return handleOptionsRequest();
    }

    switch (url.pathname) {
      case "/api/detailed-fortune-telling":
        if (request.method === "POST") {
          return handleDetailedFortuneTelling(request, env);
        }
        break;
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
