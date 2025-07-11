import { Ai, D1Database, VectorizeIndex } from "@cloudflare/workers-types";
import { paginate } from "../../common/paginationUtils";
import {
  createEmbedding,
  createEmbeddings
} from "../../common/ragUtils";
import { corsHeaders, jsonResponse } from "../../common/utils";

export interface Env {
  AI: Ai;
  DB: D1Database;
  VECTORIZE_INDEX: VectorizeIndex;
}

/**
 * RAG 문서에 대한 사주 프로젝트용 표준 메타데이터 스키마.
 * 일관된 메타데이터는 AI 답변의 품질과 데이터 필터링 기능에 큰 영향을 미칩니다.
 */
export interface DocumentMetadata {
  /** 지식의 출처 (예: "자평진전", "궁통보감") */
  source: string;
  /** 사주 명리학의 대분류 */
  category: string;
  /** 저자 (선택 사항) */
  author?: string;
  /** 관련 개념 (선택 사항, 필터링에 유용) */
  relatedConcepts?: string[];
  /** 웹 출처인 경우의 URL (선택 사항) */
  url?: string;
}

/**
 * API 요청 본문에 대한 타입 정의
 */
interface Document {
  text: string;
  metadata: DocumentMetadata;
}

interface DocumentRequest {
  documents: Document[];
}

interface QueryRequest {
  query: string;
}

// =================================================================
// 1. 문서 추가 및 인덱싱 (Add & Index Document)
// =================================================================

/**
 * 여러 텍스트를 D1에 한 번에 저장합니다.
 * 중복된 텍스트는 건너뜁니다.
 * @param db D1 Database 인스턴스
 * @param documents 저장할 문서 배열 ({text, metadata})
 * @returns 저장에 성공한 문서의 ID와 텍스트 배열
 */
async function saveDocumentsToD1(
  db: D1Database,
  documents: { text: string; metadata?: any }[]
): Promise<{ id: number; text: string }[]> {
  const statements = documents.map(({ text, metadata }) =>
    db
      .prepare(
        "INSERT INTO documents (text, metadata) VALUES (?, ?) ON CONFLICT(text) DO NOTHING RETURNING id, text"
      )
      .bind(text, metadata ? JSON.stringify(metadata) : null)
  );

  try {
    const results = await db.batch<{ id: number; text: string }>(statements);
    const successfullyInserted = results.flatMap((result) => result.results || []);
    return successfullyInserted;
  } catch (e) {
    console.error("D1 batch insert failed:", e);
    // 트랜잭션 실패 시 개별적으로 처리 (선택적 폴백)
    const inserted = [];
    for (const doc of documents) {
      try {
        const { results } = await db
          .prepare(
            "INSERT INTO documents (text, metadata) VALUES (?, ?) ON CONFLICT(text) DO NOTHING RETURNING id, text"
          )
          .bind(doc.text, doc.metadata ? JSON.stringify(doc.metadata) : null)
          .run<{ id: number; text: string }>();
        if (results && results.length > 0) {
          inserted.push(results[0]);
        }
      } catch (innerError) {
        console.error(`Failed to insert document with text: ${doc.text}`, innerError);
      }
    }
    return inserted;
  }
}

/**
 * 여러 벡터를 Vectorize 인덱스에 저장합니다.
 * @param index Vectorize 인덱스 인스턴스
 * @param vectors 저장할 벡터 배열 ({id, values})
 */
async function insertVectors(
  index: VectorizeIndex,
  vectors: { id: number; values: number[] }[]
): Promise<void> {
  if (vectors.length === 0) {
    return;
  }
  const toInsert = vectors.map((v) => ({ id: v.id.toString(), values: v.values }));
  await index.upsert(toInsert);
}

/**
 * 새 문서를 추가하고 인덱싱하는 요청을 처리합니다.
 */
async function handleAddDocuments(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const { documents } = (await request.json()) as DocumentRequest;
    if (
      !Array.isArray(documents) ||
      documents.length === 0 ||
      documents.some((d) => !d.text || !d.metadata)
    ) {
      return jsonResponse(
        "Invalid request: 'documents' must be a non-empty array of objects with 'text' and 'metadata' properties.",
        400,
        request
      );
    }

    // Metadata 유효성 검사
    for (const doc of documents) {
      if (!doc.metadata.source || !doc.metadata.category) {
        return jsonResponse({ error: "Invalid metadata: 'source' and 'category' are required fields." }, 400, request);
      }
    }

    const newlyInsertedDocs = await saveDocumentsToD1(env.DB, documents);

    if (newlyInsertedDocs.length === 0) {
      return jsonResponse({ message: "All documents already exist or failed to save." }, 409, request);
    }

    const textsToEmbed = newlyInsertedDocs.map(doc => doc.text);
    const embeddings = await createEmbeddings(env.AI, textsToEmbed);
    
    const vectorsToInsert = newlyInsertedDocs.map((doc, i) => ({
      id: doc.id,
      values: embeddings[i],
    }));
    
    await insertVectors(env.VECTORIZE_INDEX, vectorsToInsert);

    return jsonResponse({
        message: `Processed ${documents.length} documents. Added and indexed ${newlyInsertedDocs.length} new documents.`,
        addedCount: newlyInsertedDocs.length,
        addedIds: newlyInsertedDocs.map(d => d.id)
      }, 201, request);
  } catch (error) {
    console.error("Error adding documents:", error);
    return jsonResponse({ error: "Failed to add documents." }, 500, request);
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
    return jsonResponse({ error: "Failed to list documents." }, 500, request);
  }
}

// =================================================================
// 3. 문서 삭제
// =================================================================

/**
 * 여러 문서를 ID 목록을 이용해 한 번에 삭제하는 요청을 처리합니다.
 */
