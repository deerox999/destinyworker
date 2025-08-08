import { Context } from "hono";
import { createEmbedding, createEmbeddings } from "../../../common/ragUtils";
import { createPrismaClient } from "../../../common/prismaUtils";
import { parsePagination, buildPaginationMeta } from "../../../common/paginationUtils";

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
 * 여러 텍스트를 Prisma를 통해 한 번에 저장합니다.
 * 중복된 텍스트는 건너뜁니다.
 * @param prisma Prisma 클라이언트 인스턴스
 * @param documents 저장할 문서 배열 ({text, metadata})
 * @returns 저장에 성공한 문서의 ID와 텍스트 배열
 */
async function saveDocumentsWithPrisma(
  prisma: any,
  documents: { text: string; metadata?: any }[]
): Promise<{ id: number; text: string }[]> {
  const successfullyInserted: { id: number; text: string }[] = [];

  for (const doc of documents) {
    try {
      const result = await prisma.document.upsert({
        where: { text: doc.text },
        update: {}, // 기존 문서가 있으면 업데이트하지 않음
        create: {
          text: doc.text,
          metadata: doc.metadata ? JSON.stringify(doc.metadata) : null,
        },
      });
      successfullyInserted.push({ id: result.id, text: result.text });
    } catch (error) {
      console.error(`Failed to insert document with text: ${doc.text}`, error);
    }
  }

  return successfullyInserted;
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
  const toInsert = vectors.map((v) => ({
    id: v.id.toString(),
    values: v.values,
  }));
  await index.upsert(toInsert);
}

/**
 * 새 문서를 추가하고 인덱싱하는 요청을 처리합니다.
 */
export async function RagAddDocuments(
  c: Context
): Promise<Response> {
  try {
    const { documents } = (await c.req.json()) as DocumentRequest;
    if (
      !Array.isArray(documents) ||
      documents.length === 0 ||
      documents.some((d) => !d.text || !d.metadata)
    ) {
      return c.json(
        "Invalid request: 'documents' must be a non-empty array of objects with 'text' and 'metadata' properties.",
        400
      );
    }

    // Metadata 유효성 검사
    for (const doc of documents as any[]) {
      if (!doc.metadata.source || !doc.metadata.category) {
        return c.json(
          {
            error:
              "Invalid metadata: 'source' and 'category' are required fields.",
          },
          400
        );
      }
    }

    const prisma = createPrismaClient(c.env.DB);
    const newlyInsertedDocs = await saveDocumentsWithPrisma(prisma, documents);

    if (newlyInsertedDocs.length === 0) {
      return c.json(
        { message: "All documents already exist or failed to save." },
        409
      );
    }

    const textsToEmbed = newlyInsertedDocs.map((doc) => doc.text);
    const embeddings = await createEmbeddings(c.env.AI, textsToEmbed);

    const vectorsToInsert = newlyInsertedDocs.map((doc, i) => ({
      id: doc.id,
      values: embeddings[i],
    }));

    await insertVectors(c.env.VECTORIZE_INDEX, vectorsToInsert);

    return c.json(
      {
        message: `Processed ${documents.length} documents. Added and indexed ${newlyInsertedDocs.length} new documents.`,
        addedCount: newlyInsertedDocs.length,
        addedIds: newlyInsertedDocs.map((d) => d.id),
      },
      201
    );
  } catch (error) {
    console.error("Error adding documents:", error);
    return c.json({ error: "Failed to add documents." }, 500);
  }
}

// =================================================================
// 2. 문서 조회
// =================================================================

/**
 * 문서 목록을 조회하는 요청을 처리합니다.
 */
export async function RagDocuments(
  c: Context
): Promise<Response> {
  try {
    const prisma = createPrismaClient(c.env.DB);
    
    // 페이지네이션 파라미터 추출
    const { page, take, skip } = parsePagination(c, { defaultLimit: 10, maxLimit: 100 });
    const search = c.req.query("search") || "";
    
    // 검색 조건 구성
    const where = search ? {
      text: {
        contains: search,
        mode: 'insensitive' as const
      }
    } : {};
    
    // 전체 개수 조회
    const total = await prisma.document.count({ where });
    
    // 문서 목록 조회
    const documents = await prisma.document.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        text: true,
        metadata: true,
        createdAt: true,
        updatedAt: true
      }
    });
    
    // 메타데이터 파싱
    const parsedDocuments = documents.map(doc => ({
      ...doc,
      metadata: doc.metadata ? JSON.parse(doc.metadata) : null
    }));
    
    return c.json({
      data: parsedDocuments,
      pagination: {
        ...buildPaginationMeta(total, page, take),
        hasNext: page * take < total,
        hasPrev: page > 1,
      }
    });
  } catch (error) {
    console.error("Error listing documents:", error);
    return c.json({ error: "Failed to list documents." }, 500);
  }
}

