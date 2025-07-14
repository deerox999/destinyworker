import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  createCelebrity,
  createCelebritiesBatch,
  deleteCelebrity,
  getCelebrities,
  getCelebrityRequests,
  updateCelebrity,
} from "./celebrity";

export function createCelebrityAdminRouter(): OpenAPIHono {
  const app = new OpenAPIHono();

  // 스키마 정의
  const PaginationQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1).optional().describe("페이지 번호"),
    limit: z.coerce.number().int().positive().default(10).optional().describe("페이지당 항목 수"),
  });

  const SortQuerySchema = z.object({
    sort: z.string().default("createdAt").optional().describe("정렬 필드"),
    order: z.enum(["asc", "desc"]).default("desc").optional().describe("정렬 순서"),
  });
  
  const CelebrityIdParamSchema = z.object({
    id: z.string().describe("유명인물 ID"),
  });

  const TranslationSchema = z.object({
    languageCode: z.string().describe("언어 코드"),
    name: z.string().describe("이름"),
    occupation: z.string().optional().describe("직업"),
    description: z.string().optional().describe("설명"),
  });

  const CelebritySchema = z.object({
    id: z.string(),
    birthYear: z.number().int(),
    birthMonth: z.number().int(),
    birthDay: z.number().int(),
    birthHour: z.number().int().optional(),
    birthMinute: z.number().int().optional(),
    calendar: z.enum(["SOLAR", "LUNAR"]),
    gender: z.enum(["MALE", "FEMALE"]),
    imageUrl: z.string().url().optional(),
    translations: z.array(TranslationSchema),
  });

  // 라우트 정의
  const getCelebritiesRoute = createRoute({
    method: "get",
    path: "/celebrities",
    summary: "유명인물 목록 조회",
    description: "페이지네이션을 지원하는 유명인물 목록을 조회합니다.",
    tags: ["Admin-유명인물"],
    security: [{ BearerAuth: [] }],
    request: {
      query: PaginationQuerySchema.merge(SortQuerySchema).extend({
        id: z.string().optional().describe("ID로 검색 (정확한 ID 매칭)"),
        search: z.string().optional().describe("통합 검색 (ID, 이름, 직업, 설명)"),
      }),
    },
    responses: {
      200: { description: "조회 성공" },
      500: { description: "서버 오류" },
    },
  });

  const createCelebrityRoute = createRoute({
    method: "post",
    path: "/celebrities",
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
      201: { description: "생성 성공" },
      400: { description: "잘못된 요청 데이터" },
      401: { description: "인증 실패" },
      403: { description: "권한 없음" },
    },
  });

  const createCelebritiesBatchRoute = createRoute({
    method: "post",
    path: "/celebrities/batch",
    summary: "[Admin] 유명인물 대량 생성",
    description: "여러 유명인물을 한 번에 생성합니다. (관리자용)",
    tags: ["Admin-유명인물"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({ celebrities: z.array(CelebritySchema) }),
          },
        },
      },
    },
    responses: {
      201: { description: "대량 생성 성공" },
      400: { description: "잘못된 요청 데이터" },
      401: { description: "인증 실패" },
      403: { description: "권한 없음" },
    },
  });

  const updateCelebrityRoute = createRoute({
    method: "put",
    path: "/celebrities/{id}",
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
      200: { description: "수정 성공" },
      400: { description: "잘못된 요청 데이터" },
      401: { description: "인증 실패" },
      403: { description: "권한 없음" },
      404: { description: "유명인물을 찾을 수 없음" },
    },
  });

  const deleteCelebrityRoute = createRoute({
    method: "delete",
    path: "/celebrities/{id}",
    summary: "[Admin] 유명인물 삭제",
    description: "특정 유명인물을 삭제합니다. (관리자용)",
    tags: ["Admin-유명인물"],
    security: [{ BearerAuth: [] }],
    request: {
      params: CelebrityIdParamSchema,
    },
    responses: {
      200: { description: "삭제 성공" },
      401: { description: "인증 실패" },
      403: { description: "권한 없음" },
      404: { description: "유명인물을 찾을 수 없음" },
    },
  });

  const getCelebrityRequestsRoute = createRoute({
    method: "get",
    path: "/celebrities/requests",
    summary: "유명인물 요청 목록 조회",
    description: "페이지네이션을 지원하는 유명인물 추가 요청 목록을 조회합니다. (관리자용)",
    tags: ["Admin-유명인물"],
    security: [{ BearerAuth: [] }],
    request: {
      query: PaginationQuerySchema.merge(SortQuerySchema).extend({
        search: z.string().optional().describe("검색어 (요청된 이름으로 검색)"),
      }),
    },
    responses: {
      200: { description: "조회 성공" },
      401: { description: "인증 실패 (관리자 권한 필요)" },
      500: { description: "서버 오류" },
    },
  });


  // 라우트 등록
  app.openapi(getCelebritiesRoute, (c) => getCelebrities(c));
  app.openapi(createCelebrityRoute, (c) => createCelebrity(c));
  app.openapi(createCelebritiesBatchRoute, (c) => createCelebritiesBatch(c));
  app.openapi(updateCelebrityRoute, (c) => updateCelebrity(c));
  app.openapi(deleteCelebrityRoute, (c) => deleteCelebrity(c));
  app.openapi(getCelebrityRequestsRoute, (c) => getCelebrityRequests(c));

  return app;
}