async function handleDeleteDocuments(request: Request, env: Env): Promise<Response> {
    try {
        const { ids } = await request.json() as { ids: number[] };

        if (!Array.isArray(ids) || ids.length === 0) {
            return jsonResponse({ error: "요청 본문에 'ids' 배열(숫자)을 포함해야 합니다." }, 400, request);
        }
        
        const validIds = ids.filter(id => typeof id === 'number' && Number.isInteger(id));
        if (validIds.length !== ids.length) {
            return jsonResponse({ error: "'ids' 배열은 정수로만 구성되어야 합니다." }, 400, request);
        }

        // D1에서 삭제
        const placeholders = validIds.map(() => '?').join(',');
        const query = `DELETE FROM documents WHERE id IN (${placeholders})`;
        const { meta } = await env.DB.prepare(query).bind(...validIds).run();
        const deletedCount = meta.changes || 0;

        // Vectorize에서 삭제
        const stringIds = validIds.map(id => id.toString());
        if (stringIds.length > 0) {
            await env.VECTORIZE_INDEX.deleteByIds(stringIds);
        }

        return jsonResponse({ 
          message: `총 ${deletedCount}개의 문서가 성공적으로 삭제되었습니다.`,
          deletedCount
        }, 200, request);

    } catch (error) {
        console.error("Error deleting documents:", error);
        if (error instanceof SyntaxError) {
          return jsonResponse({ error: "잘못된 JSON 형식입니다." }, 400, request);
        }
        return jsonResponse({ error: "문서 삭제 중 오류가 발생했습니다." }, 500, request);
    }
}

// =================================================================
// 4. 문서 수정
// =================================================================

async function handleUpdateDocument(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  const docId = parseInt(id, 10);
  if (isNaN(docId)) {
    return jsonResponse({ error: "Invalid document ID." }, 400, request);
  }

  try {
    const { text, metadata } = (await request.json()) as Document;

    // 필수 필드 유효성 검사
    if (!text || !metadata || !metadata.source || !metadata.category) {
      return jsonResponse({ error: "Invalid request body: 'text' and 'metadata' (with 'source' and 'category') are required fields." }, 400, request);
    }

    // 기존 문서를 가져와서 텍스트 변경 여부 확인
    const oldDoc = await env.DB.prepare("SELECT text FROM documents WHERE id = ?")
      .bind(docId)
      .first<{ text: string }>();

    if (!oldDoc) {
      return jsonResponse({ error: `Document with ID ${docId} not found.` }, 404, request);
    }
    
    // D1에 문서 업데이트
    await env.DB.prepare("UPDATE documents SET text = ?, metadata = ? WHERE id = ?")
      .bind(text, JSON.stringify(metadata), docId)
      .run();

    // 텍스트가 변경된 경우에만 임베딩을 다시 생성하고 벡터를 업데이트
    if (oldDoc.text !== text) {
      const embedding = await createEmbedding(env.AI, text);
      await env.VECTORIZE_INDEX.upsert([
        { id: docId.toString(), values: embedding },
      ]);
    }

    return jsonResponse({ message: `Document ${docId} updated successfully.`, id: docId }, 200, request);
  } catch (error) {
    console.error(`Error updating document ${docId}:`, error);
    if (error instanceof SyntaxError) {
      return jsonResponse({ error: "잘못된 JSON 형식입니다." }, 400, request);
    }
    return jsonResponse({ error: "문서 수정 중 오류가 발생했습니다." }, 500, request);
  }
}

// =================================================================
// 5. 메타데이터 스키마 조회
// =================================================================

async function handleGetMetadataSchema(request: Request): Promise<Response> {
  const schema = {
    keys: ["source", "category", "author", "relatedConcepts", "url"],
    required: ["source", "category"],
    options: {
      category: ["십신론", "격국론", "용신론", "물상론", "기타"],
    },
    fields: {
      source: {
        type: "string",
        description:
          "지식의 출처 (예: '자평진전', '궁통보감'). 데이터의 신뢰도를 판단하는 핵심 정보입니다.",
      },
      category: {
        type: "string",
        description:
          "사주 명리학의 대분류. 이 지식이 어떤 주제에 속하는지 명시합니다.",
      },
      author: {
        type: "string",
        description: "출처의 저자 (선택 사항).",
        optional: true,
      },
      relatedConcepts: {
        type: "array",
        itemType: "string",
        description:
          "관련 핵심 개념어 배열 (선택 사항). 향후 특정 개념과 연관된 문서를 필터링하는 데 사용됩니다. (예: ['갑목', '편재'])",
        optional: true,
      },
      url: {
        type: "string",
        description: "출처가 웹사이트인 경우의 주소 (선택 사항).",
        optional: true,
      },
    },
  };
  return jsonResponse(schema, 200, request);
}

// =================================================================
// 라우터 (Router)
// =================================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split("/").filter(Boolean);

    // /api/rag/metadata-schema
    if (pathSegments[2] === "metadata-schema" && request.method === "GET") {
      return handleGetMetadataSchema(request);
    }

    // /api/rag/documents/:id
    if (pathSegments[2] === "documents" && pathSegments.length === 4) {
      if (request.method === "PUT") {
        return handleUpdateDocument(request, env, pathSegments[3]);
      }
    }
    
    // /api/rag/documents
    if (pathSegments[2] === "documents" && pathSegments.length === 3) {
      if (request.method === "POST") {
        return handleAddDocuments(request, env);
      }
      if (request.method === "GET" && pathSegments.length === 3) {
        return handleListDocuments(request, env);
      }
      if (request.method === "DELETE" && pathSegments.length === 3) {
        return handleDeleteDocuments(request, env);
      }
    }

    return jsonResponse({ error: "Not Found" }, 404, request);
  },
} satisfies ExportedHandler<Env>; 