// =================================================================
// 3. 문서 삭제
// =================================================================

/**
 * 여러 문서를 ID 목록을 이용해 한 번에 삭제하는 요청을 처리합니다.
 */
export async function RagDelete(c: Context): Promise<Response> {
  try {
    const { ids } = (await c.req.json()) as { ids: number[] };

    if (!Array.isArray(ids) || ids.length === 0) {
      return c.json(
        { error: "요청 본문에 'ids' 배열(숫자)을 포함해야 합니다." },
        400
      );
    }

    const validIds = ids.filter(
      (id) => typeof id === "number" && Number.isInteger(id)
    );
    if (validIds.length !== ids.length) {
      return c.json(
        { error: "'ids' 배열은 정수로만 구성되어야 합니다." },
        400
      );
    }

    const prisma = createPrismaClient(c.env.DB);
    
    // Prisma를 통해 D1에서 삭제
    const { count: deletedCount } = await prisma.document.deleteMany({
      where: {
        id: {
          in: validIds
        }
      }
    });

    // Vectorize에서 삭제
    const stringIds = validIds.map((id) => id.toString());
    if (stringIds.length > 0) {
      await c.env.VECTORIZE_INDEX.deleteByIds(stringIds);
    }

    return c.json(
      {
        message: `총 ${deletedCount}개의 문서가 성공적으로 삭제되었습니다.`,
        deletedCount,
      },
      200
    );
  } catch (error) {
    console.error("Error deleting documents:", error);
    if (error instanceof SyntaxError) {
      return c.json({ error: "잘못된 JSON 형식입니다." }, 400);
    }
    return c.json(
      { error: "문서 삭제 중 오류가 발생했습니다." },
      500
    );
  }
}

// =================================================================
// 4. 문서 수정
// =================================================================

export async function RagUpdate(
  c: Context
): Promise<Response> {
  const docId = parseInt(c.req.param("id"), 10);

  if (isNaN(docId)) {
    return c.json({ error: "Invalid document ID." }, 400);
  }

  try {
    const body = await c.req.json();
    const text = body.text;
    const metadata = body.metadata;

    // 기본적인 유효성 검사
    if (!text || typeof text !== 'string') {
      return c.json({ error: "텍스트는 필수이며 문자열이어야 합니다." }, 400);
    }

    if (!metadata || typeof metadata !== 'object') {
      return c.json({ error: "메타데이터는 필수이며 객체여야 합니다." }, 400);
    }

    if (!metadata.source || typeof metadata.source !== 'string') {
      return c.json({ error: "메타데이터의 source는 필수이며 문자열이어야 합니다." }, 400);
    }

    if (!metadata.category || typeof metadata.category !== 'string') {
      return c.json({ error: "메타데이터의 category는 필수이며 문자열이어야 합니다." }, 400);
    }

    const prisma = createPrismaClient(c.env.DB);
    
    // 기존 문서를 가져와서 텍스트 변경 여부 확인
    const existingDoc = await prisma.document.findUnique({
      where: { id: docId },
      select: { text: true }
    });

    if (!existingDoc) {
      return c.json({ error: `Document with ID ${docId} not found.` }, 404);
    }

    // Prisma를 통해 문서 업데이트
    await prisma.document.update({
      where: { id: docId },
      data: {
        text,
        metadata: JSON.stringify(metadata)
      }
    });

    // 텍스트가 변경된 경우에만 임베딩을 다시 생성하고 벡터를 업데이트
    if (existingDoc.text !== text) {
      const embedding = await createEmbedding(c.env.AI, text);
      await c.env.VECTORIZE_INDEX.upsert([
        { id: docId.toString(), values: embedding },
      ]);
    }

    return c.json(
      { 
        message: `Document ${docId} updated successfully.`, 
        id: docId,
        text,
        metadata
      },
      200
    );
  } catch (error) {
    console.error(`Error updating document ${docId}:`, error);
    if (error instanceof SyntaxError) {
      return c.json({ error: "잘못된 JSON 형식입니다." }, 400);
    }
    return c.json(
      { error: "문서 수정 중 오류가 발생했습니다." },
      500
    );
  }
}

// =================================================================
// 5. 메타데이터 스키마 조회
// =================================================================

export async function RagGetMetadataSchema(
  c: Context
): Promise<Response> {
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
  return c.json(schema, 200);
}
