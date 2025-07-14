import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  getAdminStats,
  getAiUsageLogsForUser,
  getAiUsageStatsByModel,
  getAiUsageStatsByUser,
  getAiUsageStatsForModel,
  getLoginHistory,
  getUserProfiles,
  getUsers,
} from "./adminApi";

export function createAdminRouter(): OpenAPIHono {
  const app = new OpenAPIHono();

  // --- 스키마 정의 ---
  const PaginationQuerySchema = z.object({
    page: z.coerce
      .number()
      .int()
      .positive()
      .default(1)
      .optional()
      .openapi({ description: "페이지 번호", example: 1 }),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .default(20)
      .optional()
      .openapi({ description: "페이지당 항목 수", example: 20 }),
  });

  const UserSearchQuerySchema = z.object({
    search: z.string().optional().openapi({ description: "검색어 (이름 또는 이메일)", example: "홍길동" }),
  });

  const UserIdParamSchema = z.object({
    userId: z.coerce.number().int().positive().openapi({
      param: {
        name: "userId",
        in: "path",
      },
      description: "사용자 ID",
      example: 1,
    }),
  }).openapi({ type: 'object' });

  const DateRangeQuerySchema = z.object({
    startDate: z.string().optional().openapi({ description: "조회 시작일 (YYYY-MM-DD)", example: "2023-01-01" }),
    endDate: z.string().optional().openapi({ description: "조회 종료일 (YYYY-MM-DD)", example: "2023-01-31" }),
  });

  const AiUsageSortQuerySchema = z.object({
    sort: z.string().default("total_tokens").optional().openapi({ description: "정렬 필드", example: "total_tokens" }),
    order: z
      .enum(["asc", "desc"])
      .default("desc")
      .optional()
      .openapi({ description: "정렬 순서", example: "desc" }),
  });

  // --- 라우트 정의 ---

  const getUsersRoute = createRoute({
    method: "get",
    path: "users",
    summary: "가입한 유저 목록 조회",
    description:
      "가입한 모든 유저의 목록을 조회합니다. 페이지네이션과 검색 기능을 지원합니다.",
    tags: ["Admin"],
    security: [{ BearerAuth: [] }],
    request: {
      query: PaginationQuerySchema.merge(UserSearchQuerySchema),
    },
    responses: {
      200: {
        description: "성공적인 응답",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean().openapi({ example: true }),
              users: z.array(
                z.object({
                  id: z.number().openapi({ example: 1 }),
                  email: z.string().openapi({ example: "user@example.com" }),
                  name: z.string().openapi({ example: "홍길동" }),
                  picture: z.string().url().nullable().openapi({ example: "https://example.com/profile.jpg" }),
                  role: z.string().openapi({ example: "user" }),
                  createdAt: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }),
                  updatedAt: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }),
                  profileCount: z.number().int().openapi({ example: 2 }),
                }).openapi({ type: 'object' })
              ),
              pagination: z.object({
                totalItems: z.number().int().openapi({ example: 100 }),
                totalPages: z.number().int().openapi({ example: 5 }),
                currentPage: z.number().int().openapi({ example: 1 }),
                pageSize: z.number().int().openapi({ example: 20 }),
              }).openapi({ type: 'object' }),
            }).openapi({ type: 'object' }),
          },
        },
      },
    },
  });

  const getUserProfilesRoute = createRoute({
    method: "get",
    path: "users/{userId}/profiles",
    summary: "특정 유저의 프로필 조회",
    description: "특정 유저가 보유한 모든 사주 프로필을 조회합니다.",
    tags: ["Admin"],
    security: [{ BearerAuth: [] }],
    request: {
      params: UserIdParamSchema,
    },
    responses: {
      200: {
        description: "성공",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean().openapi({ example: true }),
              user: z.object({
                id: z.number().openapi({ example: 1 }),
                email: z.string().openapi({ example: "user@example.com" }),
                name: z.string().openapi({ example: "홍길동" }),
                picture: z.string().url().nullable().openapi({ example: "https://example.com/profile.jpg" }),
                role: z.string().openapi({ example: "user" }),
                createdAt: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }),
              }).openapi({ type: 'object' }),
              profiles: z.array(z.any().openapi({ type: 'object' })).openapi({ example: [], type: 'array' }), // toKoreanFields 스키마가 복잡하므로 any로 처리
              count: z.number().int().openapi({ example: 2 }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      400: { description: "잘못된 사용자 ID" },
      403: { description: "관리자 권한이 필요합니다." },
      404: { description: "사용자를 찾을 수 없습니다." },
    },
  });

  const getAdminStatsRoute = createRoute({
    method: "get",
    path: "stats",
    summary: "전체 통계 정보 조회",
    description:
      "전체 사용자 수, 프로필 수 등 관리자용 통계 정보를 조회합니다.",
    tags: ["Admin"],
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        description: "성공",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              stats: z.object({
                totalUsers: z.number().int(),
                totalProfiles: z.number().int(),
                adminUsers: z.number().int(),
                averageProfilesPerUser: z.number().nullable().openapi({ example: 1.5 }),
              }).openapi({ type: 'object' }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      403: { description: "관리자 권한이 필요합니다." },
    },
  });

  const getLoginHistoryRoute = createRoute({
    method: "get",
    path: "history/login",
    summary: "로그인/로그아웃 기록 조회",
    description:
      "전체 사용자의 로그인/로그아웃 기록을 페이지네이션으로 조회합니다.",
    tags: ["Admin"],
    security: [{ BearerAuth: [] }],
    request: {
      query: PaginationQuerySchema.merge(UserSearchQuerySchema).extend({
        action: z
          .enum(["login", "logout"])
          .optional()
          .openapi({ description: "활동 종류 필터링", example: "login" }),
      }).openapi({ type: 'object' }),
    },
    responses: {
      200: {
        description: "성공",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean().openapi({ example: true }),
              history: z.array(
                z.object({
                  id: z.number().openapi({ example: 1 }),
                  action: z.string().openapi({ example: "login" }),
                  ip: z.string().nullable().openapi({ example: "192.168.0.1" }),
                  userAgent: z.string().nullable().openapi({ example: "Mozilla/5.0" }),
                  createdAt: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }),
                  user: z
                    .object({
                      id: z.number().openapi({ example: 1 }),
                      email: z.string().openapi({ example: "user@example.com" }),
                      name: z.string().openapi({ example: "홍길동" }),
                      picture: z.string().url().nullable().openapi({ example: "https://example.com/profile.jpg" }),
                    })
                    .nullable().openapi({ type: 'object' }),
                }).openapi({ type: 'object' })
              ).openapi({ type: 'array' }),
              pagination: z.object({
                totalItems: z.number().int().openapi({ example: 100 }),
                totalPages: z.number().int().openapi({ example: 5 }),
                currentPage: z.number().int().openapi({ example: 1 }),
                pageSize: z.number().int().openapi({ example: 20 }),
              }).openapi({ type: 'object' }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      403: { description: "관리자 권한이 필요합니다." },
    },
  });

  const getAiUsageStatsByModelRoute = createRoute({
    method: "get",
    path: "stats/ai-usage-by-model",
    summary: "[Admin] 모델별 AI 사용량 통계",
    description:
      "기간별로 각 AI 모델의 총 토큰 사용량, 호출 수, 순수 사용자 수를 페이지네이션하여 조회합니다.",
    tags: ["Admin"],
    security: [{ BearerAuth: [] }],
    request: {
      query: PaginationQuerySchema.merge(DateRangeQuerySchema).merge(
        AiUsageSortQuerySchema
      ),
    },
    responses: {
      200: {
        description: "모델별 통계 조회 성공",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              stats: z.array(
                z.object({
                  model: z.string(),
                  totalTokens: z.number().int(),
                  callCount: z.number().int(),
                  userCount: z.number().int().openapi({ example: 10 }),
                }).openapi({ type: 'object' })
              ),
              pagination: z.object({
                totalItems: z.number().int().openapi({ example: 3 }),
                totalPages: z.number().int().openapi({ example: 1 }),
                currentPage: z.number().int().openapi({ example: 1 }),
                pageSize: z.number().int().openapi({ example: 20 }),
              }).openapi({ type: 'object' }),
            }).openapi({ type: 'object' }),
          },
        },
      },
    },
  });

  const getAiUsageStatsForModelRoute = createRoute({
    method: "get",
    path: "stats/ai-usage-by-model/{model}",
    summary: "[Admin] 특정 모델의 사용자별 AI 사용량 통계",
    description:
      "특정 AI 모델을 사용한 유저 목록과 각 유저의 토큰 사용량을 페이지네이션하여 조회합니다.",
    tags: ["Admin"],
    security: [{ BearerAuth: [] }],
    request: {
      params: z.object({
        model: z.string().openapi({
          param: {
            name: "model",
            in: "path",
          },
          description: "AI 모델 이름",
          example: "gemini-pro",
        }),
      }).openapi({ type: "object" }),
      query: PaginationQuerySchema.merge(DateRangeQuerySchema).merge(
        AiUsageSortQuerySchema
      ),
    },
    responses: {
      200: {
        description: "성공",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean().openapi({ example: true }),
              users: z.array(
                z.object({
                  userId: z.number().openapi({ example: 1 }),
                  userName: z.string().openapi({ example: "홍길동" }),
                  totalTokens: z.number().int().openapi({ example: 1000 }),
                  callCount: z.number().int().openapi({ example: 10 }),
                }).openapi({ type: 'object' })
              ).openapi({ type: 'array' }),
              pagination: z.object({
                totalItems: z.number().int().openapi({ example: 100 }),
                totalPages: z.number().int().openapi({ example: 5 }),
                currentPage: z.number().int().openapi({ example: 1 }),
                pageSize: z.number().int().openapi({ example: 20 }),
              }).openapi({ type: 'object' }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      400: { description: "모델 이름이 필요합니다." },
      403: { description: "관리자 권한이 필요합니다." },
    },
  });

  const getAiUsageStatsByUserRoute = createRoute({
    method: "get",
    path: "stats/ai-usage-by-user",
    summary: "[Admin] 사용자별 AI 사용량 통계",
    description:
      "기간별로 각 사용자의 AI 사용량을 모델별로 상세히 페이지네이션하여 조회합니다.",
    tags: ["Admin"],
    security: [{ BearerAuth: [] }],
    request: {
      query: PaginationQuerySchema.merge(DateRangeQuerySchema).merge(
        AiUsageSortQuerySchema
      ),
    },
    responses: {
      200: {
        description: "사용자별 통계 조회 성공",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              stats: z.array(
                z.object({
                  userId: z.number(),
                  userName: z.string().openapi({ example: "홍길동" }),
                  modelUsage: z.any().openapi({ type: 'object', example: { "gemini-pro": { totalTokens: 500, callCount: 5 } } }), // toKoreanFields 스키마가 복잡하므로 any로 처리
                }).openapi({ type: 'object' })
              ),
              pagination: z.object({
                totalItems: z.number().int().openapi({ example: 100 }),
                totalPages: z.number().int().openapi({ example: 5 }),
                currentPage: z.number().int().openapi({ example: 1 }),
                pageSize: z.number().int().openapi({ example: 20 }),
              }).openapi({ type: 'object' }),
            }).openapi({ type: 'object' }),
          },
        },
      },
    },
  });

  const getAiUsageLogsForUserRoute = createRoute({
    method: "get",
    path: "users/{userId}/ai-logs",
    summary: "[Admin] 특정 사용자 AI 사용 기록 조회",
    description:
      "특정 사용자의 모든 AI API 호출 기록을 페이지네이션하여 조회합니다.",
    tags: ["Admin"],
    security: [{ BearerAuth: [] }],
    request: {
      params: UserIdParamSchema,
      query: PaginationQuerySchema.merge(DateRangeQuerySchema).merge(
        AiUsageSortQuerySchema
      ),
    },
    responses: {
      200: {
        description: "성공",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              logs: z.array(
                z.object({
                  id: z.number(),
                  model: z.string(),
                  promptTokens: z.number().int(),
                  completionTokens: z.number().int(),
                  totalTokens: z.number().int(),
                  createdAt: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }),
                }).openapi({ type: 'object' })
              ),
              pagination: z.object({
                totalItems: z.number().int().openapi({ example: 100 }),
                totalPages: z.number().int().openapi({ example: 5 }),
                currentPage: z.number().int().openapi({ example: 1 }),
                pageSize: z.number().int().openapi({ example: 20 }),
              }).openapi({ type: 'object' }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      400: { description: "잘못된 사용자 ID입니다." },
      403: { description: "관리자 권한이 필요합니다." },
    },
  });

  // 라우트 등록
  app.openapi(getAdminStatsRoute, (c) => getAdminStats(c));
  app.openapi(getUsersRoute, (c) => getUsers(c)); // 안됨
  app.openapi(getUserProfilesRoute, (c) => getUserProfiles(c)); // 안됨
  app.openapi(getLoginHistoryRoute, (c) => getLoginHistory(c)); // 안됨
  app.openapi(getAiUsageStatsByModelRoute, (c) => getAiUsageStatsByModel(c)); // 안됨
  app.openapi(getAiUsageStatsForModelRoute, (c) => getAiUsageStatsForModel(c)); // 안됨
  app.openapi(getAiUsageStatsByUserRoute, (c) => getAiUsageStatsByUser(c)); // 안됨
  app.openapi(getAiUsageLogsForUserRoute, (c) => getAiUsageLogsForUser(c)); // 안됨
  return app;
}
