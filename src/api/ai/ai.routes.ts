import { Router } from "../../common/router";
import DestinyTellerApi from "./DestinyTellerApi";
import RagApi from "./RagApi";
import SajuKnowledgeApi from "./SajuKnowledgeApi";

export function createAiRouter(): Router {
  const router = new Router();

  // 상세 사주 풀이
  router.post(
    "/api/ai/detailed-fortune-telling",
    async (request: Request, env: any) =>
      await DestinyTellerApi.fetch(request, env),
    {
      summary: "상세 사주 풀이 (RAG 결합)",
      description: "사용자 프롬프트와 사주 지식 베이스(RAG)를 결합하여 AI가 상세한 운세 풀이를 제공합니다. 스트리밍 응답을 지원합니다.",
      tags: ["AI"],
      auth: true,
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                systemPrompt: { type: "string", description: "AI의 역할을 정의하는 시스템 프롬프트" },
                userPrompt: { type: "string", description: "사주 분석을 위한 사용자의 질문 또는 정보" },
                stream: { type: "boolean", description: "스트리밍 응답 여부", default: false }
                // 기타 고급 파라미터(max_tokens, temperature 등)는 DestinyTellerApi.ts 참조
              },
              required: ["userPrompt"]
            }
          }
        }
      },
      responses: {
        "200": { description: "성공. stream=true일 경우 text/event-stream, false일 경우 application/json." },
        "400": { description: "잘못된 요청" },
        "500": { description: "AI 모델 실행 오류" }
      }
    }
  );

  // RAG 문서 추가
  router.post(
    "/api/rag/documents",
    async (request: Request, env: any) => await RagApi.fetch(request, env),
    {
      summary: "[RAG] 문서 추가",
      description: "RAG 시스템에 지식 문서를 추가하고 벡터 인덱싱을 수행합니다.",
      tags: ["AI - RAG"],
      auth: true, // 관리자 권한 필요
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                text: { type: "string", description: "저장할 텍스트 내용" },
              },
              required: ["text"]
            },
          },
        },
      },
      responses: {
        "201": { description: "문서 추가 및 인덱싱 성공" },
        "400": { description: "잘못된 요청" },
        "409": { description: "이미 존재하는 문서" },
        "500": { description: "서버 오류" }
      }
    }
  );

  // RAG 문서 목록 조회
  router.get(
    "/api/rag/documents",
    async (request: Request, env: any) => await RagApi.fetch(request, env),
    {
      summary: "[RAG] 문서 목록 조회",
      description:
        "RAG 시스템에 저장된 모든 문서를 페이지네이션 및 검색 기능과 함께 조회합니다.",
      tags: ["AI - RAG"],
      auth: true, // 관리자 권한 필요
      parameters: [
        {
          name: "page",
          in: "query",
          description: "페이지 번호 (기본값: 1)",
          schema: { type: "integer", default: 1 },
        },
        {
          name: "limit",
          in: "query",
          description: "페이지당 항목 수 (기본값: 10)",
          schema: { type: "integer", default: 10 },
        },
        {
          name: "search",
          in: "query",
          description: "문서 내용에서 검색할 키워드",
          schema: { type: "string" },
        },
      ],
      responses: {
        "200": {
          description: "성공적인 응답",
          // 상세 스키마는 common/paginationUtils.ts에 의해 결정됨
        },
        "500": { description: "서버 오류" }
      },
    }
  );

  // RAG 문서 삭제
  router.delete(
    "/api/rag/documents/:id",
    async (request: Request, env: any) => await RagApi.fetch(request, env),
    {
      summary: "[RAG] 문서 삭제",
      description:
        "특정 문서를 ID를 이용해 D1과 Vectorize 인덱스에서 모두 삭제합니다.",
      tags: ["AI - RAG"],
      auth: true, // 관리자 권한 필요
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          description: "삭제할 문서의 ID",
          schema: { type: "integer" },
        },
      ],
      responses: {
        "200": { description: "삭제 성공" },
        "400": { description: "잘못된 ID" },
        "404": { description: "문서를 찾을 수 없음" },
        "500": { description: "서버 오류" }
      }
    }
  );

  // RAG 질의
  router.post(
    "/api/rag/query",
    async (request: Request, env: any) => await RagApi.fetch(request, env),
    {
      summary: "[RAG] 질의",
      description: "RAG 시스템에 저장된 지식을 바탕으로 질문에 답변합니다.",
      tags: ["AI - RAG"],
      auth: true,
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                query: { type: "string", description: "질문 내용" },
              },
              required: ["query"]
            },
          },
        },
      },
      responses: {
        "200": {
          description: "질의 성공",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  answer: { type: "string", description: "AI의 답변" },
                  context: { type: "array", items: { type: "string" }, description: "답변에 사용된 컨텍스트 문서들" }
                }
              }
            }
          }
        },
        "400": { description: "질문 누락" },
        "500": { description: "서버 오류" }
      }
    }
  );

  // 대화형 RAG 새 대화 시작
  router.post(
    "/api/ai/saju-chat",
    async (request: Request, env: any) =>
      await SajuKnowledgeApi.fetch(request, env),
    {
      summary: "[대화형 RAG] 새 대화 시작",
      description:
        "사주 지식 기반의 대화형 AI와 새로운 대화를 시작합니다. 첫 질문을 보내면 고유한 conversationId가 반환됩니다.",
      tags: ["AI - 대화형 RAG"],
      auth: true,
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                message: { type: "string", description: "사용자의 첫 질문" },
                systemPrompt: {
                  type: "string",
                  description: "AI의 역할을 정의하는 시스템 프롬프트 (선택사항)",
                  nullable: true
                },
              },
              required: ["message"],
            },
          },
        },
      },
      responses: {
        "200": {
          description: "새 대화 시작 성공",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  conversationId: { type: "string", format: "uuid" },
                  answer: { type: "string" }
                }
              }
            }
          }
        },
        "400": { description: "메시지 누락" },
        "500": { description: "서버 오류" }
      }
    }
  );

  // 대화형 RAG 대화 이어가기
  router.post(
    "/api/ai/saju-chat/:id",
    async (request: Request, env: any) =>
      await SajuKnowledgeApi.fetch(request, env),
    {
      summary: "[대화형 RAG] 대화 이어가기",
      description:
        "기존 대화의 맥락을 이어받아 답변을 생성합니다. Path에 conversationId를 포함하여 요청해야 합니다.",
      tags: ["AI - 대화형 RAG"],
      auth: true,
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          description: "대화 ID (conversationId)",
          schema: { type: "string", format: "uuid" },
        },
      ],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                message: { type: "string", description: "사용자의 다음 질문" },
                systemPrompt: {
                  type: "string",
                  description: "AI의 역할을 정의하는 시스템 프롬프트 (선택사항)",
                  nullable: true
                },
              },
              required: ["message"],
            },
          },
        },
      },
      responses: {
        "200": {
          description: "대화 성공",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  conversationId: { type: "string", format: "uuid" },
                  answer: { type: "string" }
                }
              }
            }
          }
        },
        "400": { description: "메시지 누락" },
        "500": { description: "서버 오류" }
      }
    }
  );

  return router;
} 