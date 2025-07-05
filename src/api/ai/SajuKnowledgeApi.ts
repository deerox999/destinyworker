import { PrismaClient } from "@prisma/client/edge";
import { PrismaD1 } from "@prisma/adapter-d1";
import {
  createEmbedding,
  findSimilarVectors,
  getDocumentsFromD1,
  RagEnv,
} from "../../common/ragUtils";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * D1에서 특정 대화 ID에 해당하는 기록을 가져옵니다.
 */
async function getConversationHistory(
  db: PrismaClient,
  conversationId: string
): Promise<ChatMessage[]> {
  const history = await db.conversationHistory.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      content: true,
    },
  });
  // Prisma 반환 타입과 ChatMessage 타입이 호환되므로 직접 반환
  return history as ChatMessage[];
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
 * 대화형 사주 챗봇의 핵심 핸들러
 */
async function handleSajuChat(
  request: Request,
  env: RagEnv,
  conversationId?: string
): Promise<Response> {
  const adapter = new PrismaD1(env.DB);
  const prisma = new PrismaClient({ adapter });

  const { message: userQuery, systemPrompt } = await request.json<{ message: string, systemPrompt?: string }>();
  if (!userQuery) {
    return new Response("'message' is required.", { status: 400 });
  }
  
  // TODO: 실제 인증 로직으로 교체해야 함
  const userId = 1; 
  
  const newConversationId = conversationId || crypto.randomUUID();

  try {
    // 1. 대화 기록 가져오기 (기존 대화인 경우)
    const history = conversationId
      ? await getConversationHistory(prisma, conversationId)
      : [];

    // 2. 최신 사용자 질문으로 RAG 파이프라인 실행
    const queryVector = await createEmbedding(env.AI, userQuery);
    const similarDocIds = await findSimilarVectors(
      env.VECTORIZE_INDEX,
      queryVector
    );
    const contextDocs = await getDocumentsFromD1(env.DB, similarDocIds);

    const contextMessage =
      contextDocs.length > 0
        ? `Context:\n${contextDocs.join("\n---\n")}`
        : "No context provided.";

    // 3. LLM에 전달할 전체 메시지 구성
    const messages: ChatMessage[] = [
      ...history, // 과거 대화 내용
      { role: "system", content: contextMessage }, // RAG로 찾은 현재 맥락
      { role: "user", content: userQuery }, // 사용자의 새 질문
    ];

    if (systemPrompt) {
        messages.unshift({ role: "system", content: systemPrompt });
    }

    // 4. LLM 호출
    const llmResponse = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages,
    });
    const assistantResponse = llmResponse.response || "죄송합니다. 답변을 생성할 수 없습니다.";

    // 5. 새로운 대화 내용 D1에 저장
    await saveConversationTurn(
      prisma,
      newConversationId,
      userId,
      userQuery,
      assistantResponse
    );

    return new Response(JSON.stringify({ 
        conversationId: newConversationId, 
        answer: assistantResponse 
    }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Saju chat error:", error);
    return new Response("Failed to process saju chat.", { status: 500 });
  } finally {
     await prisma.$disconnect();
  }
}

export default {
  async fetch(request: Request, env: RagEnv): Promise<Response> {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split("/").filter(Boolean);

    // CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
        },
      });
    }
    
    // 라우팅: /api/ai/saju-chat
    if (pathSegments[2] === "saju-chat" && request.method === "POST") {
      // 새 대화: /api/ai/saju-chat
      if (pathSegments.length === 3) {
        return handleSajuChat(request, env);
      }
      // 기존 대화: /api/ai/saju-chat/:id
      if (pathSegments.length === 4) {
        const conversationId = pathSegments[3];
        return handleSajuChat(request, env, conversationId);
      }
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<RagEnv>; 