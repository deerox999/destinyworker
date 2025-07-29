import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { MiddlewareHandler } from "hono";
import {
  ConversationIdParamSchema,
  SuccessSchema,
} from "../../common/schemas";
import {
  SajuChat,
  SajuChatDelete,
  SajuChatFull,
  SajuChatList,
} from "./SajuKnowledgeApi";

export function createChatRouter(authMiddleware: MiddlewareHandler): OpenAPIHono {
  const app = new OpenAPIHono();
  app.use(authMiddleware);

  // --- 스키마 정의 ---
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

  // --- 라우트 등록 ---
  app.openapi(SajuChatRoute, SajuChat);
  app.openapi(SajuChatListRoute, SajuChatList);

  // 파라미터가 있는 라우트는 나중에 등록 (경로 충돌 방지)
  app.openapi(SajuChatContinueRoute, SajuChat);
  app.openapi(SajuChatFullRoute, SajuChatFull);
  app.openapi(SajuChatDeleteRoute, SajuChatDelete);

  return app;
} 