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
  addUserPoints,
  deductUserPoints,
  getUserCurrentPoints,
  getUserPointTransactions,
  getUserAnalysisTransactions,
  getAnalysisById,
} from "./adminApi";

import { MiddlewareHandler } from "hono";
import { PaginationQuerySchema, SuccessSchema, PaginationResponseSchema } from "../../common/schemas";

export function createAdminRouter(authMiddleware: MiddlewareHandler): OpenAPIHono {
  const app = new OpenAPIHono();

  app.use(authMiddleware);

  const UserSearchQuerySchema = z.object({
    search: z.string().optional().openapi({
      param: { name: "search", in: "query" },
      description: "검색어 (이름 또는 이메일)",
      example: "홍길동",
    }),
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
    startDate: z.string().optional().openapi({
      param: { name: "startDate", in: "query" },
      description: "조회 시작일 (YYYY-MM-DD)",
      example: "2023-01-01",
    }),
    endDate: z.string().optional().openapi({
      param: { name: "endDate", in: "query" },
      description: "조회 종료일 (YYYY-MM-DD)",
      example: "2023-01-31",
    }),
  });

  const AiUsageSortQuerySchema = z.object({
    sort: z.string().default("totalTokens").optional().openapi({
      param: { name: "sort", in: "query" },
      description: "정렬 필드",
      example: "totalTokens",
    }),
    order: z
      .enum(["asc", "desc"])
      .default("desc")
      .optional()
      .openapi({
        param: { name: "order", in: "query" },
        description: "정렬 순서",
        example: "desc",
      }),
  });

  // --- 라우트 정의 ---

  const getUsersRoute = createRoute({
    method: "get",
    path: "/users",
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
            schema: SuccessSchema.extend({
              users: z.array(
                z.object({
                  id: z.number().openapi({ example: 1 }),
                  email: z.string().openapi({ example: "user@example.com" }),
                  name: z.string().openapi({ example: "홍길동" }),
                  picture: z.string().url().nullable().openapi({ example: "https://example.com/profile.jpg" }),
                  role: z.string().openapi({ example: "user" }),
                  point: z.number().int().openapi({ example: 1000 }),
                  createdAt: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }),
                  updatedAt: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }),
                  profileCount: z.number().int().openapi({ example: 2 }),
                }).openapi({ type: 'object' })
              ),
              pagination: PaginationResponseSchema,
            }).openapi({ type: 'object' }),
          },
        },
      },
    },
  });

  const getUserProfilesRoute = createRoute({
    method: "get",
    path: "/users/{userId}/profiles",
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
            schema: SuccessSchema.extend({
              user: z.object({
                id: z.number().openapi({ example: 1 }),
                email: z.string().openapi({ example: "user@example.com" }),
                name: z.string().openapi({ example: "홍길동" }),
                picture: z.string().url().nullable().openapi({ example: "https://example.com/profile.jpg" }),
                role: z.string().openapi({ example: "user" }),
                point: z.number().int().openapi({ example: 1000 }),
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
    path: "/stats",
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
            schema: SuccessSchema.extend({
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
            schema: SuccessSchema.extend({
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
              pagination: PaginationResponseSchema,
            }).openapi({ type: 'object' }),
          },
        },
      },
      403: { description: "관리자 권한이 필요합니다." },
    },
  });

  const getAiUsageStatsByModelRoute = createRoute({
    method: "get",
    path: "/stats/ai-usage-by-model",
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
            schema: SuccessSchema.extend({
              stats: z.array(
                z.object({
                  model: z.string(),
                  totalTokens: z.number().int(),
                  callCount: z.number().int(),
                  userCount: z.number().int().openapi({ example: 10 }),
                }).openapi({ type: 'object' })
              ),
              pagination: PaginationResponseSchema,
            }).openapi({ type: 'object' }),
          },
        },
      },
    },
  });

  const getAiUsageStatsForModelRoute = createRoute({
    method: "get",
    path: "/stats/ai-usage-for-model",
    summary: "[Admin] 특정 모델의 사용자별 AI 사용량 통계",
    description:
      "특정 AI 모델을 사용한 유저 목록과 각 유저의 토큰 사용량을 페이지네이션하여 조회합니다.",
    tags: ["Admin"],
    security: [{ BearerAuth: [] }],
    request: {
      query: PaginationQuerySchema.merge(DateRangeQuerySchema)
        .merge(AiUsageSortQuerySchema)
        .extend({
          model: z.string().openapi({
            param: { name: "model", in: "query" },
            description: "AI 모델 이름",
            example: "gemini-pro",
          }),
        }),
    },
    responses: {
      200: {
        description: "성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              users: z.array(
                z.object({
                  userId: z.number().openapi({ example: 1 }),
                  userName: z.string().openapi({ example: "홍길동" }),
                  totalTokens: z.number().int().openapi({ example: 1000 }),
                  callCount: z.number().int().openapi({ example: 10 }),
                }).openapi({ type: 'object' })
              ).openapi({ type: 'array' }),
              pagination: PaginationResponseSchema,
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
    path: "/stats/ai-usage-by-user",
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
            schema: SuccessSchema.extend({
              stats: z.array(
                z.object({
                  userId: z.number(),
                  userName: z.string().openapi({ example: "홍길동" }),
                  modelUsage: z.any().openapi({ type: 'object', example: { "gemini-pro": { totalTokens: 500, callCount: 5 } } }), // toKoreanFields 스키마가 복잡하므로 any로 처리
                }).openapi({ type: 'object' })
              ),
              pagination: PaginationResponseSchema,
            }).openapi({ type: 'object' }),
          },
        },
      },
    },
  });

  const getAiUsageLogsForUserRoute = createRoute({
    method: "get",
    path: "/users/{userId}/ai-logs",
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
            schema: SuccessSchema.extend({
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
              pagination: PaginationResponseSchema,
            }).openapi({ type: 'object' }),
          },
        },
      },
      400: { description: "잘못된 사용자 ID입니다." },
      403: { description: "관리자 권한이 필요합니다." },
    },
  });

  // 포인트 관련 스키마
  const PointAmountSchema = z.object({
    amount: z.number().int().positive().openapi({
      description: "포인트 금액",
      example: 1000,
    }),
    description: z.string().min(1).openapi({
      description: "포인트 추가/차감 사유",
      example: "이벤트 보상",
    }),
  });

  const addUserPointsRoute = createRoute({
    method: "post",
    path: "/users/{userId}/points/add",
    summary: "[Admin] 사용자 포인트 추가",
    description: "관리자가 특정 사용자에게 포인트를 추가합니다.",
    tags: ["Admin"],
    security: [{ BearerAuth: [] }],
    request: {
      params: UserIdParamSchema,
      body: {
        content: {
          "application/json": {
            schema: PointAmountSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: "포인트 추가 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              message: z.string().openapi({ example: "포인트가 성공적으로 증가되었습니다." }),
              newPoints: z.number().int().openapi({ example: 2000 }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      400: { description: "잘못된 요청 (금액 또는 사유 누락)" },
      403: { description: "관리자 권한이 필요합니다." },
    },
  });

  const deductUserPointsRoute = createRoute({
    method: "post",
    path: "/users/{userId}/points/deduct",
    summary: "[Admin] 사용자 포인트 차감",
    description: "관리자가 특정 사용자의 포인트를 차감합니다.",
    tags: ["Admin"],
    security: [{ BearerAuth: [] }],
    request: {
      params: UserIdParamSchema,
      body: {
        content: {
          "application/json": {
            schema: PointAmountSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: "포인트 차감 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              message: z.string().openapi({ example: "포인트가 성공적으로 차감되었습니다." }),
              remainingPoints: z.number().int().openapi({ example: 500 }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      400: { description: "잘못된 요청 또는 포인트 부족" },
      403: { description: "관리자 권한이 필요합니다." },
    },
  });

  const getUserCurrentPointsRoute = createRoute({
    method: "get",
    path: "/users/{userId}/points",
    summary: "[Admin] 사용자 현재 포인트 조회",
    description: "관리자가 특정 사용자의 현재 포인트를 조회합니다.",
    tags: ["Admin"],
    security: [{ BearerAuth: [] }],
    request: {
      params: UserIdParamSchema,
    },
    responses: {
      200: {
        description: "포인트 조회 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              userId: z.number().int().openapi({ example: 1 }),
              currentPoints: z.number().int().openapi({ example: 1000 }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      400: { description: "잘못된 사용자 ID입니다." },
      403: { description: "관리자 권한이 필요합니다." },
    },
  });

  const getUserPointTransactionsRoute = createRoute({
    method: "get",
    path: "/users/{userId}/points/transactions",
    summary: "[Admin] 사용자 포인트 거래 내역 조회",
    description: "관리자가 특정 사용자의 포인트 거래 내역을 페이지네이션하여 조회합니다.",
    tags: ["Admin"],
    security: [{ BearerAuth: [] }],
    request: {
      params: UserIdParamSchema,
      query: PaginationQuerySchema,
    },
    responses: {
      200: {
        description: "거래 내역 조회 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              userId: z.number().int().openapi({ example: 1 }),
              transactions: z.array(
                z.object({
                  id: z.number().int().openapi({ example: 1 }),
                  amount: z.number().int().openapi({ example: 1000 }),
                  description: z.string().openapi({ example: "관리자 포인트 추가: 이벤트 보상" }),
                  type: z.string().openapi({ example: "CREDIT" }),
                  reference: z.string().nullable().openapi({ example: "admin_add_1234567890" }),
                  createdAt: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }),
                  analysisId: z.number().int().nullable().openapi({ example: 1234567890, description: "분석 결과 ID (분석 거래인 경우)" }),
                }).openapi({ type: 'object' })
              ),
              pagination: z.object({
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

  const getUserAnalysisTransactionsRoute = createRoute({
    method: "get",
    path: "/users/{userId}/analysis-transactions",
    summary: "[Admin] 사용자 분석 결과가 있는 포인트 거래 내역 조회",
    description: "관리자가 특정 사용자의 분석 결과가 있는 포인트 거래 내역만 조회합니다.",
    tags: ["Admin"],
    security: [{ BearerAuth: [] }],
    request: {
      params: UserIdParamSchema,
      query: PaginationQuerySchema,
    },
    responses: {
      200: {
        description: "분석 거래 내역 조회 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              userId: z.number().int().openapi({ example: 1 }),
              transactions: z.array(
                z.object({
                  id: z.number().int().openapi({ example: 1 }),
                  amount: z.number().int().openapi({ example: -1000 }),
                  description: z.string().openapi({ example: "사주 분석: 일반 분석" }),
                  type: z.string().openapi({ example: "DEBIT" }),
                  reference: z.string().nullable().openapi({ example: "saju_analysis_1234567890" }),
                  createdAt: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }),
                  analysis: z.object({
                    id: z.number().int().openapi({ example: 1 }),
                    analysisType: z.string().openapi({ example: "general" }),
                    type: z.string().openapi({ example: "individual" }),
                    title: z.string().openapi({ example: "[일반] 사주 분석" }),
                  }).openapi({ type: 'object' }),
                }).openapi({ type: 'object' })
              ),
              pagination: z.object({
                currentPage: z.number().int().openapi({ example: 1 }),
                pageSize: z.number().int().openapi({ example: 20 }),
                total: z.number().int().openapi({ example: 50 }),
                totalPages: z.number().int().openapi({ example: 3 }),
              }).openapi({ type: 'object' }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      400: { description: "잘못된 사용자 ID입니다." },
      403: { description: "관리자 권한이 필요합니다." },
    },
  });

  const getAnalysisByTransactionRoute = createRoute({
    method: "get",
    path: "/analyses/{analysisId}",
    summary: "[Admin] 분석 결과 상세 조회",
    description: "관리자가 특정 분석 결과의 상세 정보를 조회합니다.",
    tags: ["Admin"],
    security: [{ BearerAuth: [] }],
    request: {
      params: z.object({
        analysisId: z.coerce.number().int().positive().openapi({
          param: {
            name: "analysisId",
            in: "path",
          },
          description: "분석 결과 ID",
          example: 1234567890,
        }),
      }).openapi({ type: 'object' }),
    },
    responses: {
      200: {
        description: "분석 결과 조회 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              analysis: z.object({
                id: z.number().int().openapi({ example: 1 }),
                analysisType: z.string().openapi({ example: "general" }),
                type: z.string().openapi({ example: "individual" }),
                title: z.string().openapi({ example: "[일반] 사주 분석" }),
                userPrompt: z.string().openapi({ example: "나의 사주를 분석해주세요" }),
                systemPrompt: z.string().nullable().openapi({ example: "당신은 전문 사주 상담사입니다" }),
                aiResponse: z.string().openapi({ example: "당신의 사주를 분석한 결과..." }),
                modelUsed: z.string().openapi({ example: "gemini-2.0-flash-exp" }),
                pointsSpent: z.number().int().openapi({ example: 1000 }),
                isFavorite: z.boolean().openapi({ example: false }),
                analysisStartedAt: z.string().datetime().nullable().openapi({ example: "2023-01-01T00:00:00.000Z" }),
                analysisCompletedAt: z.string().datetime().nullable().openapi({ example: "2023-01-01T00:00:00.000Z" }),
                sajuData: z.any().openapi({ type: 'object' }),
                i18n: z.string().optional().openapi({ example: "ko" }),
                timezone: z.string().optional().openapi({ example: "Asia/Seoul" }),
                createdAt: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }),
                updatedAt: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }),
              }).nullable().openapi({ type: 'object' }),
              message: z.string().optional().openapi({ example: "이 거래는 분석 결과와 연결되지 않았습니다." }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      400: { description: "잘못된 분석 ID입니다." },
      403: { description: "관리자 권한이 필요합니다." },
      404: { description: "분석 결과를 찾을 수 없습니다." },
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
  
  // 포인트 관련 라우트
  app.openapi(addUserPointsRoute, (c) => addUserPoints(c));
  app.openapi(deductUserPointsRoute, (c) => deductUserPoints(c));
  app.openapi(getUserCurrentPointsRoute, (c) => getUserCurrentPoints(c));
  app.openapi(getUserPointTransactionsRoute, (c) => getUserPointTransactions(c));
  app.openapi(getUserAnalysisTransactionsRoute, (c) => getUserAnalysisTransactions(c));
  app.openapi(getAnalysisByTransactionRoute, (c) => getAnalysisById(c));
  
  return app;
}
