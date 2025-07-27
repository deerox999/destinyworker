import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { FortuneTelling } from "./DestinyTellerApi";
import { 
  SajuAnalysisWithGemini, 
  SajuCompatibilityAnalysis,
  YearlyFortuneAnalysis,
  getSajuAnalysisList,
  getSajuAnalysisDetail,
  toggleSajuAnalysisFavorite,
  updateSajuAnalysisTitle,
  deleteSajuAnalysis
} from "./geminiApi";
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

  // Gemini & Fortune Telling 스키마
  const AiBasicRequestSchema = z
    .object({
      userPrompt: z.string().openapi({
        description: "사용자 질문",
        example: "제 사주는 어떤가요?",
      }),
      systemPrompt: z.string().optional().openapi({
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

  const SajuDataSchema = z.any().openapi({
    description: "계산된 상세 사주 정보 (JSON) - 개인 사주 또는 궁합 비교용",
    example: {
      // 개인 사주용
      birthDate: "1990-03-15",
      calculatedData: { saju: "경진", elements: ["금", "토"] },
      // 또는 궁합 비교용
      person1: { id: "person1", name: "첫 번째 사람", sajuData: { /* 사주 데이터 */ } },
      person2: { id: "person2", name: "두 번째 사람", sajuData: { /* 사주 데이터 */ } }
    },
  });

  // Content 타입 정의 (Gemini API용)
  const ContentSchema = z.object({
    role: z.enum(["user", "model", "function", "tool"]),
    parts: z.array(z.object({
      text: z.string().optional(),
      inlineData: z.object({
        mimeType: z.string(),
        data: z.string()
      }).optional(),
      fileData: z.object({
        mimeType: z.string(),
        fileUri: z.string()
      }).optional(),
      functionCall: z.object({
        name: z.string(),
        args: z.record(z.string(), z.any())
      }).optional(),
      functionResponse: z.object({
        name: z.string(),
        response: z.record(z.string(), z.any())
      }).optional()
    }))
  });

  const SajuAnalysisWithGeminiSchema = AiBasicRequestSchema.extend({
    model: z.string().default("gemini-2.5-pro").optional().openapi({
      description: "사용할 Gemini 모델",
      example: "gemini-2.5-pro",
    }),
    conversationHistory: z.array(ContentSchema).optional().openapi({
      description: "프론트에서 관리하는 전체 대화 기록",
      example: [
        {
          role: "user",
          parts: [{ text: "내 사주를 분석해주세요" }]
        },
        {
          role: "model", 
          parts: [{ text: "사주 분석 결과..." }]
        }
      ]
    }),
    sajuData: SajuDataSchema.optional().openapi({
      description: "사주 정보 (첫 대화에서만 전송)",
    }),
    analysisType: z.string().optional().openapi({
      description: "분석 유형 (프론트엔드에서 관리)",
      example: "career",
    }),
    i18n: z.string().optional().openapi({
      description: "언어 설정",
      example: "ko",
    }),
    timezone: z.string().optional().openapi({
      description: "시간대 설정",
      example: "Asia/Seoul",
    }),
    generationConfig: z
      .object({
        temperature: z.number().min(0).max(1).optional(),
        topP: z.number().optional(),
        topK: z.number().optional(),
        maxOutputTokens: z.number().int().optional(),
        stopSequences: z.array(z.string()).optional(),
        responseMimeType: z.enum(["text/plain", "application/json"]).optional(),
        seed: z.number().optional(),
      })
      .openapi({ type: "object" }),
    safetySettings: z
      .array(
        z
          .object({
            category: z.enum([
              "HARM_CATEGORY_HARASSMENT",
              "HARM_CATEGORY_HATE_SPEECH", 
              "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              "HARM_CATEGORY_DANGEROUS_CONTENT"
            ]),
            threshold: z.enum([
              "BLOCK_NONE",
              "BLOCK_ONLY_HIGH",
              "BLOCK_MEDIUM_AND_ABOVE",
              "BLOCK_LOW_AND_ABOVE",
              "OFF"
            ]),
          })
          .openapi({ type: "object" })
      )
      .optional(),
    tools: z.array(z.object({
      functionDeclarations: z.array(z.object({
        name: z.string(),
        description: z.string(),
        parameters: z.record(z.string(), z.any()).optional()
      })).optional()
    })).optional(),
    toolConfig: z.object({
      functionCallingConfig: z.object({
        mode: z.enum(["AUTO", "ANY", "NONE"])
      }).optional()
    }).optional(),
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
      message: z.string().openapi({
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
    summary: "Gemini AI 기반 사주 분석 (단순화된 버전)",
    description:
      "Google의 Gemini AI 모델을 사용하여 사주 분석을 제공합니다. 프론트에서 대화 기록을 관리하며, 백엔드는 순수 Gemini API 호출만 처리합니다.",
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
                answer: z.string().openapi({ example: "Gemini 분석 결과..." }),
                metadata: z
                  .object({
                    model_used: z.string(),
                    timestamp: z.string(),
                    stream_enabled: z.boolean(),
                    response_type: z.string(),
                  })
                  .optional(),
              })
              .openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 요청" },
      401: { description: "인증 실패" },
      500: { description: "Gemini API 또는 서버 오류" },
    },
  });

  const SajuCompatibilityAnalysisRoute = createRoute({
    method: "post",
    path: "/gemini-compatibility-analysis",
    summary: "Gemini AI 기반 궁합 분석",
    description:
      "Google의 Gemini AI 모델을 사용하여 두 사람의 사주 궁합을 분석합니다. person1과 person2의 사주 데이터를 비교하여 궁합을 분석합니다.",
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
                answer: z.string().openapi({ example: "궁합 분석 결과..." }),
                metadata: z
                  .object({
                    model_used: z.string(),
                    timestamp: z.string(),
                    stream_enabled: z.boolean(),
                    response_type: z.string(),
                    person1_name: z.string(),
                    person2_name: z.string(),
                  })
                  .optional(),
              })
              .openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 요청 또는 궁합 데이터 누락" },
      401: { description: "인증 실패" },
      500: { description: "Gemini API 또는 서버 오류" },
    },
  });

  const YearlyFortuneAnalysisRoute = createRoute({
    method: "post",
    path: "/yearly-fortune-analysis",
    summary: "연간운세 분석 (무료 서비스)",
    description:
      "Google의 Gemini AI 모델을 사용하여 올해운세, 내년운세, 또는 둘 다를 분석합니다. fortuneType 파라미터로 분기합니다. 무료 서비스로 포인트 차감이 없습니다.",
    tags: ["AI"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": { 
            schema: SajuAnalysisWithGeminiSchema.extend({
              fortuneType: z.enum(["this_year", "next_year", "both"]).default("this_year").optional().openapi({
                description: "운세 유형",
                example: "this_year",
              }),
            })
          },
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
                answer: z.string().openapi({ example: "연간운세 분석 결과..." }),
                metadata: z
                  .object({
                    model_used: z.string(),
                    timestamp: z.string(),
                    stream_enabled: z.boolean(),
                    response_type: z.string(),
                    service_type: z.string(),
                    fortune_type: z.string(),
                  })
                  .optional(),
                points: z
                  .object({
                    deducted: z.number(),
                    remaining: z.any(),
                    message: z.string(),
                  })
                  .optional(),
              })
              .openapi({ type: "object" }),
          },
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
                  id: z.string().uuid().openapi({
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
    description:
      "여러 대화 ID를 배열로 받아서 해당하는 모든 메시지 기록을 일괄 삭제합니다.",
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
                    example: [
                      "a1b2c3d4-e5f6-7890-1234-567890abcdef",
                      "b2c3d4e5-f6g7-8901-2345-678901bcdefg",
                    ],
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
              deletedConversationIds: z
                .array(z.string().uuid())
                .openapi({ example: ["a1b2c3d4-e5f6-7890-1234-567890abcdef"] }),
            }).openapi({ type: "object" }),
          },
        },
      },
      400: {
        description: "잘못된 요청 (conversationIds 배열 누락 또는 빈 배열)",
      },
      401: { description: "인증 실패 또는 권한 없음" },
      500: { description: "서버 오류" },
    },
  });

  // 사주 분석 결과 관련 라우트들
  const SajuAnalysisListRoute = createRoute({
    method: "get",
    path: "/saju-analyses",
    summary: "사주 분석 결과 목록 조회",
    description: "사용자의 사주 분석 결과 목록을 페이지네이션과 필터링과 함께 조회합니다.",
    tags: ["AI - 사주 분석 결과"],
    security: [{ BearerAuth: [] }],
    request: {
      query: z.object({
        page: z.coerce.number().int().min(1).default(1).optional(),
        limit: z.coerce.number().int().min(1).max(50).default(10).optional(),
        type: z.string().optional(),
        favorite: z.enum(["true", "false"]).optional(),
      }),
    },
    responses: {
      200: {
        description: "분석 결과 목록 조회 성공",
        content: {
          "application/json": {
            schema: z.object({
              analyses: z.array(z.object({
                id: z.number().int(),
                analysis_type: z.string(),
                title: z.string(),
                user_prompt: z.string(),
                ai_response: z.string(),
                model_used: z.string(),
                points_spent: z.number().int(),
                is_favorite: z.boolean(),
                created_at: z.string(),
                updated_at: z.string(),
                i18n: z.string().optional(),
                timezone: z.string().optional(),
              })),
              pagination: PaginationResponseSchema,
            }),
          },
        },
      },
      401: { description: "인증 실패" },
      500: { description: "서버 오류" },
    },
  });

  const SajuAnalysisDetailRoute = createRoute({
    method: "get",
    path: "/saju-analyses/{id}",
    summary: "사주 분석 결과 상세 조회",
    description: "특정 사주 분석 결과의 상세 정보를 조회합니다.",
    tags: ["AI - 사주 분석 결과"],
    security: [{ BearerAuth: [] }],
    request: {
      params: z.object({
        id: z.coerce.number().int().positive(),
      }),
    },
    responses: {
      200: {
        description: "분석 결과 상세 조회 성공",
        content: {
          "application/json": {
            schema: z.object({
              id: z.number().int(),
              analysis_type: z.string(),
              title: z.string(),
              saju_data: z.any(),
              user_prompt: z.string(),
              system_prompt: z.string().nullable(),
              ai_response: z.string(),
              model_used: z.string(),
              points_spent: z.number().int(),
              is_favorite: z.boolean(),
              created_at: z.string(),
              updated_at: z.string(),
              i18n: z.string().optional(),
              timezone: z.string().optional(),
            }),
          },
        },
      },
      401: { description: "인증 실패" },
      404: { description: "분석 결과를 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  const SajuAnalysisFavoriteRoute = createRoute({
    method: "patch",
    path: "/saju-analyses/{id}/favorite",
    summary: "사주 분석 결과 즐겨찾기 토글",
    description: "사주 분석 결과의 즐겨찾기 상태를 토글합니다.",
    tags: ["AI - 사주 분석 결과"],
    security: [{ BearerAuth: [] }],
    request: {
      params: z.object({
        id: z.coerce.number().int().positive(),
      }),
    },
    responses: {
      200: {
        description: "즐겨찾기 토글 성공",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              is_favorite: z.boolean(),
              message: z.string(),
            }),
          },
        },
      },
      401: { description: "인증 실패" },
      404: { description: "분석 결과를 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  const SajuAnalysisTitleRoute = createRoute({
    method: "patch",
    path: "/saju-analyses/{id}/title",
    summary: "사주 분석 결과 제목 수정",
    description: "사주 분석 결과의 제목을 수정합니다.",
    tags: ["AI - 사주 분석 결과"],
    security: [{ BearerAuth: [] }],
    request: {
      params: z.object({
        id: z.coerce.number().int().positive(),
      }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              title: z.string().min(1).max(100),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "제목 수정 성공",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              title: z.string(),
              message: z.string(),
            }),
          },
        },
      },
      400: { description: "잘못된 요청" },
      401: { description: "인증 실패" },
      404: { description: "분석 결과를 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  const SajuAnalysisDeleteRoute = createRoute({
    method: "delete",
    path: "/saju-analyses/{id}",
    summary: "사주 분석 결과 삭제",
    description: "사주 분석 결과를 삭제합니다.",
    tags: ["AI - 사주 분석 결과"],
    security: [{ BearerAuth: [] }],
    request: {
      params: z.object({
        id: z.coerce.number().int().positive(),
      }),
    },
    responses: {
      200: {
        description: "삭제 성공",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              message: z.string(),
            }),
          },
        },
      },
      401: { description: "인증 실패" },
      404: { description: "분석 결과를 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  // 라우트 등록 (구체적인 경로를 먼저 등록)
  app.openapi(FortuneTellingRoute, FortuneTelling);
  app.openapi(SajuAnalysisWithGeminiRoute, SajuAnalysisWithGemini);
  app.openapi(SajuCompatibilityAnalysisRoute, SajuCompatibilityAnalysis);
  app.openapi(YearlyFortuneAnalysisRoute, YearlyFortuneAnalysis);
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
  app.openapi(SajuAnalysisListRoute, getSajuAnalysisList);
  app.openapi(SajuAnalysisDetailRoute, getSajuAnalysisDetail);
  app.openapi(SajuAnalysisFavoriteRoute, toggleSajuAnalysisFavorite);
  app.openapi(SajuAnalysisTitleRoute, updateSajuAnalysisTitle);
  app.openapi(SajuAnalysisDeleteRoute, deleteSajuAnalysis);
  return app;
}
