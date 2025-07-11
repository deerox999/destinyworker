import { Ai, D1Database, VectorizeIndex } from "@cloudflare/workers-types";
import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";

/**
 * D1에서 조회한 문서의 타입 정의
 */
export interface DocumentWithMetadata {
  id: number;
  text: string;
  metadata: Record<string, any> | null;
  // 스키마에 정의된 다른 필드들도 여기에 추가할 수 있습니다.
  created_at: string;
  updated_at: string;
}

/**
 * RAG 파이프라인에 필요한 환경 변수 타입
 */
export interface RagEnv {
  AI: Ai;
  DB: D1Database;
  VECTORIZE_INDEX: VectorizeIndex;
  BRAVE_API_KEY?: string;
}

/**
 * 텍스트에 대한 임베딩 벡터를 생성합니다.
 * @param ai AI 인스턴스
 * @param text 임베딩할 텍스트
 * @returns 생성된 벡터 (부동 소수점 배열)
 */
export async function createEmbedding(ai: Ai, text: string): Promise<number[]> {
  const embeddingResponse = await ai.run("@cf/baai/bge-base-en-v1.5", {
    text: [text],
  });
  // @ts-ignore
  const vector = embeddingResponse.data?.[0];
  if (!vector) {
    throw new Error("Failed to generate vector embedding.");
  }
  return vector;
}

/**
 * 텍스트 묶음에 대한 임베딩 벡터를 생성합니다.
 * @param ai AI 인스턴스
 * @param texts 임베딩할 텍스트 배열
 * @returns 생성된 벡터의 배열 (2차원 부동 소수점 배열)
 */
export async function createEmbeddings(
  ai: Ai,
  texts: string[]
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }
  const embeddingResponse = await ai.run("@cf/baai/bge-base-en-v1.5", {
    text: texts,
  });
  // @ts-ignore
  const vectors = embeddingResponse.data;
  if (!vectors || vectors.length !== texts.length) {
    throw new Error("Failed to generate vector embeddings for all texts.");
  }
  return vectors;
}

/**
 * 유사한 문서 ID들을 Vectorize에서 검색합니다.
 * @param index Vectorize 인덱스 인스턴스
 * @param queryVector 질문의 임베딩 벡터
 * @returns 유사한 문서 ID 목록
 */
export async function findSimilarVectors(
  index: VectorizeIndex,
  vector: number[],
  topK: number = 5
): Promise<number[]> {
  try {
    const results = await index.query(vector, { topK });
    if (!results.matches || results.matches.length === 0) {
      return [];
    }
    return results.matches
      .map((match) => parseInt(match.id, 10))
      .filter((id) => !isNaN(id));
  } catch (error) {
    console.error("Error finding similar vectors:", error);
    return [];
  }
}

/**
 * ID 목록을 사용하여 D1에서 원본 문서들을 가져옵니다.
 * @param db D1 Database 인스턴스
 * @param ids 문서 ID 목록
 * @returns 문서 텍스트 목록
 */
export async function getDocumentsFromD1(
  db: D1Database,
  ids: string[]
): Promise<DocumentWithMetadata[]> {
  if (ids.length === 0) {
    return [];
  }
  const placeholders = ids.map(() => "?").join(", ");
  const { results } = await db
    .prepare(`SELECT * FROM documents WHERE id IN (${placeholders})`)
    .bind(...ids)
    .all<
      Omit<DocumentWithMetadata, "metadata"> & { metadata: string | null }
    >();

  if (!results) {
    return [];
  }

  // metadata 필드를 JSON 문자열에서 객체로 파싱합니다.
  return results.map((doc) => {
    let parsedMetadata: Record<string, any> | null = null;
    if (doc.metadata) {
      try {
        parsedMetadata = JSON.parse(doc.metadata);
      } catch (e) {
        console.error(`문서 ID ${doc.id}의 메타데이터 파싱 실패:`, e);
        // 파싱에 실패하면 null을 유지하거나, 혹은 원본 문자열을 그대로 반환할 수 있습니다.
        // 여기서는 null로 처리합니다.
      }
    }
    return { ...doc, metadata: parsedMetadata };
  });
}

/**
 * AI 사용량 로그를 D1 데이터베이스에 기록합니다.
 * @param db D1 Database 인스턴스
 * @param userId 사용자 ID
 * @param model 사용된 AI 모델
 * @param usage 토큰 사용량 정보 { prompt_tokens: number, completion_tokens: number, total_tokens: number }
 */
export async function logAiUsage(
  db: D1Database,
  userId: number,
  model: string,
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  }
): Promise<void> {
  // 로깅 실패가 주요 기능에 영향을 주지 않도록 try-catch로 감쌉니다.
  try {
    const adapter = new PrismaD1(db);
    const prisma = new PrismaClient({ adapter });

    await prisma.aiUsageLog.create({
      data: {
        userId: userId,
        model: model,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
      },
    });
    // 사용 후 즉시 연결을 해제합니다.
    await prisma.$disconnect();
  } catch (error) {
    console.error("Failed to log AI usage:", error);
  }
}
