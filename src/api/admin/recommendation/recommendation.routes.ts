import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { MiddlewareHandler } from "hono";
import {
  createRecommendation,
  deleteRecommendation,
  getRecommendation,
  getRecommendations,
  RecommendationInputSchema,
  RecommendationSchema,
  UpdateRecommendationSchema,
  updateRecommendation,
} from "./recommendation";

const RecommendationIdParamSchema = z.object({
  id: z.string().min(1).openapi({
    param: { name: "id", in: "path" },
    description: "추천 상품 ID",
    example: "charm-points",
  }),
});

const SuccessRecommendationSchema = z
  .object({
    success: z.boolean(),
    recommendation: RecommendationSchema,
  })
  .openapi({ type: "object" });

export function createRecommendationAdminRouter(
  authMiddleware: MiddlewareHandler
): OpenAPIHono {
  const app = new OpenAPIHono();
  app.use(authMiddleware);

  const listRoute = createRoute({
    method: "get",
    path: "/",
    summary: "[Admin] 추천 상품 목록 조회",
    tags: ["Admin-추천 상품"],
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        description: "조회 성공",
        content: {
          "application/json": {
            schema: z
              .object({
                success: z.boolean(),
                recommendations: z.array(RecommendationSchema),
              })
              .openapi({ type: "object" }),
          },
        },
      },
      403: { description: "관리자 권한이 필요합니다." },
    },
  });

  const getRoute = createRoute({
    method: "get",
    path: "/{id}",
    summary: "[Admin] 추천 상품 단건 조회",
    tags: ["Admin-추천 상품"],
    security: [{ BearerAuth: [] }],
    request: { params: RecommendationIdParamSchema },
    responses: {
      200: {
        description: "조회 성공",
        content: {
          "application/json": { schema: SuccessRecommendationSchema },
        },
      },
      403: { description: "관리자 권한이 필요합니다." },
      404: { description: "추천 상품을 찾을 수 없습니다." },
    },
  });

  const createRouteDefinition = createRoute({
    method: "post",
    path: "/",
    summary: "[Admin] 추천 상품 등록",
    description:
      "배너/갤러리 이미지는 프론트엔드에서 R2 업로드 후 전달한 URL을 저장합니다.",
    tags: ["Admin-추천 상품"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": { schema: RecommendationInputSchema },
        },
      },
    },
    responses: {
      201: {
        description: "등록 성공",
        content: {
          "application/json": { schema: SuccessRecommendationSchema },
        },
      },
      400: { description: "잘못된 요청 데이터" },
      403: { description: "관리자 권한이 필요합니다." },
    },
  });

  const updateRoute = createRoute({
    method: "put",
    path: "/{id}",
    summary: "[Admin] 추천 상품 수정",
    description: "전달된 필드만 수정합니다.",
    tags: ["Admin-추천 상품"],
    security: [{ BearerAuth: [] }],
    request: {
      params: RecommendationIdParamSchema,
      body: {
        content: {
          "application/json": { schema: UpdateRecommendationSchema },
        },
      },
    },
    responses: {
      200: {
        description: "수정 성공",
        content: {
          "application/json": { schema: SuccessRecommendationSchema },
        },
      },
      400: { description: "잘못된 요청 데이터" },
      403: { description: "관리자 권한이 필요합니다." },
      404: { description: "추천 상품을 찾을 수 없습니다." },
    },
  });

  const deleteRoute = createRoute({
    method: "delete",
    path: "/{id}",
    summary: "[Admin] 추천 상품 삭제",
    tags: ["Admin-추천 상품"],
    security: [{ BearerAuth: [] }],
    request: { params: RecommendationIdParamSchema },
    responses: {
      200: {
        description: "삭제 성공",
        content: {
          "application/json": {
            schema: z
              .object({ success: z.boolean(), message: z.string() })
              .openapi({ type: "object" }),
          },
        },
      },
      403: { description: "관리자 권한이 필요합니다." },
      404: { description: "추천 상품을 찾을 수 없습니다." },
    },
  });

  app.openapi(listRoute, (c) => getRecommendations(c));
  app.openapi(getRoute, (c) => getRecommendation(c));
  app.openapi(createRouteDefinition, (c) => createRecommendation(c));
  app.openapi(updateRoute, (c) => updateRecommendation(c));
  app.openapi(deleteRoute, (c) => deleteRecommendation(c));

  return app;
}
