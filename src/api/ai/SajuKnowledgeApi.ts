import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";
import {
  createEmbedding,
  findSimilarVectors,
  getDocumentsFromD1,
  RagEnv,
} from "../../common/ragUtils";
import { jsonResponse } from "../../common/utils";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface WebSearchResult {
  title: string;
  description: string;
  url: string;
}

/**
 * Brave Search API를 사용하여 웹 검색을 수행합니다.
 * @param query 검색어
 * @param apiKey Brave Search API 키
 * @returns 검색 결과 문자열 (여러 결과가 합쳐짐)
 */
async function performWebSearch(
  query: string,
  apiKey?: string
): Promise<string> {
  if (!apiKey) {
    console.log("BRAVE_API_KEY is not set, skipping web search.");
    return "";
  }
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
      query
    )}&count=5&safesearch=strict`;
    const response = await fetch(url, {
      headers: {
        "X-Subscription-Token": apiKey,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.error(
        `Brave Search API error: ${response.status} ${response.statusText}`,
        await response.text()
      );
      return "";
    }

    const data = (await response.json()) as any;
    const results = data.web?.results;

    if (!results || results.length === 0) {
      return "";
    }

    return results
      .map(
        (result: WebSearchResult) =>
          `[웹 검색 결과] 제목: ${result.title}\n내용: ${result.description}\n출처: ${result.url}`
      )
      .join("\n\n");
  } catch (error) {
    console.error("Error performing web search:", error);
    return "";
  }
}

// JWT 토큰에서 사용자 ID 추출
const getUserIdFromToken = async (request: Request): Promise<number | null> => {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  try {
    const token = authHeader.substring(7);
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
    );
    return payload.exp > Math.floor(Date.now() / 1000) ? payload.userId : null;
  } catch {
    return null;
  }
};

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
export async function SajuChat(
  request: Request,
  env: RagEnv,
  params?: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const pathSegments = url.pathname.split("/").filter(Boolean);
  const conversationId = pathSegments[3];

  const adapter = new PrismaD1(env.DB);
  const prisma = new PrismaClient({ adapter });

  const { message: userQuery, systemPrompt } = await request.json<{
    message: string;
    systemPrompt?: string;
  }>();
  if (!userQuery) {
    return jsonResponse({ error: "'message' is required." }, 400, request);
  }

  const userId = await getUserIdFromToken(request);
  if (!userId) {
    return jsonResponse({ error: "Unauthorized: Invalid token" }, 401, request);
  }

  const newConversationId = conversationId || crypto.randomUUID();

  try {
    // 1. 대화 기록 가져오기 (기존 대화인 경우)
    const history = conversationId
      ? await getConversationHistory(prisma, conversationId)
      : [];

    // 2. RAG 및 웹 검색 동시 실행
    const queryVector = await createEmbedding(env.AI, userQuery);

    const [ragDocs, webSearchResults] = await Promise.all([
      (async () => {
        const similarDocIds = await findSimilarVectors(
          env.VECTORIZE_INDEX,
          queryVector,
          10 // 웹 검색 결과를 위해 RAG 결과는 10개로 줄임
        );
        return getDocumentsFromD1(
          env.DB,
          similarDocIds.map((id) => id.toString())
        );
      })(),
      performWebSearch(userQuery, env.BRAVE_API_KEY),
    ]);

    const ragContext =
      ragDocs.length > 0
        ? `[내부 지식 베이스]:\n${ragDocs
            .map((doc) => {
              let context = `내용: ${doc.text}`;
              // 메타데이터가 존재하면 컨텍스트에 추가합니다.
              if (doc.metadata) {
                // 예시: 메타데이터를 JSON 문자열로 보기 좋게 포맷팅
                const metadataString = JSON.stringify(doc.metadata);
                context = `출처 정보: ${metadataString}\n${context}`;
              }
              return context;
            })
            .join("\n\n---\n\n")}`
        : "";

    const webContext =
      webSearchResults.length > 0
        ? `[최신 웹 검색 결과]:\n${webSearchResults}`
        : "";

    const fullContext = [ragContext, webContext].filter(Boolean).join("\n\n");

    const contextMessage = fullContext
      ? `너에게 제공되는 컨텍스트(Context)는 사용자의 질문과 관련된 참고 자료야. 이 컨텍스트는 [내부 지식 베이스]와 [최신 웹 검색 결과]로 구성되어 있어. 두 정보를 모두 종합적으로 참고해서 사용자의 질문에 대해 답변해줘. 컨텍스트에 질문과 일치하는 내용이 없으면, 아는 척하지 말고 반드시 "제공된 정보만으로는 답변하기 어렵습니다."라고 솔직하게 말해야 해.\n\n---\n\n${fullContext}`
      : "No context provided.";

    const messages: ChatMessage[] = [];

    // systemPrompt와 contextMessage를 결합하여 하나의 시스템 메시지로 만듭니다.
    const combinedSystemMessage = systemPrompt
      ? `${systemPrompt}\n\n---\n\n${contextMessage}`
      : contextMessage;

    messages.push({ role: "system", content: combinedSystemMessage });

    // 시스템 메시지 다음에 대화 기록과 현재 사용자 질문을 추가합니다.
    messages.push(...history, { role: "user", content: userQuery });

    // 4. LLM 호출
    const llmResponse = await env.AI.run("@cf/google/gemma-3-12b-it", {
      messages,
    });
    const assistantResponse =
      llmResponse.response || "죄송합니다. 답변을 생성할 수 없습니다.";

    // 5. 새로운 대화 내용 D1에 저장
    await saveConversationTurn(
      prisma,
      newConversationId,
      userId,
      userQuery,
      assistantResponse
    );

    return jsonResponse(
      {
        conversationId: newConversationId,
        answer: assistantResponse,
      },
      200,
      request
    );
  } catch (error) {
    console.error("Saju chat error:", error);
    return jsonResponse(
      { error: "Failed to process saju chat." },
      500,
      request
    );
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * 사용자의 전체 대화 목록을 조회합니다.
 */
export async function SajuChatList(
  request: Request,
  env: RagEnv
): Promise<Response> {
  const adapter = new PrismaD1(env.DB);
  const prisma = new PrismaClient({ adapter });

  try {
    const userId = await getUserIdFromToken(request);
    if (!userId) {
      return jsonResponse({ error: "Unauthorized" }, 401, request);
    }

    const results: {
      conversation_id: string;
      first_message: string;
      last_activity: string;
    }[] = await prisma.$queryRawUnsafe(
      `
        WITH FirstMessages AS (
            SELECT
                conversation_id,
                content,
                ROW_NUMBER() OVER(PARTITION BY conversation_id ORDER BY created_at ASC) as rn
            FROM conversation_histories
            WHERE user_id = ? AND role = 'user'
        ),
        LastActivity AS (
            SELECT
                conversation_id,
                MAX(created_at) as last_activity
            FROM conversation_histories
            WHERE user_id = ?
            GROUP BY conversation_id
        )
        SELECT
            fm.conversation_id,
            fm.content as first_message,
            la.last_activity
        FROM FirstMessages fm
        JOIN LastActivity la ON fm.conversation_id = la.conversation_id
        WHERE fm.rn = 1
        ORDER BY la.last_activity DESC;
        `,
      userId,
      userId
    );

    const conversations = results.map((r) => ({
      id: r.conversation_id,
      title: r.first_message.substring(0, 80),
      updatedAt: r.last_activity,
    }));

    return jsonResponse(
      {
        success: true,
        conversations,
      },
      200,
      request
    );
  } catch (error) {
    console.error("Error fetching conversation list:", error);
    return jsonResponse(
      { error: "Failed to fetch conversation list." },
      500,
      request
    );
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * 특정 대화의 전체 메시지 기록을 조회합니다.
 */
export async function SajuChatFull(
  request: Request,
  env: RagEnv,
  params?: Record<string, string>
): Promise<Response> {
  const adapter = new PrismaD1(env.DB);
  const prisma = new PrismaClient({ adapter });

  const url = new URL(request.url);
  const pathSegments = url.pathname.split("/").filter(Boolean);
  const conversationId = pathSegments[3];

  try {
    const userId = await getUserIdFromToken(request);
    if (!userId) {
      return jsonResponse({ error: "Unauthorized" }, 401, request);
    }

    const firstMessage = await prisma.conversationHistory.findFirst({
      where: { conversationId, userId },
    });

    if (!firstMessage) {
      return jsonResponse(
        { error: "Conversation not found or access denied" },
        404,
        request
      );
    }

    const messages = await getConversationHistory(prisma, conversationId);

    return jsonResponse(
      {
        success: true,
        conversationId,
        messages,
      },
      200,
      request
    );
  } catch (error) {
    console.error(`Error fetching conversation ${conversationId}:`, error);
    return jsonResponse(
      { error: "Failed to fetch conversation." },
      500,
      request
    );
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * 특정 대화 및 관련 메시지를 모두 삭제합니다.
 */
export async function SajuChatDelete(
  request: Request,
  env: RagEnv,
  params?: Record<string, string>
): Promise<Response> {
  const adapter = new PrismaD1(env.DB);
  const prisma = new PrismaClient({ adapter });

  const url = new URL(request.url);
  const pathSegments = url.pathname.split("/").filter(Boolean);
  const conversationId = pathSegments[3];

  try {
    const userId = await getUserIdFromToken(request);
    if (!userId) {
      return jsonResponse({ error: "Unauthorized" }, 401, request);
    }

    // 대화 소유권 확인
    const conversation = await prisma.conversationHistory.findFirst({
      where: { conversationId, userId },
      select: { id: true },
    });

    if (!conversation) {
      return jsonResponse(
        { error: "Conversation not found or access denied" },
        404,
        request
      );
    }

    // 해당 대화의 모든 메시지 삭제
    const { count } = await prisma.conversationHistory.deleteMany({
      where: { conversationId, userId },
    });

    return jsonResponse(
      {
        success: true,
        message: `Conversation ${conversationId} and its ${count} messages have been deleted.`,
        deletedMessagesCount: count,
      },
      200,
      request
    );
  } catch (error) {
    console.error(`Error deleting conversation ${conversationId}:`, error);
    return jsonResponse(
      { error: "Failed to delete conversation." },
      500,
      request
    );
  } finally {
    await prisma.$disconnect();
  }
}
