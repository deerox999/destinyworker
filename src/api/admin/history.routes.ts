import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { PaginationQuerySchema, SuccessSchema } from "../../common/schemas";
import {
  getErrorLogs,
  createApiLog,
  getApiLogs,
  getApiStats,
} from "./historyApi";

const LogInputSchema = z
  .object({
    method: z.string().openapi({ example: "GET" }),
    url: z.string().openapi({ example: "/api/example" }),
    statusCode: z.number().int().optional().openapi({ example: 200 }),
    durationMs: z.number().int().optional().openapi({ example: 123 }),
    user: z.any().optional().openapi({ description: "요청자 정보(JSON)" }),
    params: z.any().optional().openapi({ description: "요청 파라미터(JSON)" }),
    response: z.any().optional().openapi({ description: "응답 본문(JSON)" }),
    ip: z.string().optional().openapi({ example: "1.2.3.4" }),
    userAgent: z.string().optional().openapi({ example: "Mozilla/5.0" }),
    notes: z.string().optional().openapi({ example: "추가 메모" }),
  })
  .openapi({ type: "object" });

export function createHistoryRouter(): OpenAPIHono {
  const app = new OpenAPIHono();

  // [Admin] 에러 로그 조회
  const getErrorLogsRoute = createRoute({
    method: "get",
    path: "/logs/errors",
    summary: "[Admin] 실패 오류 로그 조회",
    description:
      "statusCode가 400 이상인 API 에러 로그를 페이지네이션으로 조회합니다.",
    tags: ["Admin"],
    security: [{ BearerAuth: [] }],
    request: {
      query: PaginationQuerySchema.extend({
        urlContains: z
          .string()
          .optional()
          .openapi({
            param: { name: "urlContains", in: "query" },
            description: "URL 포함 검색",
            example: "/api/ai",
          }),
        from: z
          .string()
          .optional()
          .openapi({
            param: { name: "from", in: "query" },
            description: "시작일시(ISO)",
            example: "2025-01-01T00:00:00Z",
          }),
        to: z
          .string()
          .optional()
          .openapi({
            param: { name: "to", in: "query" },
            description: "종료일시(ISO)",
            example: "2025-12-31T23:59:59Z",
          }),
      }).openapi({ type: "object" }),
    },
    responses: {
      200: {
        description: "성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              logs: z
                .array(
                  z
                    .object({
                      id: z.number().int(),
                      method: z.string(),
                      url: z.string(),
                      statusCode: z.number().int().nullable(),
                      durationMs: z.number().int().nullable(),
                      ip: z.string().nullable(),
                      userAgent: z.string().nullable(),
                      notes: z.string().nullable(),
                      createdAt: z.string(),
                      user: z.any().nullable(),
                    })
                    .openapi({ type: "object" })
                )
                .openapi({ type: "array" }),
              pagination: z
                .object({
                  totalItems: z.number().int(),
                  totalPages: z.number().int(),
                  currentPage: z.number().int(),
                  pageSize: z.number().int(),
                })
                .openapi({ type: "object" }),
            }).openapi({ type: "object" }),
          },
        },
      },
      403: { description: "관리자 권한이 필요합니다." },
    },
  });

  // --- POST /logs: 기록 저장 ---
  const PostLogRoute = createRoute({
    method: "post",
    path: "/logs",
    summary: "API 호출 기록 저장",
    description: "API 호출 정보를 수집하여 로그로 저장합니다.",
    tags: ["History"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: LogInputSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: "기록 저장 성공",
        content: {
          "application/json": {
            schema: z
              .object({ success: z.boolean(), id: z.number().int() })
              .openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 요청" },
    },
  });

  app.openapi(PostLogRoute, (c) => createApiLog(c));

  // --- GET /logs: 간단 조회 ---
  const GetLogsQuerySchema = z
    .object({
      isError: z
        .enum(["true", "false"])
        .optional()
        .openapi({
          param: { name: "isError", in: "query" },
          description: "에러 여부 필터(true: 400+ / false: <400)",
        }),
      statusCode: z
        .string()
        .optional()
        .openapi({
          param: { name: "statusCode", in: "query" },
          description: "상태코드 정확히 일치",
        }),
      urlContains: z
        .string()
        .optional()
        .openapi({
          param: { name: "urlContains", in: "query" },
          description: "URL 포함 검색",
        }),
      from: z
        .string()
        .optional()
        .openapi({
          param: { name: "from", in: "query" },
          description: "시작일 (ISO)",
        }),
      to: z
        .string()
        .optional()
        .openapi({
          param: { name: "to", in: "query" },
          description: "종료일 (ISO)",
        }),
      page: z.coerce
        .number()
        .int()
        .min(1)
        .optional()
        .openapi({ param: { name: "page", in: "query" } }),
      pageSize: z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .openapi({ param: { name: "pageSize", in: "query" } }),
    })
    .openapi({ type: "object" });

  const LogListItemSchema = z
    .object({
      id: z.number().int(),
      method: z.string(),
      url: z.string(),
      statusCode: z.number().int().nullable(),
      durationMs: z.number().int().nullable(),
      ip: z.string().nullable(),
      userAgent: z.string().nullable(),
      notes: z.string().nullable(),
      createdAt: z.string().datetime(),
    })
    .openapi({ type: "object" });

  const GetLogsRoute = createRoute({
    method: "get",
    path: "/logs",
    summary: "API 호출 기록 조회",
    tags: ["History"],
    request: { query: GetLogsQuerySchema },
    responses: {
      200: {
        description: "조회 성공",
        content: {
          "application/json": {
            schema: z
              .object({
                success: z.boolean(),
                total: z.number().int(),
                page: z.number().int(),
                pageSize: z.number().int(),
                items: z.array(LogListItemSchema).openapi({ type: "array" }),
              })
              .openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 요청" },
    },
  });

  app.openapi(GetLogsRoute, (c) => getApiLogs(c));

  // --- GET /stats: 통계 조회 ---
  const GetStatsQuerySchema = z
    .object({
      from: z
        .string()
        .optional()
        .openapi({
          param: { name: "from", in: "query" },
          description: "시작일 (ISO). 기본: 7일 전",
        }),
      to: z
        .string()
        .optional()
        .openapi({
          param: { name: "to", in: "query" },
          description: "종료일 (ISO). 기본: 현재",
        }),
      top: z.coerce
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .openapi({
          param: { name: "top", in: "query" },
          description: "상위 URL/메서드 개수",
          example: 10,
        }),
    })
    .openapi({ type: "object" });

  const StatsResponseSchema = z
    .object({
      success: z.boolean(),
      total: z.number().int(),
      errorCount: z.number().int(),
      byStatus: z
        .object({
          s2xx: z.number().int(),
          s3xx: z.number().int(),
          s4xx: z.number().int(),
          s5xx: z.number().int(),
        })
        .openapi({ type: "object" }),
      topUrls: z
        .array(
          z
            .object({ url: z.string(), count: z.number().int() })
            .openapi({ type: "object" })
        )
        .openapi({ type: "array" }),
      byMethod: z
        .array(
          z
            .object({ method: z.string(), count: z.number().int() })
            .openapi({ type: "object" })
        )
        .openapi({ type: "array" }),
      dailyCounts: z
        .array(
          z
            .object({
              date: z.string().openapi({ example: "2024-01-01" }),
              count: z.number().int(),
              errorCount: z.number().int(),
            })
            .openapi({ type: "object" })
        )
        .openapi({ type: "array" }),
    })
    .openapi({ type: "object" });

  const GetStatsRoute = createRoute({
    method: "get",
    path: "/stats",
    summary: "API 호출 통계",
    description:
      "기간 내 로그를 바탕으로 상태코드/URL/메서드/일별 통계를 제공합니다.",
    tags: ["History"],
    request: { query: GetStatsQuerySchema },
    responses: {
      200: {
        description: "조회 성공",
        content: { "application/json": { schema: StatsResponseSchema } },
      },
      400: { description: "잘못된 요청" },
    },
  });

  app.openapi(GetStatsRoute, (c) => getApiStats(c));
  app.openapi(getErrorLogsRoute, (c) => getErrorLogs(c));
  return app;
}