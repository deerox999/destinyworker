import { GoogleGenAI } from '@google/genai';
import { createPrismaClient } from "../../../common/prismaUtils";
import { Context } from "hono";
import {
  createEmbedding,
  findSimilarVectors,
  getDocumentsFromD1
} from "../../../common/ragUtils";
import { getUserFromToken } from "../../../common/utils";
import {
  getPersonaPrompt,
  getRejectionMessage,
  SupportedLanguage,
} from "./prompt/sajuTeacher";

// Gemini API와 통신하기 위한 환경 변수 확장
export interface Env {
  AI: Ai; // Cloudflare AI (임베딩용)
  VECTORIZE_INDEX: VectorizeIndex;
  DB: D1Database;
  GOOGLE_GEMINI_API_KEY: string; // Gemini API 키
  BRAVE_API_KEY?: string;
}

/**
 * 사용자의 질문이 사주 관련 주제인지 확인합니다.
 * @param ai Cloudflare AI 인스턴스
 * @param query 사용자 질문
 * @returns 관련성이 있으면 true, 그렇지 않으면 false
 */
async function isQuerySajuRelated(ai: any, query: string): Promise<boolean> {
  try {
    const { response } = await ai.run("@hf/google/gemma-7b-it", {
      prompt: `Is the following user query about "saju", "fortune-telling", "destiny", "tarot", "astrology", or other esoteric/divination topics? Answer with only "yes" or "no". Query: "${query}"`,
      max_tokens: 5,
    });

    // 응답을 소문자로 변환하고 앞뒤 공백을 제거한 후 "yes"가 포함되어 있는지 확인합니다.
    const isRelated = response.toLowerCase().trim().includes("yes");
    if (process.env.ENVIRONMENT === "development") {
      console.log(`Relevance check for '${query}': AI response is '${response.trim()}', Determined: ${isRelated}`);
    }
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
  conversationId: string,
  db: D1Database
): Promise<ChatMessage[]> {
  const prisma = createPrismaClient(db);
  
  try {
    const history = await prisma.conversationHistory.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      select: {
        role: true,
        content: true,
      },
    });
    
    // role 값이 "assistant"인지 확인하고 ChatMessage 형식으로 변환
    return history.map(msg => ({
      role: msg.role as "user" | "assistant" | "system",
      content: msg.content
    }));
  } finally {
    // Cloudflare Workers에서는 $disconnect가 필요하지 않음
  }
}

/**
 * 사용자의 질문과 AI의 답변을 대화 기록에 저장합니다.
 */
