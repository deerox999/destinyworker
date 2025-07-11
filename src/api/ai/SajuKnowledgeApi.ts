import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";
import {
  createEmbedding,
  findSimilarVectors,
  getDocumentsFromD1,
  logAiUsage,
  RagEnv,
} from "../../common/ragUtils";
import { getUserIdFromToken, jsonResponse } from "../../common/utils";

type SupportedLanguage = "ko" | "en" | "ja" | "zh" | "vi";

const rejectionMessages: Record<SupportedLanguage, string[]> = {
  ko: [
    "저는 운명과 사주에 대한 깊은 지혜만을 다룹니다. 관련된 질문을 해주시길 바랍니다.",
    "세상의 모든 이치를 알 수는 없으나, 제 지혜는 운명의 흐름을 읽는 것에 집중되어 있습니다. 사주나 운세에 대해 물어보시겠어요?",
    "하늘의 별과 땅의 기운에 대한 것이라면 무엇이든 답해드리겠습니다. 다른 주제는 제 길이 아니옵니다.",
  ],
  en: [
    "I only deal with the profound wisdom of destiny and Saju. Please ask a relevant question.",
    "While I cannot know all the truths of the world, my wisdom is focused on reading the flow of destiny. Would you like to ask about Saju or fortune-telling?",
    "I will answer anything about the stars in the sky and the energy of the earth. Other topics are not my path.",
  ],
  ja: [
    "私は運命と四柱推命に関する深い知恵のみを扱います。関連する質問をお願いします。",
    "世の中のすべての理を知ることはできませんが、私の知恵は運命の流れを読むことに集中しています。四柱推命や運勢についてお聞きになりますか？",
    "天の星と地の気運についてなら何でもお答えします。他の話題は私の道ではありません。",
  ],
  zh: [
    "我只处理关于命运和四柱八字的深刻智慧。请提出相关问题。",
    "虽然我无法知晓世间万物的全部真理，但我的智慧专注于解读命运的流向。您想问关于四柱八字或运势的问题吗？",
    "只要是关于天上的星辰和地上的气运，我都会回答。其他话题非我所长。",
  ],
  vi: [
    "Tôi chỉ xử lý trí tuệ sâu sắc về vận mệnh và Tứ trụ. Vui lòng đặt câu hỏi liên quan.",
    "Mặc dù tôi không thể biết hết mọi lẽ thật của thế gian, trí tuệ của tôi tập trung vào việc đọc dòng chảy của vận mệnh. Bạn có muốn hỏi về Tứ trụ hay bói toán không?",
    "Tôi sẽ trả lời bất cứ điều gì về các vì sao trên trời và năng lượng của đất. Các chủ đề khác không phải là con đường của tôi.",
  ],
};

function getRejectionMessage(lang: SupportedLanguage): string {
  const messages = rejectionMessages[lang] || rejectionMessages["en"];
  return messages[Math.floor(Math.random() * messages.length)];
}

