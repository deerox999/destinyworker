import { Ai, D1Database, VectorizeIndex } from "@cloudflare/workers-types";
import {
  createEmbedding,
  findSimilarVectors,
  getDocumentsFromD1,
} from "../../common/ragUtils";
import { corsHeaders } from "../../common/utils";
import { paginate } from "../../common/paginationUtils";

export interface Env {
  AI: Ai;
  DB: D1Database;
  VECTORIZE_INDEX: VectorizeIndex;
}

/**
 * API 요청 본문에 대한 타입 정의
 */
interface DocumentRequest {
  text: string;
}

interface QueryRequest {
  query: string;
}

// =================================================================
// 1. 문서 추가 및 인덱싱 (Add & Index Document)
// =================================================================

/**
 * 텍스트를 D1에 저장하고 ID를 반환합니다.
 * @param db D1 Database 인스턴스
 * @param text 저장할 텍스트
 * @returns 저장된 행의 ID
 */
async function saveTextToD1(db: D1Database, text: string): Promise<number | null> {
  const existing = await db
    .prepare("SELECT id FROM documents WHERE text = ?")
    .bind(text)
    .first<{ id: number }>();

  if (existing) {
    return null; // 중복 시 null 반환
  }

  const { results } = await db
    .prepare("INSERT INTO documents (text) VALUES (?) RETURNING id")
    .bind(text)
    .run<{ id: number }>();

  const recordId = results?.[0]?.id;
  if (!recordId) {
    throw new Error("Failed to save document to D1.");
  }
  return recordId;
}

/**
 * 벡터를 Vectorize 인덱스에 저장합니다.
 * @param index Vectorize 인덱스 인스턴스
 * @param id 문서 ID
 * @param vector 임베딩 벡터
 */
async function insertVector(
  index: VectorizeIndex,
  id: number,
  vector: number[]
): Promise<void> {
  await index.upsert([{ id: id.toString(), values: vector }]);
}

/**
 * 새 문서를 추가하고 인덱싱하는 요청을 처리합니다.
 */
async function handleAddDocument(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const { text } = (await request.json()) as DocumentRequest;
    if (!text || typeof text !== "string") {
      return new Response("Invalid request: 'text' must be a non-empty string.", {
        status: 400,
        headers: corsHeaders()
      });
    }

    const docId = await saveTextToD1(env.DB, text);
    if (docId === null) {
      return new Response(
        JSON.stringify({ message: "Document with this text already exists." }),
        { status: 409, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
      );
    }

    const vector = await createEmbedding(env.AI, text);
    await insertVector(env.VECTORIZE_INDEX, docId, vector);

    return new Response(
      JSON.stringify({
        id: docId,
        message: "Document added and indexed successfully.",
      }),
      { status: 201, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error adding document:", error);
    return new Response("Failed to add document.", { status: 500, headers: corsHeaders() });
  }
}

// =================================================================
// 2. 문서 조회
// =================================================================

/**
 * 문서 목록을 조회하는 요청을 처리합니다.
 */
async function handleListDocuments(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    return await paginate(request, env.DB, {
      tableName: "documents",
      searchField: "text",
    });
  } catch (error) {
    console.error("Error listing documents:", error);
    return new Response("Failed to list documents.", {
      status: 500,
      headers: corsHeaders(),
    });
  }
}

// =================================================================
// 3. 문서 삭제
// =================================================================

/**
 * 문서를 삭제하는 요청을 처리합니다.
 */
async function handleDeleteDocument(request: Request, env: Env, id: string): Promise<Response> {
    const docId = parseInt(id, 10);
    if (isNaN(docId)) {
        return new Response("Invalid document ID.", { status: 400, headers: corsHeaders() });
    }

    try {
        // D1에서 삭제
        const { success } = await env.DB.prepare("DELETE FROM documents WHERE id = ?").bind(docId).run();
        if (!success) {
            return new Response("Document not found in D1.", { status: 404, headers: corsHeaders() });
        }
        
        // Vectorize에서 삭제
        await env.VECTORIZE_INDEX.deleteByIds([id]);

        return new Response(JSON.stringify({ message: "Document deleted successfully." }), {
            headers: { ...corsHeaders(), "Content-Type": "application/json" },
        });

    } catch (error) {
        console.error("Error deleting document:", error);
        return new Response("Failed to delete document.", { status: 500, headers: corsHeaders() });
    }
}

// =================================================================
// 4. 질의 및 답변 생성 (Query & Generate)
// =================================================================

/**
 * RAG 파이프라인을 통해 최종 답변을 생성합니다.
 */
async function handleQuery(request: Request, env: Env): Promise<Response> {
  try {
    const { query } = (await request.json()) as QueryRequest;
    if (!query) {
      return new Response("Invalid request: 'query' is required.", {
        status: 400,
        headers: corsHeaders()
      });
    }

    // 1. 질문을 임베딩하여 쿼리 벡터 생성
    const queryVector = await createEmbedding(env.AI, query);

    // 2. Vectorize에서 유사한 벡터(문서 ID) 검색
    const similarDocIds = await findSimilarVectors(
      env.VECTORIZE_INDEX,
      queryVector
    );

    // 3. D1에서 유사한 문서의 원본 텍스트(Context) 가져오기
    const contextDocs = await getDocumentsFromD1(env.DB, similarDocIds);

    // 4. LLM에 Context와 질문을 함께 전달하여 답변 생성
    const contextMessage =
      contextDocs.length > 0
        ? `Context:\n${contextDocs.join("\n---\n")}`
        : "No context provided.";

    const systemPrompt =
      "You are a helpful assistant. Answer the user's question based on the provided context. If the context doesn't contain the answer, say that you don't know.";

    const { response } = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        { role: "system", content: contextMessage },
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
    });

    return new Response(
      JSON.stringify({ answer: response, context: contextDocs }),
      { headers: { ...corsHeaders(), "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error handling query:", error);
    return new Response("Failed to process query.", { status: 500, headers: corsHeaders() });
  }
}

// =================================================================
// 라우터 (Router)
// =================================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split("/").filter(Boolean);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    // /api/rag/documents
    if (pathSegments[2] === "documents") {
      if (request.method === "POST" && pathSegments.length === 3) {
        return handleAddDocument(request, env);
      }
      if (request.method === "GET" && pathSegments.length === 3) {
        return handleListDocuments(request, env);
      }
      if (request.method === "DELETE" && pathSegments.length === 4) {
        const id = pathSegments[3];
        return handleDeleteDocument(request, env, id);
      }
    }

    // /api/rag/query
    if (pathSegments[2] === "query" && request.method === "POST") {
      return handleQuery(request, env);
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders() });
  },
} satisfies ExportedHandler<Env>; 