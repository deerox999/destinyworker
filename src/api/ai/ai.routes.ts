import { Router } from "../../common/class/router";
import { FortuneTelling } from "./DestinyTellerApi";
import {
  RagAddDocuments,
  RagDelete,
  RagGetMetadataSchema,
  RagDocuments,
  RagUpdate,
} from "./RagApi";
import {
  SajuChat,
  SajuChatDelete,
  SajuChatFull,
  SajuChatList,
} from "./SajuKnowledgeApi";

export function createAiRouter(): Router {
  const router = new Router();

  // 상세 사주 풀이
  router.post("/api/ai/detailed-fortune-telling", FortuneTelling, {
    summary: "상세 사주 풀이 (RAG 결합)",
    description:
      "사용자 프롬프트와 사주 지식 베이스(RAG)를 결합하여 AI가 상세한 운세 풀이를 제공합니다. 스트리밍 응답을 지원합니다.",
    tags: ["AI"],
    auth: true,
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              systemPrompt: {
                type: "string",
                description: "AI의 역할을 정의하는 시스템 프롬프트",
              },
              userPrompt: {
                type: "string",
                description: "사주 분석을 위한 사용자의 질문 또는 정보",
              },
              stream: {
                type: "boolean",
                description: "스트리밍 응답 여부",
                default: false,
              },
              // 기타 고급 파라미터(max_tokens, temperature 등)는 DestinyTellerApi.ts 참조
            },
            required: ["userPrompt"],
          },
        },
      },
    },
    responses: {
      "200": {
        description:
          "성공. stream=true일 경우 text/event-stream, false일 경우 application/json.",
      },
      "400": { description: "잘못된 요청" },
      "500": { description: "AI 모델 실행 오류" },
    },
  });

  // RAG 문서 추가
  router.post("/api/rag/documents", RagAddDocuments, {
    summary: "[RAG] 문서 일괄 추가",
    description:
      "RAG 시스템에 여러 지식 문서를 한 번에 추가하고 벡터 인덱싱을 수행합니다. 메타데이터도 함께 저장할 수 있습니다.",
    tags: ["AI - RAG"],
    auth: true, // 관리자 권한 필요
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              documents: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    text: {
                      type: "string",
                      description: "저장할 텍스트 내용",
                    },
                    metadata: {
                      type: "object",
                      description:
                        "문서에 대한 구조화된 메타데이터. 도서관의 '색인 카드'처럼 문서의 핵심 정보를 담습니다. 일관된 메타데이터는 AI 답변의 품질과 데이터 필터링 기능에 큰 영향을 미칩니다.",
                      properties: {
                        source: {
                          type: "string",
                          description:
                            "필수. 지식의 출처 (예: '자평진전', '궁통보감').",
                        },
                        category: {
                          type: "string",
                          enum: [
                            "십신론",
                            "격국론",
                            "용신론",
                            "물상론",
                            "기타",
                          ],
                          description: "필수. 사주 명리학의 대분류.",
                        },
                        author: {
                          type: "string",
                          description: "선택. 원본 저자.",
                          nullable: true,
                        },
                        relatedConcepts: {
                          type: "array",
                          items: { type: "string" },
                          description:
                            "선택. 관련된 핵심 개념어 배열. (예: ['갑목', '편재'])",
                          nullable: true,
                        },
                        url: {
                          type: "string",
                          description: "선택. 웹 출처인 경우의 URL.",
                          nullable: true,
                        },
                      },
                      required: ["source", "category"],
                    },
                  },
                  required: ["text", "metadata"],
                },
              },
            },
            required: ["documents"],
          },
          example: {
            documents: [
              {
                text: "갑목은 양의 목으로, 하늘로 솟아오르는 큰 나무와 같다.",
                metadata: {
                  source: "자평진전",
                  author: "심효첨",
                  category: "물상론",
                  relatedConcepts: ["갑목", "물상"],
                },
              },
              {
                text: "편재는 내가 극하는 오행이면서 음양이 같은 것을 말한다.",
                metadata: {
                  source: "어떤 사주 블로그",
                  category: "십신론",
                  url: "https://some.blog/saju/123",
                },
              },
            ],
          },
        },
      },
    },
    responses: {
      "201": { description: "문서 추가 및 인덱싱 성공" },
      "400": { description: "잘못된 요청" },
      "409": { description: "모든 문서가 이미 존재함" },
      "500": { description: "서버 오류" },
    },
  });

  // RAG 문서 메타데이터 수정
  router.put("/api/rag/documents/:id", RagUpdate, {
    summary: "[RAG] 문서 메타데이터 수정",
    description:
      "ID로 특정 문서의 메타데이터 전체를 수정합니다. 벡터 인덱스는 재계산되지 않습니다.",
    tags: ["AI - RAG"],
    auth: true, // 관리자 권한 필요
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "메타데이터를 수정할 문서의 ID",
        schema: { type: "integer" },
      },
    ],
    requestBody: {
      description:
        "새로운 메타데이터 객체. 모든 필드를 포함하여 전송해야 합니다.",
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              source: {
                type: "string",
                description: "필수. 지식의 출처 (예: '자평진전', '궁통보감').",
              },
              category: {
                type: "string",
                enum: ["십신론", "격국론", "용신론", "물상론", "기타"],
                description: "필수. 사주 명리학의 대분류.",
              },
              author: {
                type: "string",
                description: "선택. 원본 저자.",
                nullable: true,
              },
              relatedConcepts: {
                type: "array",
                items: { type: "string" },
                description:
                  "선택. 관련된 핵심 개념어 배열. (예: ['갑목', '편재'])",
                nullable: true,
              },
              url: {
                type: "string",
                description: "선택. 웹 출처인 경우의 URL.",
                nullable: true,
              },
            },
            required: ["source", "category"],
          },
          example: {
            source: "궁통보감",
            category: "용신론",
            author: "작자미상",
          },
        },
      },
    },
    responses: {
      "200": { description: "메타데이터 수정 성공" },
      "400": { description: "잘못된 요청 (ID 또는 메타데이터 형식 오류)" },
      "404": { description: "해당 ID의 문서를 찾을 수 없음" },
      "500": { description: "서버 오류" },
    },
  });

  // RAG 문서 목록 조회
  router.get("/api/rag/documents", RagDocuments, {
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
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "integer" },
                      text: { type: "string" },
                      metadata: {
                        type: "object",
                        properties: {
                          source: { type: "string" },
                          category: { type: "string" },
                          author: { type: "string", nullable: true },
                          relatedConcepts: {
                            type: "array",
                            items: { type: "string" },
                            nullable: true,
                          },
                          url: { type: "string", nullable: true },
                        },
                        nullable: true,
                      },
                      created_at: { type: "string", format: "date-time" },
                      updated_at: { type: "string", format: "date-time" },
                    },
                  },
                },
                pagination: {
                  type: "object",
                  properties: {
                    page: { type: "integer" },
                    limit: { type: "integer" },
                    totalItems: { type: "integer" },
                    totalPages: { type: "integer" },
                  },
                },
              },
            },
          },
        },
        // 상세 스키마는 common/paginationUtils.ts에 의해 결정됨
      },
      "500": { description: "서버 오류" },
    },
  });

  // RAG 문서 삭제
  router.delete("/api/rag/documents", RagDelete, {
    summary: "[RAG] 문서 일괄 삭제",
    description:
      "ID 목록을 이용해 D1과 Vectorize 인덱스에서 여러 문서를 한 번에 삭제합니다.",
    tags: ["AI - RAG"],
    auth: true, // 관리자 권한 필요
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              ids: {
                type: "array",
                items: { type: "integer" },
                description: "삭제할 문서 ID 목록",
              },
            },
            required: ["ids"],
          },
        },
      },
    },
    responses: {
      "200": { description: "삭제 성공" },
      "400": { description: "잘못된 요청 (ID 목록이 없거나 형식이 잘못됨)" },
      "500": { description: "서버 오류" },
    },
  });

  // RAG 메타데이터 스키마 조회
  router.get("/api/rag/metadata-schema", RagGetMetadataSchema, {
    summary: "[RAG] 메타데이터 스키마 조회",
    description:
      "문서 추가/수정에 필요한 메타데이터의 '설계도'를 제공합니다. 프론트엔드에서 이 정보를 바탕으로 입력 폼을 동적으로 생성할 수 있습니다. 예를 들어 'category' 필드는 드롭다운으로, 나머지는 텍스트 입력으로 구현할 수 있습니다.",
    tags: ["AI - RAG"],
    auth: true,
    responses: {
      "200": {
        description: "스키마 정보 조회 성공",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                keys: {
                  type: "array",
                  items: { type: "string" },
                  description: "사용 가능한 모든 메타데이터 키 목록",
                },
                required: {
                  type: "array",
                  items: { type: "string" },
                  description: "필수 메타데이터 키 목록",
                },
                options: {
                  type: "object",
                  properties: {
                    category: {
                      type: "array",
                      items: { type: "string" },
                      description: "category 필드에서 선택 가능한 값 목록",
                    },
                  },
                  description: "선택지가 정해진 필드의 옵션 값 목록",
                },
                fields: {
                  type: "object",
                  additionalProperties: {
                    type: "object",
                    properties: {
                      type: { type: "string" },
                      description: { type: "string" },
                      optional: { type: "boolean" },
                    },
                  },
                  description: "각 필드에 대한 상세 설명",
                },
              },
            },
          },
        },
      },
      "500": { description: "서버 오류" },
    },
  });

  // 대화형 RAG 새 대화 시작
  router.post("/api/ai/saju-chat", SajuChat, {
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
                nullable: true,
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
                answer: { type: "string" },
              },
            },
          },
        },
      },
      "400": { description: "메시지 누락" },
      "500": { description: "서버 오류" },
    },
  });

  // 대화형 RAG 대화 이어가기
  router.post("/api/ai/saju-chat/:id", SajuChatFull, {
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
                nullable: true,
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
                answer: { type: "string" },
              },
            },
          },
        },
      },
      "400": { description: "메시지 누락" },
      "500": { description: "서버 오류" },
    },
  });

  // 대화형 RAG 목록 조회
  router.get("/api/ai/saju-chat/history", SajuChatList, {
    summary: "[대화형 RAG] 내 대화 목록 조회",
    description:
      "현재 로그인한 사용자의 모든 대화 목록을 최신순으로 조회합니다.",
    tags: ["AI - 대화형 RAG"],
    auth: true,
    responses: {
      "200": {
        description: "대화 목록 조회 성공",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean" },
                conversations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string", format: "uuid" },
                      title: {
                        type: "string",
                        description: "대화의 첫 메시지 내용",
                      },
                      updatedAt: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "401": { description: "인증 실패" },
      "500": { description: "서버 오류" },
    },
  });

  // 대화형 RAG 특정 대화 기록 조회
  router.get("/api/ai/saju-chat/:id", SajuChatFull, {
    summary: "[대화형 RAG] 특정 대화 기록 조회",
    description: "특정 대화 ID에 해당하는 모든 메시지 기록을 조회합니다.",
    tags: ["AI - 대화형 RAG"],
    auth: true,
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "조회할 대화의 ID",
        schema: { type: "string", format: "uuid" },
      },
    ],
    responses: {
      "200": {
        description: "대화 기록 조회 성공",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean" },
                conversationId: { type: "string", format: "uuid" },
                messages: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      role: {
                        type: "string",
                        enum: ["user", "assistant", "system"],
                      },
                      content: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "401": { description: "인증 실패" },
      "404": { description: "대화를 찾을 수 없거나 권한이 없음" },
      "500": { description: "서버 오류" },
    },
  });

  // 대화형 RAG 특정 대화 삭제
  router.delete("/api/ai/saju-chat/:id", SajuChatDelete, {
    summary: "[대화형 RAG] 특정 대화 삭제",
    description: "특정 대화 ID에 해당하는 모든 메시지 기록을 삭제합니다.",
    tags: ["AI - 대화형 RAG"],
    auth: true,
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "삭제할 대화의 ID",
        schema: { type: "string", format: "uuid" },
      },
    ],
    responses: {
      "200": { description: "삭제 성공" },
      "401": { description: "인증 실패" },
      "404": { description: "대화를 찾을 수 없거나 권한이 없음" },
      "500": { description: "서버 오류" },
    },
  });

  return router;
}
