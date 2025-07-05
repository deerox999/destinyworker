import { Ai, D1Database, VectorizeIndex } from "@cloudflare/workers-types";

/**
 * RAG 파이프라인에 필요한 환경 변수 타입
 */
export interface RagEnv {
  AI: Ai;
  DB: D1Database;
  VECTORIZE_INDEX: VectorizeIndex;
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
 * 유사한 문서 ID들을 Vectorize에서 검색합니다.
 * @param index Vectorize 인덱스 인스턴스
 * @param queryVector 질문의 임베딩 벡터
 * @returns 유사한 문서 ID 목록
 */
export async function findSimilarVectors(
  index: VectorizeIndex,
  queryVector: number[]
): Promise<string[]> {
  const sim = await index.query(queryVector, { topK: 5 }); // 상위 5개 문서 검색
  return sim.matches.map((match) => match.id);
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
): Promise<string[]> {
  if (ids.length === 0) {
    return [];
  }
  const placeholders = ids.map(() => "?").join(", ");
  const { results } = await db
    .prepare(`SELECT text FROM documents WHERE id IN (${placeholders})`)
    .bind(...ids)
    .all<{ text: string }>();
  return results?.map((res) => res.text) || [];
} 