async function saveConversationTurn(
  conversationId: string,
  userId: number,
  userMessage: string,
  assistantMessage: string,
  db: D1Database
) {
  const prisma = createPrismaClient(db);
  
  try {
    await prisma.conversationHistory.createMany({
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
  } finally {
    // Cloudflare Workers에서는 $disconnect가 필요하지 않음
  }
}

/**
 * 사용자의 전체 대화 목록을 조회합니다.
 */
export async function SajuChatList(
  c: Context
): Promise<Response> {
  const prisma = createPrismaClient(c.env.DB);

  try {
    const user = await getUserFromToken(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const results: {
      conversationId: string;
      firstMessage: string;
      lastActivity: string;
    }[] = await prisma.$queryRawUnsafe(
      `
        WITH FirstMessages AS (
            SELECT
                conversationId,
                content,
                ROW_NUMBER() OVER(PARTITION BY conversationId ORDER BY createdAt ASC) as rn
            FROM conversation_histories
            WHERE userId = ? AND role = 'user'
        ),
        LastActivity AS (
            SELECT
                conversationId,
                MAX(createdAt) as lastActivity
            FROM conversation_histories
            WHERE userId = ?
            GROUP BY conversationId
        )
        SELECT
            fm.conversationId,
            fm.content as firstMessage,
            la.lastActivity
        FROM FirstMessages fm
        JOIN LastActivity la ON fm.conversationId = la.conversationId
        WHERE fm.rn = 1
        ORDER BY la.lastActivity DESC;
        `,
      user.id,
      user.id
    );

    const conversations = results.map((r) => ({
      id: r.conversationId,
      title: r.firstMessage.substring(0, 80),
      updatedAt: r.lastActivity,
    }));

    return c.json(
      {
        success: true,
        conversations,
      },
      200
    );
  } catch (error) {
    console.error("Error fetching conversation list:", error);
    return c.json(
      { error: "Failed to fetch conversation list." },
      500
    );
  }
}

/**
 * 대화형 사주 챗봇의 핵심 핸들러
 */
export async function SajuChat(
  c: Context
): Promise<Response> {
  const conversationId = c.req.param("id");

  const {
    message: userQuery,
    i18n,
  } = await c.req.json<{
    message: string;
    i18n?: string;
  }>();

  // 언어 유효성 검사, 기본값 'ko'
  const lang: SupportedLanguage =
    i18n && ["ko", "en", "ja", "zh", "vi"].includes(i18n)
      ? (i18n as SupportedLanguage)
      : "ko";

  if (!userQuery) {
    return c.json({ error: "'message' is required." }, 400);
  }

  // 1. 질문 연관성 검사 (Cloudflare AI 사용)
  const isRelevant = await isQuerySajuRelated(c.env.AI, userQuery);
  if (!isRelevant) {
    const responseConversationId = conversationId || crypto.randomUUID();
    
    // 사주와 관련 없는 질문이어도 대화 기록에 저장
    if (conversationId) {
      const user = await getUserFromToken(c);
      if (user) {
        await saveConversationTurn(
          conversationId,
          user.id,
          userQuery,
          getRejectionMessage(lang),
          c.env.DB
        );
      }
    }
    
    return c.json(
      {
        conversationId: responseConversationId,
        answer: getRejectionMessage(lang),
      },
      200,
      c.req.header()
    );
  }

  const user = await getUserFromToken(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  const newConversationId = conversationId || crypto.randomUUID();

  try {
    // 2. 대화 기록은 사용하지 않음 (단발성 질문에 최적화)
    const history: ChatMessage[] = [];

    // 3. RAG 및 조건부 웹 검색
    const queryVector = await createEmbedding(c.env.AI, userQuery);

    const similarDocIds = await findSimilarVectors(
      c.env.VECTORIZE_INDEX,
      queryVector,
      15 // 내부 검색 결과 수를 늘려 정확도 향상 시도
    );
    const ragDocs = await getDocumentsFromD1(
      c.env.DB,
      similarDocIds.map((id) => id.toString())
    );

    let webSearchResults = "";
    // 내부 지식으로 답변이 부족하다고 판단되면(3개 미만) 웹 검색 수행
    if (ragDocs.length < 3) {
      if (process.env.ENVIRONMENT === "development") {
        console.log(`Found only ${ragDocs.length} documents from RAG. Performing web search as a fallback.`);
      }
      webSearchResults = await performWebSearch(userQuery, c.env.BRAVE_API_KEY);
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
    
    // 매번 시스템 프롬프트를 포함하여 일관성 유지 (단발성 질문에 최적화)
    messages.push({ 
      role: "user", 
      content: `${finalSystemPrompt}\n\n사용자 질문: ${userQuery}` 
    });

    // 5. LLM 호출 및 사용량 기록 (Gemini 사용)
    const model = "gemini-2.5-flash";
    
    // Gemini API 초기화
    const geminiApi = new GoogleGenAI({
      apiKey: c.env.GOOGLE_GEMINI_API_KEY
    });
    
    // Gemini 형식으로 메시지 변환 (assistant를 model로 변환)
    const geminiContents = messages.map(msg => {
      let geminiRole: string = msg.role;
      if (msg.role === "assistant") {
        geminiRole = "model";
      }
      return {
        role: geminiRole,
        parts: [{ text: msg.content }]
      };
    });

    const llmResponse = await geminiApi.models.generateContent({
      model: model,
      contents: geminiContents,
      config: {
        maxOutputTokens: 1024, // 채팅 인터페이스에 맞게 간결한 답변 유도
        temperature: 0.3,
        topP: 0.8,
        topK: 20,
      }
    });

    const assistantResponse =
      llmResponse.text || "죄송합니다. 답변을 생성할 수 없습니다.";

    // Gemini SDK에서는 usage 정보를 직접 제공하지 않으므로 생략
    // await logAiUsage(c.env.DB, user.id, model, llmResponse.usage);

    // 6. 새로운 대화 내용 D1에 저장 (단발성 질문이므로 각각 독립적으로 저장)
    await saveConversationTurn(
      newConversationId,
      user.id,
      userQuery,
      assistantResponse,
      c.env.DB
    );

    return c.json(
      {
        conversationId: newConversationId,
        answer: assistantResponse,
      },
      200,
      c.req.header()
    );
  } catch (error) {
    console.error("Saju chat error:", error);
    return c.json(
      { error: "Failed to process saju chat." },
      500,
      c.req.header()
    );
  }
}

/**
 * 특정 대화의 전체 메시지 기록을 조회합니다.
 */
export async function SajuChatFull(
  c: Context
): Promise<Response> {
  const prisma = createPrismaClient(c.env.DB);
  const conversationId = c.req.param("id");

  try {
    const user = await getUserFromToken(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const firstMessage = await prisma.conversationHistory.findFirst({
      where: { conversationId, userId: user.id },
    });

    if (!firstMessage) {
      return c.json(
        { error: "Conversation not found or access denied" },
        404
      );
    }

    const messages = await getConversationHistory(conversationId, c.env.DB);

    return c.json(
      {
        success: true,
        conversationId,
        messages,
      },
      200
    );
  } catch (error) {
    console.error(`Error fetching conversation ${conversationId}:`, error);
    return c.json(
      { error: "Failed to fetch conversation." },
      500
    );
  }
}

/**
 * 여러 대화 및 관련 메시지를 일괄 삭제합니다.
 */
export async function SajuChatDelete(
  c: Context
): Promise<Response> {
  const prisma = createPrismaClient(c.env.DB);

  try {
    const user = await getUserFromToken(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { conversationIds } = await c.req.json<{
      conversationIds: string[];
    }>();

    if (!conversationIds || !Array.isArray(conversationIds) || conversationIds.length === 0) {
      return c.json(
        { error: "conversationIds array is required and must not be empty" },
        400
      );
    }

    // 사용자가 소유한 대화들만 필터링
    const userConversations = await prisma.conversationHistory.findMany({
      where: {
        conversationId: { in: conversationIds },
        userId: user.id,
      },
      select: { conversationId: true },
      distinct: ['conversationId'],
    });

    const validConversationIds = userConversations.map(c => c.conversationId);

    if (validConversationIds.length === 0) {
      return c.json(
        {
          success: true,
          deletedCount: 0,
          deletedConversationIds: [],
          message: "No conversations found or access denied for all provided IDs.",
        },
        200
      );
    }

    // 해당 대화들의 모든 메시지 삭제
    const { count } = await prisma.conversationHistory.deleteMany({
      where: {
        conversationId: { in: validConversationIds },
        userId: user.id,
      },
    });

    return c.json(
      {
        success: true,
        deletedCount: count,
        deletedConversationIds: validConversationIds,
        message: `${validConversationIds.length} conversations and their ${count} messages have been deleted.`,
      },
      200
    );
  } catch (error) {
    console.error("Error deleting conversations:", error);
    return c.json(
      { error: "Failed to delete conversations." },
      500
    );
  }
}
