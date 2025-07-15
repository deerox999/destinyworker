import { Ai, D1Database, VectorizeIndex } from "@cloudflare/workers-types";
import { Context, MiddlewareHandler } from "hono";
import {
  createEmbedding,
  findSimilarVectors,
  getDocumentsFromD1,
  logAiUsage,
  RagEnv,
} from "../../common/ragUtils";

export interface Env extends RagEnv {
  AI: Ai;
  VECTORIZE_INDEX: VectorizeIndex;
  DB: D1Database;
}

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
 * @param request 요청
 * @returns 최종 Response 객체
 */
function createApiResponse(
  aiResult: any,
  requestBody: DetailedFortuneTellingRequest,
  model: string,
  c: Context
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
    // Hono의 c.res.headers를 직접 사용하거나, c.header()를 사용하여 헤더 설정
    headers.set("Content-Type", "text/event-stream; charset=utf-8");
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
  return c.json(enhancedResponse, 200);
}

/**
 * 상세 사주 풀이 요청을 처리합니다.
 */
export async function FortuneTelling(
  c: Context
): Promise<Response> {
  // 1. 사용자 인증
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  try {
    const body: DetailedFortuneTellingRequest = await c.req.json();

    const model = body.model || "@cf/qwen/qwen2.5-coder-32b-instruct";

    // RAG 파이프라인 실행
    // 1. 사용자의 프롬프트를 기반으로 관련 문서 검색
    const queryVector = await createEmbedding(c.env.AI, body.userPrompt || "");
    const similarDocIds = await findSimilarVectors(
      c.env.VECTORIZE_INDEX,
      queryVector
    );
    const contextDocs = await getDocumentsFromD1(
      c.env.DB,
      similarDocIds.map((id) => id.toString())
    );

    // 2. 검색된 문서를 시스템 프롬프트에 컨텍스트로 추가
    const ragContext =
      contextDocs.length > 0
        ? `Here is some context from my knowledge base, use it to answer the user's question:\n${contextDocs
            .map((doc) => {
              let context = doc.text;
              if (doc.metadata) {
                context += `\n(Source Metadata: ${JSON.stringify(
                  doc.metadata
                )})`;
              }
              return context;
            })
            .join("\n---\n")}`
        : "";

    const originalSystemPrompt =
      body.systemPrompt || "당신은 전문 사주명리학자입니다.";
    const finalSystemPrompt = `${ragContext}\n\n${originalSystemPrompt}`;

    // 3. RAG 컨텍스트가 포함된 프롬프트로 AI 파라미터 빌드
    const aiParams = buildAiParams({
      ...body,
      systemPrompt: finalSystemPrompt,
    });

    const result = await c.env.AI.run(
      model as any,
      aiParams,
      buildGatewayConfig(body)
    );

    // 4. AI 사용량 로깅 (스트리밍이 아닌 경우)
    // Cloudflare AI 응답에 'usage' 객체가 포함되어 있는지 확인합니다.
    if (!body.stream && result && result.usage) {
      await logAiUsage(c.env.DB, user.id, model, result.usage);
    }

    return createApiResponse(result, body, model, c);
  } catch (error) {
    console.error("상세 사주 풀이 API 오류:", error);
    return c.json(
      {
        error: "AI 모델 실행 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500,
      c.req.header()
    );
  }
}
