import { Router } from "../../common/router";
import DestinyTellerApi from "./DestinyTellerApi";
import RagApi from "./RagApi";
import SajuKnowledgeApi from "./SajuKnowledgeApi";

export function createAiRouter(): Router {
  const router = new Router();

  // 상세 사주 풀이
  router.post(
    "/api/detailed-fortune-telling",
    async (request: Request, env: any) =>
      await DestinyTellerApi.fetch(request, env),
    {
      summary: "상세 사주 풀이",
      description: "사주 정보를 기반으로 AI가 상세한 운세 풀이를 제공합니다.",
      tags: ["AI"],
      auth: true,
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
      auth: true,
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                text: { type: "string", description: "저장할 텍스트" },
              },
            },
          },
        },
      },
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
      auth: true,
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
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: {
                    type: "array",
                    items: {
                      // 여기에 Document 모델의 스키마를 정의할 수 있습니다.
                      type: "object",
                      properties: {
                        id: { type: "integer" },
                        text: { type: "string" },
                        created_at: { type: "string", format: "date-time" },
                        updated_at: { type: "string", format: "date-time" },
                      },
                    },
                  },
                  pagination: {
                    type: "object",
                    properties: {
                      totalItems: { type: "integer" },
                      totalPages: { type: "integer" },
                      currentPage: { type: "integer" },
                      pageSize: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
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
      auth: true,
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          description: "삭제할 문서의 ID",
          schema: { type: "string" },
        },
      ],
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
            },
          },
        },
      },
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
                },
              },
              required: ["message"],
            },
          },
        },
      },
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
          schema: { type: "string" },
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
                },
              },
              required: ["message"],
            },
          },
        },
      },
    }
  );

  return router;
} 