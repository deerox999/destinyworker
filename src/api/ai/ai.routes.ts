import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { FortuneTelling } from "./DestinyTellerApi";
import { SajuAnalysisWithGemini, TestGeminiApi } from "./geminiApi";
import {
  RagAddDocuments,
  RagDelete,
  RagDocuments,
  RagGetMetadataSchema,
  RagUpdate,
} from "./RagApi";
import {
  SajuChat,
  SajuChatDelete,
  SajuChatFull,
  SajuChatList,
} from "./SajuKnowledgeApi";

import { MiddlewareHandler } from "hono";
import {
  ConversationIdParamSchema,
  PaginationResponseSchema,
  SuccessSchema,
} from "../../common/schemas";

export function createAiRouter(authMiddleware: MiddlewareHandler): OpenAPIHono {
  const app = new OpenAPIHono();
  app.use(authMiddleware);

  // --- 스키마 정의 ---

  // 테스트용 간단한 Gemini API 스키마
  const TestGeminiRequestSchema = z
    .object({
      systemPrompt: z
        .string()
        .optional()
        .openapi({
          description: "AI 역할 정의 시스템 프롬프트",
          example: "당신은 친절한 AI 어시스턴트입니다.",
        }),
      userPrompt: z
        .string()
        .openapi({
          description: "사용자 질문",
          example: "안녕하세요! 간단한 테스트입니다.",
        }),
    })
    .openapi({ type: "object" });

  // Gemini & Fortune Telling 스키마
  const AiBasicRequestSchema = z
    .object({
      userPrompt: z
        .string()
        .openapi({
          description: "사용자 질문",
          example: "제 사주는 어떤가요?",
        }),
      systemPrompt: z
        .string()
        .optional()
        .openapi({
          description: "AI 역할 정의 시스템 프롬프트",
          example: "당신은 사주 전문가입니다.",
        }),
      stream: z
        .boolean()
        .default(false)
        .optional()
        .openapi({ description: "스트리밍 응답 여부", example: false }),
    })
    .openapi({ type: "object" });

  const SajuDataSchema = z
    .any()
    .openapi({
      description: "계산된 상세 사주 정보 (JSON)",
      example: {
        birthDate: "1990-03-15",
        calculatedData: { saju: "경진", elements: ["금", "토"] },
      },
    });

  const SajuAnalysisWithGeminiSchema = AiBasicRequestSchema.extend({
    model: z
      .string()
      .default("gemini-2.5-flash")
      .optional()
      .openapi({
        description: "사용할 Gemini 모델",
        example: "gemini-2.5-flash",
      }),
    conversationId: z
      .string()
      .uuid()
      .nullable()
      .optional()
      .openapi({
        description: "대화 ID (기존 대화 이어가기용)",
        example: "a1b2c3d4-e5f6-7890-1234-567890abcdef",
      }),
    sajuData: SajuDataSchema.optional().openapi({
      description: "사주 정보 (첫 대화에서만 전송)",
    }),
    generationConfig: z
      .object({
        temperature: z.number().min(0).max(1).optional(),
        topP: z.number().optional(),
        topK: z.number().optional(),
        maxOutputTokens: z.number().int().optional(),
        stopSequences: z.array(z.string()).optional(),
      })
      .openapi({ type: "object" }),
    safetySettings: z
      .array(
        z
          .object({
            category: z.string(),
            threshold: z.string(),
          })
          .openapi({ type: "object" })
      )
      .optional(),
  }).openapi({ type: "object" });

  // RAG 문서 스키마
  const RagMetadataSchema = z.object({
    text: z.string().min(1),
    metadata: z.object({
      source: z.string().min(1),
      category: z.string().min(1),
      author: z.string().optional(),
      relatedConcepts: z.array(z.string()).optional(),
      url: z.string().optional(),
    }),
  });

  const RagDocumentSchema = z
    .object({
      text: z
        .string()
        .openapi({ description: "저장할 텍스트 내용", example: "정관은..." }),
      metadata: RagMetadataSchema,
    })
    .openapi({ type: "object" });

  // 대화형 RAG 스키마
  const SajuChatRequestSchema = z
    .object({
      message: z
        .string()
        .openapi({
          description: "사용자 메시지",
          example: "안녕하세요, 제 사주에 대해 알려주세요.",
        }),
      i18n: z
        .enum(["ko", "en", "ja", "zh", "vi"])
        .default("ko")
        .optional()
        .openapi({ description: "언어 코드", example: "ko" }),
    })
    .openapi({ type: "object" });

  // --- 라우트 정의 ---

  const TestGeminiRoute = createRoute({
    method: "post",
    path: "/test-gemini",
    summary: "테스트용 간단한 Gemini API",
    description: "systemPrompt와 userPrompt만 받아서 간단하게 테스트할 수 있는 API입니다.",
    tags: ["AI"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: { "application/json": { schema: TestGeminiRequestSchema } },
      },
    },
    responses: {
      200: {
        description: "성공적인 응답",
        content: {
          "application/json": {
            schema: z
              .object({
                success: z.boolean().openapi({ example: true }),
                response: z.string().openapi({ example: "안녕하세요! 테스트 응답입니다." }),
                model: z.string().openapi({ example: "gemini-2.5-flash" }),
                timestamp: z.string().openapi({ example: "2023-01-01T00:00:00.000Z" }),
              })
              .openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 요청 (userPrompt 누락)" },
      500: { description: "Gemini API 또는 서버 오류" },
    },
  });

  const FortuneTellingRoute = createRoute({
    method: "post",
    path: "/detailed-fortune-telling",
    summary: "상세 사주 풀이 (RAG 결합)",
    description:
      "사용자 프롬프트와 사주 지식 베이스(RAG)를 결합하여 AI가 상세한 운세 풀이를 제공합니다.",
    tags: ["AI"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: { "application/json": { schema: AiBasicRequestSchema } },
      },
    },
    responses: {
      200: {
        description:
          "성공. stream=true일 경우 text/event-stream, false일 경우 application/json.",
        content: {
          "application/json": {
            schema: z
              .object({
                result: z.string().openapi({ example: "당신의 사주는..." }),
              })
              .openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 요청" },
      500: { description: "AI 모델 실행 오류" },
    },
  });

  const SajuAnalysisWithGeminiRoute = createRoute({
    method: "post",
    path: "/gemini-saju-analysis",
    summary: "Gemini AI 기반 사주 분석",
    description:
      "Google의 Gemini AI 모델과 RAG를 결합하여 심층적인 사주 분석을 제공합니다.",
    tags: ["AI"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": { schema: SajuAnalysisWithGeminiSchema },
        },
      },
    },
    responses: {
      200: {
        description:
          "성공. stream=true일 경우 text/event-stream, false일 경우 application/json.",
        content: {
          "application/json": {
            schema: z
              .object({
                conversationId: z
                  .string()
                  .uuid()
                  .openapi({ example: "a1b2c3d4-e5f6-7890-1234-567890abcdef" }),
                answer: z.string().openapi({ example: "Gemini 분석 결과..." }),
                metadata: z
                  .object({
                    model_used: z.string(),
                    gateway_enabled: z.boolean(),
                    timestamp: z.string(),
                    stream_enabled: z.boolean(),
                    response_type: z.string(),
                  })
                  .optional(),
              })
              .openapi({ type: "object" }),
          },
          // "text/event-stream": {
          //     schema: z.object({}).openapi({ example: "event: message\ndata: ..." }) // 스트림은 스키마를 특정하기 어려우므로 빈 객체로 둡니다.
          // }
        },
      },
      400: { description: "잘못된 요청" },
      401: { description: "인증 실패" },
      500: { description: "Gemini API 또는 서버 오류" },
    },
  });

  const RagAddDocumentsRoute = createRoute({
    method: "post",
    path: "/rag/documents",
    summary: "[RAG] 문서 일괄 추가",
    description:
      "RAG 시스템에 여러 지식 문서를 한 번에 추가하고 벡터 인덱싱을 수행합니다.",
    tags: ["AI - RAG"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z
              .object({ documents: z.array(RagDocumentSchema) })
              .openapi({ type: "object" }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "문서 추가 및 인덱싱 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              count: z.number().int().openapi({ example: 5 }),
            }).openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 요청" },
      409: { description: "모든 문서가 이미 존재함" },
      500: { description: "서버 오류" },
    },
  });

  const RagUpdateRoute = createRoute({
    method: "put",
    path: "/rag/documents/{id}",
    summary: "[RAG] 문서 메타데이터 수정",
    description: "ID로 특정 문서의 메타데이터 전체를 수정합니다.",
    tags: ["AI - RAG"],
    security: [{ BearerAuth: [] }],
    request: {
      params: z
        .object({
          id: z.coerce
            .number()
            .int()
            .positive()
            .openapi({
              param: { name: "id", in: "path" },
              description: "문서 ID",
              example: 123,
            }),
        })
        .openapi({ type: "object" }),
      body: {
        content: {
          "application/json": { schema: RagMetadataSchema },
        },
      },
    },
    responses: {
      200: {
        description: "메타데이터 수정 성공",
        content: {
          "application/json": {
            schema: RagMetadataSchema,
          },
        },
      },
      400: { description: "잘못된 요청 (ID 또는 메타데이터 형식 오류)" },
      404: { description: "해당 ID의 문서를 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  const RagGetDocumentsRoute = createRoute({
    method: "get",
    path: "/rag/documents",
    summary: "[RAG] 문서 목록 조회",
    description:
      "RAG 시스템에 저장된 모든 문서를 페이지네이션 및 검색 기능과 함께 조회합니다.",
    tags: ["AI - RAG"],
    security: [{ BearerAuth: [] }],
    // request: {
    //     query: z.object({
    //         page: z.coerce.number().int().positive().default(1).optional(),
    //         limit: z.coerce.number().int().positive().default(10).optional(),
    //         search: z.string().optional(),
    //     }).openapi({ type: 'object' })
    // },
    responses: {
      200: {
        description: "성공적인 응답",
        content: {
          "application/json": {
            schema: z
              .object({
                documents: z.array(
                  RagDocumentSchema.extend({ id: z.number().int() }).openapi({
                    type: "object",
                  })
                ),
                pagination: PaginationResponseSchema,
              })
              .openapi({ type: "object" }),
          },
        },
      },
      500: { description: "서버 오류" },
    },
  });

  const RagDeleteRoute = createRoute({
    method: "delete",
    path: "/rag/documents/{id}",
    summary: "[RAG] 문서 삭제",
    description: "ID로 특정 문서를 RAG 시스템에서 삭제합니다.",
    tags: ["AI - RAG"],
    security: [{ BearerAuth: [] }],
    request: {
      params: z
        .object({
          id: z.coerce
            .number()
            .int()
            .positive()
            .openapi({
              param: { name: "id", in: "path" },
              description: "문서 ID",
              example: 123,
            }),
        })
        .openapi({ type: "object" }),
    },
    responses: {
      200: {
        description: "삭제 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              deletedCount: z.number().int().openapi({ example: 3 }),
            }).openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 요청" },
      500: { description: "서버 오류" },
    },
  });

  const RagGetMetadataSchemaRoute = createRoute({
    method: "get",
    path: "/rag/metadata-schema",
    summary: "[RAG] 메타데이터 스키마 조회",
    description: "RAG 문서에 사용되는 메타데이터의 구조(enum 등)를 조회합니다.",
    tags: ["AI - RAG"],
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        description: "스키마 정보 조회 성공",
        content: {
          "application/json": {
            schema: z.object({
              schema: z.any().openapi({ type: "object" }), // 실제 스키마는 동적이므로 any로 처리
            }),
          },
        },
      },
      500: { description: "서버 오류" },
    },
  });

  const SajuChatRoute = createRoute({
    method: "post",
    path: "/saju-chat",
    summary: "사주 지식 기반 채팅",
    description:
      "특정 사주에 대한 지식 기반으로 대화를 시작하거나 이어갑니다. 대화 ID가 없으면 새로운 대화를 시작합니다.",
    tags: ["AI - 대화형 RAG"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: { "application/json": { schema: SajuChatRequestSchema } },
      },
    },
    responses: {
      200: {
        description: "새 대화 시작 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              conversationId: z
                .string()
                .uuid()
                .openapi({ example: "a1b2c3d4-e5f6-7890-1234-567890abcdef" }),
              response: z
                .string()
                .openapi({ example: "안녕하세요! 무엇을 도와드릴까요?" }),
            }).openapi({ type: "object" }),
          },
        },
      },
      400: { description: "메시지 누락" },
      500: { description: "서버 오류" },
    },
  });

  const SajuChatContinueRoute = createRoute({
    method: "post",
    path: "/saju-chat/{id}",
    summary: "[대화형 RAG] 대화 이어가기",
    description: "기존 대화의 맥락을 이어받아 답변을 생성합니다.",
    tags: ["AI - 대화형 RAG"],
    security: [{ BearerAuth: [] }],
    request: {
      params: ConversationIdParamSchema,
      body: {
        content: { "application/json": { schema: SajuChatRequestSchema } },
      },
    },
    responses: {
      200: {
        description: "대화 이어가기 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              conversationId: z
                .string()
                .uuid()
                .openapi({ example: "a1b2c3d4-e5f6-7890-1234-567890abcdef" }),
              response: z.string().openapi({ example: "네, 계속 말씀하세요." }),
            }).openapi({ type: "object" }),
          },
        },
      },
      400: { description: "메시지 또는 대화 ID 누락" },
      404: { description: "대화를 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  const SajuChatListRoute = createRoute({
    method: "get",
    path: "/saju-chat",
    summary: "[대화형 RAG] 내 대화 목록 조회",
    description:
      "현재 로그인한 사용자의 모든 대화 목록을 최신순으로 조회합니다.",
    tags: ["AI - 대화형 RAG"],
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        description: "대화 목록 조회 성공",
        content: {
          "application/json": {
            schema: z.array(
              z
                .object({
                  id: z
                    .string()
                    .uuid()
                    .openapi({
                      example: "a1b2c3d4-e5f6-7890-1234-567890abcdef",
                    }),
                  userId: z
                    .string()
                    .openapi({ example: "google-oauth2|12345" }),
                  title: z
                    .string()
                    .nullable()
                    .openapi({ example: "나의 사주 이야기" }),
                  createdAt: z
                    .string()
                    .datetime()
                    .openapi({ example: "2023-01-01T00:00:00.000Z" }),
                  updatedAt: z
                    .string()
                    .datetime()
                    .openapi({ example: "2023-01-01T00:00:00.000Z" }),
                })
                .openapi({ type: "object" })
            ),
          },
        },
      },
      401: { description: "인증 실패" },
      500: { description: "서버 오류" },
    },
  });

  const SajuChatFullRoute = createRoute({
    method: "get",
    path: "/saju-chat/{id}",
    summary: "[대화형 RAG] 특정 대화 기록 조회",
    description: "특정 대화 ID에 해당하는 모든 메시지 기록을 조회합니다.",
    tags: ["AI - 대화형 RAG"],
    security: [{ BearerAuth: [] }],
    request: {
      params: ConversationIdParamSchema,
    },
    responses: {
      200: {
        description: "전체 대화 내용 조회 성공",
        content: {
          "application/json": {
            schema: z
              .object({
                id: z
                  .string()
                  .uuid()
                  .openapi({ example: "a1b2c3d4-e5f6-7890-1234-567890abcdef" }),
                title: z
                  .string()
                  .nullable()
                  .openapi({ example: "나의 사주 이야기" }),
                messages: z
                  .array(
                    z
                      .object({
                        role: z
                          .enum(["user", "assistant"])
                          .openapi({ example: "user" }),
                        content: z.string().openapi({ example: "안녕하세요" }),
                        createdAt: z
                          .string()
                          .datetime()
                          .openapi({ example: "2023-01-01T00:00:00.000Z" }),
                      })
                      .openapi({ type: "object" })
                  )
                  .openapi({ type: "array" }),
              })
              .openapi({ type: "object" }),
          },
        },
      },
      401: { description: "인증 실패 또는 권한 없음" },
      404: { description: "대화를 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  const SajuChatDeleteRoute = createRoute({
    method: "delete",
    path: "/saju-chat",
    summary: "[대화형 RAG] 대화 일괄 삭제",
    description: "여러 대화 ID를 배열로 받아서 해당하는 모든 메시지 기록을 일괄 삭제합니다.",
    tags: ["AI - 대화형 RAG"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                conversationIds: z
                  .array(z.string().uuid())
                  .min(1)
                  .openapi({
                    description: "삭제할 대화 ID 배열",
                    example: ["a1b2c3d4-e5f6-7890-1234-567890abcdef", "b2c3d4e5-f6g7-8901-2345-678901bcdefg"],
                  }),
              })
              .openapi({ type: "object" }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "대화 일괄 삭제 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              deletedCount: z.number().int().openapi({ example: 5 }),
              deletedConversationIds: z.array(z.string().uuid()).openapi({ example: ["a1b2c3d4-e5f6-7890-1234-567890abcdef"] }),
            }).openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 요청 (conversationIds 배열 누락 또는 빈 배열)" },
      401: { description: "인증 실패 또는 권한 없음" },
      500: { description: "서버 오류" },
    },
  });

  // 라우트 등록 (구체적인 경로를 먼저 등록)
  app.openapi(TestGeminiRoute, TestGeminiApi);
  app.openapi(FortuneTellingRoute, FortuneTelling);
  app.openapi(SajuAnalysisWithGeminiRoute, SajuAnalysisWithGemini);
  app.openapi(SajuChatRoute, SajuChat);
  app.openapi(SajuChatListRoute, SajuChatList);

  app.openapi(RagAddDocumentsRoute, RagAddDocuments);
  app.openapi(RagUpdateRoute, RagUpdate);
  app.openapi(RagGetDocumentsRoute, RagDocuments);
  app.openapi(RagDeleteRoute, RagDelete);
  app.openapi(RagGetMetadataSchemaRoute, RagGetMetadataSchema);
  
  // 파라미터가 있는 라우트는 나중에 등록 (경로 충돌 방지)
  app.openapi(SajuChatContinueRoute, SajuChat);
  app.openapi(SajuChatFullRoute, SajuChatFull);
  app.openapi(SajuChatDeleteRoute, SajuChatDelete);
  return app;
}
