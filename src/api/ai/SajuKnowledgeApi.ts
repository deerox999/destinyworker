import { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "../../common/prismaUtils";
import {
  createEmbedding,
  findSimilarVectors,
  getDocumentsFromD1,
  logAiUsage,
  RagEnv,
} from "../../common/ragUtils";
import { getUserFromToken, jsonResponse } from "../../common/utils";
import {
  getPersonaPrompt,
  getRejectionMessage,
  SupportedLanguage,
} from "./prompt/sajuTeacher";

/**
 * 사용자의 질문이 사주 관련 주제인지 확인합니다.
 * @param ai Cloudflare AI 인스턴스
 * @param query 사용자 질문
 * @returns 관련성이 있으면 true, 그렇지 않으면 false
 */
async function isQuerySajuRelated(ai: any, query: string): Promise<boolean> {
  try {
    const { response } = await ai.run("@cf/meta/llama-3-8b-instruct", {
      prompt: `Is the following user query about "saju", "fortune-telling", "destiny", "tarot", "astrology", or other esoteric/divination topics? Answer with only "yes" or "no". Query: "${query}"`,
      max_tokens: 5,
    });

    // 응답을 소문자로 변환하고 앞뒤 공백을 제거한 후 "yes"가 포함되어 있는지 확인합니다.
    const isRelated = response.toLowerCase().trim().includes("yes");
    console.log(
      `Relevance check for '${query}': AI response is '${response.trim()}', Determined: ${isRelated}`
    );
    return isRelated;
  } catch (error) {
    console.error("Error during relevance check:", error);
    // 오류 발생 시 안전하게 관련 있는 것으로 간주하여 처리를 계속 진행합니다.
    return true;
  }
}

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
 * 사용자의 전체 대화 목록을 조회합니다.
 */
export async function SajuChatList(
  request: Request,
  env: RagEnv
): Promise<Response> {
  const prisma = createPrismaClient(env.DB);

  try {
    const user = await getUserFromToken(request);
    if (!user) {
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
      user.id,
      user.id
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

  const prisma = createPrismaClient(env.DB);

  const {
    message: userQuery,
    i18n,
  } = await request.json<{
    message: string;
    i18n?: string;
  }>();

  // 언어 유효성 검사, 기본값 'ko'
  const lang: SupportedLanguage =
    i18n && ["ko", "en", "ja", "zh", "vi"].includes(i18n)
      ? (i18n as SupportedLanguage)
      : "ko";

  if (!userQuery) {
    return jsonResponse({ error: "'message' is required." }, 400, request);
  }

  // 1. 질문 연관성 검사
  const isRelevant = await isQuerySajuRelated(env.AI, userQuery);
  if (!isRelevant) {
    const responseConversationId = conversationId || null;
    return jsonResponse(
      {
        conversationId: responseConversationId,
        answer: getRejectionMessage(lang),
      },
      200,
      request
    );
  }

  const user = await getUserFromToken(request);
  if (!user) {
    return jsonResponse({ error: "Unauthorized: Invalid token" }, 401, request);
  }

  const newConversationId = conversationId || crypto.randomUUID();

  try {
    // 2. 대화 기록 가져오기 (기존 대화인 경우)
    const history = conversationId
      ? await getConversationHistory(prisma, conversationId)
      : [];

    // 3. RAG 및 조건부 웹 검색
    const queryVector = await createEmbedding(env.AI, userQuery);

    const similarDocIds = await findSimilarVectors(
      env.VECTORIZE_INDEX,
      queryVector,
      15 // 내부 검색 결과 수를 늘려 정확도 향상 시도
    );
    const ragDocs = await getDocumentsFromD1(
      env.DB,
      similarDocIds.map((id) => id.toString())
    );

    let webSearchResults = "";
    // 내부 지식으로 답변이 부족하다고 판단되면(3개 미만) 웹 검색 수행
    if (ragDocs.length < 3) {
      console.log(
        `Found only ${ragDocs.length} documents from RAG. Performing web search as a fallback.`
      );
      webSearchResults = await performWebSearch(userQuery, env.BRAVE_API_KEY);
    }

    const ragContext =
      ragDocs.length > 0
        ? `[오래된 지혜가 담긴 문헌에서 발췌한 내용]:\n${ragDocs
            .map((doc) => {
              let context = `내용: ${doc.text}`;
              if (doc.metadata) {
                const metadataString = JSON.stringify(doc.metadata);
                context = `출처 정보: ${metadataString}\n${context}`;
              }
              return context;
            })
            .join("\n\n---\n\n")}`
        : "";

    const webContext =
      webSearchResults.length > 0
        ? `[세상의 최신 흐름에 대한 정보]:\n${webSearchResults}`
        : "";

    const fullContext = [ragContext, webContext].filter(Boolean).join("\n\n");

    // 4. 페르소나 및 최종 프롬프트 구성
    let finalSystemPrompt = getPersonaPrompt(lang);

    // 컨텍스트 정보가 있을 경우, 명령어와 함께 추가합니다.
    if (fullContext) {
      const contextInstruction = `참고 정보:
사용자의 질문에 답변하기 위해 다음 참고 정보를 사용하세요. 이 정보는 고대의 지혜와 세상의 최신 흐름에 대한 통찰을 포함하고 있습니다. 이들을 종합하여 지혜로운 답변을 제공하세요. 만약 정보가 질문과 관련이 없다면, 답변을 제공할 수 없다고 솔직하게 말해야 합니다.
---
${fullContext}`;
      finalSystemPrompt += `\n\n---\n\n${contextInstruction}`;
    }

    const messages: ChatMessage[] = [];
    messages.push({ role: "system", content: finalSystemPrompt });

    // 시스템 메시지 다음에 대화 기록과 현재 사용자 질문을 추가합니다.
    messages.push(...history, { role: "user", content: userQuery });

    // 5. LLM 호출 및 사용량 기록
    const model = "@cf/google/gemma-3-12b-it";
    const llmResponse: any = await env.AI.run(model, {
      messages,
      max_tokens: 2048, // 답변 끊김 방지를 위해 max_tokens 증가
    });

    const assistantResponse =
      llmResponse.response || "죄송합니다. 답변을 생성할 수 없습니다.";

    // 토큰 사용량이 응답에 포함된 경우 로그를 기록합니다.
    if (
      llmResponse.usage &&
      typeof llmResponse.usage.prompt_tokens === "number" &&
      typeof llmResponse.usage.completion_tokens === "number" &&
      typeof llmResponse.usage.total_tokens === "number"
    ) {
      await logAiUsage(env.DB, user.id, model, llmResponse.usage);
    }

    // 6. 새로운 대화 내용 D1에 저장
    await saveConversationTurn(
      prisma,
      newConversationId,
      user.id,
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
 * 특정 대화의 전체 메시지 기록을 조회합니다.
 */
export async function SajuChatFull(
  request: Request,
  env: RagEnv,
  params?: Record<string, string>
): Promise<Response> {
  const prisma = createPrismaClient(env.DB);
  const url = new URL(request.url);
  const pathSegments = url.pathname.split("/").filter(Boolean);
  const conversationId = pathSegments[3];

  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return jsonResponse({ error: "Unauthorized" }, 401, request);
    }

    const firstMessage = await prisma.conversationHistory.findFirst({
      where: { conversationId, userId: user.id },
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
  const prisma = createPrismaClient(env.DB);

  const url = new URL(request.url);
  const pathSegments = url.pathname.split("/").filter(Boolean);
  const conversationId = pathSegments[3];

  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return jsonResponse({ error: "Unauthorized" }, 401, request);
    }

    // 대화 소유권 확인
    const conversation = await prisma.conversationHistory.findFirst({
      where: { conversationId, userId: user.id },
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
      where: { conversationId, userId: user.id },
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
