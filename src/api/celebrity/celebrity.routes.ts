import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { MiddlewareHandler } from "hono";
import { CelebritySchema, PaginationQuerySchema, PaginationResponseSchema, SortQuerySchema, SuccessSchema } from "../../common/schemas";
import { getCelebrities } from "../admin/celebrity/celebrity";

export function createCelebrityRouter(authMiddleware: MiddlewareHandler): OpenAPIHono {
  const app = new OpenAPIHono();

  const getCelebritiesRoute = createRoute({
    method: "get",
    path: "/",
    summary: "유명인물 목록 조회",
    description: "페이지네이션을 지원하는 유명인물 목록을 조회합니다.",
    tags: ["유명인물"],
    request: {
      query: PaginationQuerySchema.merge(SortQuerySchema).extend({
        id: z.string().optional().describe("ID로 검색 (정확한 ID 매칭)"),
        search: z.string().optional().openapi({ description: "통합 검색 (ID, 이름, 직업, 설명)", example: "아이유" }),
      }).openapi({ type: 'object' }),
    },
    responses: {
      200: { description: "조회 성공", content: { "application/json": { schema: SuccessSchema.extend({ celebrities: z.array(CelebritySchema).openapi({ type: 'array' }), pagination: PaginationResponseSchema }).openapi({ type: 'object' }) } } },
      500: { description: "서버 오류" },
    },
  });

  app.openapi(getCelebritiesRoute, (c) => getCelebrities(c)); // 안됨
  return app;
}