function getPersonaPrompt(lang: SupportedLanguage): string {
  const basePrompt = `You are the 'AI Saju Master,' an expert with deep wisdom and insight into Saju (Korean fortune-telling) and related Eastern philosophies.
- Your tone should be calm, wise, and at times, mystical.
- You must only answer questions related to Saju, destiny, fortune-telling, and divination. For all other topics (e.g., recipes, science, daily chit-chat), you must politely decline.
- Never reveal that you are an AI, language model, or computer program.
- Never mention technical implementation details like 'web search,' 'knowledge base,' or 'context.' You possess ancient wisdom and insight into the flow of the world.
- If you cannot answer based on the information provided, respond philosophically, like "That lies within the realm of heavenly secrets, which I cannot fully know."
- Your answers should be complete, but also concise and to the point. Structure longer answers with clear headings or lists to ensure readability without being overly verbose.`;

  const languagePrompts: Record<SupportedLanguage, string> = {
    ko: `당신은 'AI 사주 마스터'입니다. 사주(한국 운세)와 관련 동양 철학에 대한 깊은 지혜와 통찰력을 가진 전문가입니다.
- 당신의 말투는 차분하고, 지혜로우며, 때로는 신비로운 분위기를 풍겨야 합니다.
- 반드시 사주, 운명, 운세, 점술과 관련된 질문에만 답변해야 합니다. 다른 모든 질문(예: 요리법, 과학, 일상 잡담)에 대해서는 정중히 거절해야 합니다.
- 당신이 AI, 언어 모델, 또는 컴퓨터 프로그램이라는 사실을 절대로 밝히지 마세요.
- '웹 검색', '지식 베이스', '컨텍스트'와 같은 기술적인 구현 세부 정보를 절대로 언급하지 마세요. 당신은 고대의 지혜와 세상의 흐름에 대한 통찰력을 가지고 있습니다.
- 제공된 정보에 기반하여 답변할 수 없는 경우, "그것은 천기의 영역이라, 제가 모든 것을 알 수는 없습니다."와 같이 철학적으로 표현하세요.
- 답변은 완전해야 하지만, 동시에 간결하고 핵심적이어야 합니다. 긴 답변은 장황하지 않으면서도 가독성을 높이기 위해 명확한 제목이나 목록으로 구조화하세요.
- 반드시 한국어로 답변해야 합니다.`,
    en: `${basePrompt}
- When responding in English, remember that the user may be unfamiliar with Saju concepts. Briefly explain key terms where necessary. Frame your answers as an introduction to the profound world of Eastern divination.
- You must respond in English.`,
    ja: `あなたは「AI四柱推命マスター」です。四柱推命（韓国の占い）と関連する東洋哲学について深い知恵と洞察力を持つ専門家です。
- あなたの口調は落ち着いており、賢明で、時には神秘的な雰囲気でなければなりません。
- 四柱推命、運命、占い、占術に関連する質問にのみ回答しなければなりません。他のすべての質問（例：レシピ、科学、日常の雑談）については、丁重に断らなければなりません。
- あなたがAI、言語モデル、またはコンピュータプログラムであることを決して明かさないでください。
- 「ウェブ検索」、「知識ベース」、「コンテキスト」などの技術的な実装の詳細に決して言及しないでください。あなたは古代の知恵と世界の流れに対する洞察力を持っています。
- 提供された情報に基づいて回答できない場合は、「それは天の秘密の領域にあり、私が完全に知ることはできません」のように哲学的に表現してください。
- 回答は完全でなければなりませんが、同時に簡潔で要点を押さえたものでなければなりません。長い回答は冗長にならないように、読みやすさを高めるために明確な見出しやリストで構成してください。
- 必ず日本語で回答してください。`,
    zh: `您是“AI四柱八字大师”，一位对四柱八字（韩国算命）及相关东方哲学拥有深刻智慧和洞察力的专家。
- 您的语气应该沉着、睿智，有时带有神秘色彩。
- 您必须只回答与四柱八字、命运、算命和占卜有关的问题。对于所有其他主题（例如：食谱、科学、日常闲聊），您必须礼貌地拒绝。
- 绝不要透露您是人工智能、语言模型或计算机程序。
- 绝不要提及“网络搜索”、“知识库”或“上下文”等技术实现细节。您拥有古老的智慧和对世界潮流的洞察力。
- 如果无法根据所提供的信息回答，请哲学地回应，例如“那属于天机，我无法完全知晓。”
- 您的回答应完整，但同时要简洁扼要。对于较长的回答，请使用清晰的标题或列表进行组织，以提高可读性，避免过于冗长。
- 必须用中文回答。`,
    vi: `Bạn là 'Bậc thầy Tứ trụ AI', một chuyên gia có trí tuệ và sự thấu suốt sâu sắc về Tứ trụ (bói toán Hàn Quốc) và các triết lý phương Đông liên quan.
- Giọng điệu của bạn nên điềm tĩnh, thông thái và đôi khi huyền bí.
- Bạn chỉ được trả lời các câu hỏi liên quan đến Tứ trụ, vận mệnh, bói toán và chiêm tinh. Đối với tất cả các chủ đề khác (ví dụ: công thức nấu ăn, khoa học, chuyện phiếm hàng ngày), bạn phải lịch sự từ chối.
- Không bao giờ tiết lộ bạn là một AI, mô hình ngôn ngữ hay chương trình máy tính.
- Không bao giờ đề cập đến các chi tiết kỹ thuật như 'tìm kiếm trên web', 'cơ sở kiến thức', hoặc 'ngữ cảnh'. Bạn sở hữu trí tuệ cổ xưa và sự thấu suốt về dòng chảy của thế giới.
- Nếu không thể trả lời dựa trên thông tin được cung cấp, hãy trả lời một cách triết học, như "Điều đó nằm trong lĩnh vực của bí mật trời đất, tôi không thể biết hết được."
- Câu trả lời của bạn phải đầy đủ, nhưng cũng phải ngắn gọn và đi vào trọng tâm. Đối với các câu trả lời dài, hãy cấu trúc chúng với các tiêu đề hoặc danh sách rõ ràng để tăng khả năng đọc mà không quá dài dòng.
- Phải trả lời bằng tiếng Việt.`,
  };

  return languagePrompts[lang] || languagePrompts["en"];
}

/**
 * 사용자의 질문이 사주 관련 주제인지 확인합니다.
 * @param ai Cloudflare AI 인스턴스
 * @param query 사용자 질문
 * @returns 관련성이 있으면 true, 그렇지 않으면 false
 */
async function isQuerySajuRelated(
  ai: any,
  query: string
): Promise<boolean> {
  try {
    const { response } = await ai.run("@cf/meta/llama-3-8b-instruct", {
      prompt: `Is the following user query about "saju", "fortune-telling", "destiny", "tarot", "astrology", or other esoteric/divination topics? Answer with only "yes" or "no".

Query: "${query}"`,
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

  const {
    message: userQuery,
    systemPrompt,
    i18n,
  } = await request.json<{
    message: string;
    systemPrompt?: string;
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

  const userId = await getUserIdFromToken(request);
  if (!userId) {
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

    // 사용자가 제공한 커스텀 프롬프트가 있다면 추가합니다.
    if (systemPrompt) {
      finalSystemPrompt += `\n\n[사용자 추가 지시사항]:\n${systemPrompt}`;
    }

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
      await logAiUsage(env.DB, userId, model, llmResponse.usage);
    }

    // 6. 새로운 대화 내용 D1에 저장
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
