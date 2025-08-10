import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  createCelebritiesBatch,
  createCelebrity,
  deleteCelebrity,
  getCelebrities,
  getCelebrityRequests,
  updateCelebrity,
} from "./celebrity";

import { MiddlewareHandler } from "hono";
import { CelebrityIdParamSchema, CelebritySchema, PaginationQuerySchema, SortQuerySchema, SuccessSchema, PaginationResponseSchema } from "../../../common/schemas";

export function createCelebrityAdminRouter(authMiddleware: MiddlewareHandler): OpenAPIHono {
  const app = new OpenAPIHono();
  app.use(authMiddleware);
  
  // 라우트 정의
  const getCelebritiesRoute = createRoute({
    method: "get",
    path: "/",
    summary: "유명인물 목록 조회",
    description: "페이지네이션을 지원하는 유명인물 목록을 조회합니다.",
    tags: ["Admin-유명인물"],
    security: [{ BearerAuth: [] }],
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

  const createCelebrityRoute = createRoute({
    method: "post",
    path: "/",
    summary: "[Admin] 유명인물 생성",
    description: "새로운 유명인물과 관련 다국어 정보를 생성합니다. (관리자용)",
    tags: ["Admin-유명인물"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: { "application/json": { schema: CelebritySchema } },
      },
    },
    responses: {
      201: { description: "생성 성공", content: { "application/json": { schema: SuccessSchema.extend({ celebrity: CelebritySchema }).openapi({ type: 'object' }) } } },
      400: { description: "잘못된 요청 데이터" },
      401: { description: "인증 실패" },
      403: { description: "권한 없음" },
    },
  });

  const createCelebritiesBatchRoute = createRoute({
    method: "post",
    path: "/batch",
    summary: "[Admin] 유명인물 대량 생성",
    description: "여러 유명인물을 한 번에 생성합니다. (관리자용)",
    tags: ["Admin-유명인물"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({ celebrities: z.array(CelebritySchema).openapi({ type: 'array' }) }).openapi({ type: 'object' }),
          },
        },
      },
    },
    responses: {
      201: { description: "대량 생성 성공", content: { "application/json": { schema: SuccessSchema.extend({ count: z.number().int().openapi({ example: 5 }) }).openapi({ type: 'object' }) } } },
      400: { description: "잘못된 요청 데이터" },
      401: { description: "인증 실패" },
      403: { description: "권한 없음" },
    },
  });

  const updateCelebrityRoute = createRoute({
    method: "put",
    path: "/{id}",
    summary: "[Admin] 유명인물 수정",
    description: "기존 유명인물의 정보를 수정합니다. (관리자용)",
    tags: ["Admin-유명인물"],
    security: [{ BearerAuth: [] }],
    request: {
      params: CelebrityIdParamSchema,
      body: {
        content: {
          "application/json": { schema: CelebritySchema.partial() },
        },
      },
    },
    responses: {
      200: { description: "수정 성공", content: { "application/json": { schema: SuccessSchema.extend({ celebrity: CelebritySchema }).openapi({ type: 'object' }) } } },
      400: { description: "잘못된 요청 데이터" },
      401: { description: "인증 실패" },
      403: { description: "권한 없음" },
      404: { description: "유명인물을 찾을 수 없음" },
    },
  });

  const deleteCelebrityRoute = createRoute({
    method: "delete",
    path: "/{id}",
    summary: "[Admin] 유명인물 삭제",
    description: "특정 유명인물을 삭제합니다. (관리자용)",
    tags: ["Admin-유명인물"],
    security: [{ BearerAuth: [] }],
    request: {
      params: CelebrityIdParamSchema,
    },
    responses: {
      200: { description: "삭제 성공", content: { "application/json": { schema: SuccessSchema.extend({ message: z.string().openapi({ example: "유명인물이 성공적으로 삭제되었습니다." }) }).openapi({ type: 'object' }) } } },
      401: { description: "인증 실패" },
      403: { description: "권한 없음" },
      404: { description: "유명인물을 찾을 수 없음" },
    },
  });

  const getCelebrityRequestsRoute = createRoute({
    method: "get",
    path: "/requests",
    summary: "유명인물 요청 목록 조회",
    description: "페이지네이션을 지원하는 유명인물 추가 요청 목록을 조회합니다. (관리자용)",
    tags: ["Admin-유명인물"],
    security: [{ BearerAuth: [] }],
    request: {
      query: PaginationQuerySchema.merge(SortQuerySchema).extend({
        search: z.string().optional().openapi({ description: "검색어 (요청된 이름으로 검색)", example: "아이유" }),
      }).openapi({ type: 'object' }),
    },
    responses: {
      200: { description: "조회 성공", content: { "application/json": { schema: SuccessSchema.extend({ requests: z.array(z.object({ id: z.number().int().openapi({ example: 1 }), name: z.string().openapi({ example: "아이유" }), description: z.string().openapi({ example: "가수" }), birthDate: z.string().openapi({ example: "1993-05-16" }), occupation: z.string().openapi({ example: "가수" }), isProcessed: z.boolean().openapi({ example: false }), createdAt: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }), updatedAt: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }) }).openapi({ type: 'object' })).openapi({ type: 'array' }), pagination: PaginationResponseSchema }).openapi({ type: 'object' }) } } },
      401: { description: "인증 실패 (관리자 권한 필요)" },
      500: { description: "서버 오류" },
    },
  });



  // 라우트 등록
  app.openapi(createCelebritiesBatchRoute, (c) => createCelebritiesBatch(c)); 
  app.openapi(createCelebrityRoute, (c) => createCelebrity(c));
  app.openapi(getCelebritiesRoute, (c) => getCelebrities(c)); // 안됨
  app.openapi(updateCelebrityRoute, (c) => updateCelebrity(c)); // 안됨
  // AI 응답 직접 업데이트 라우트는 분석 후처리로 대체되어 제거되었습니다.
  app.openapi(deleteCelebrityRoute, (c) => deleteCelebrity(c)); // 안됨
  app.openapi(getCelebrityRequestsRoute, (c) => getCelebrityRequests(c)); // 안됨
  return app;
}
