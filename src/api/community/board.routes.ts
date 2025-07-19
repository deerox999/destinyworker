import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { boardApi } from './boardApi';
import { MiddlewareHandler } from "hono";
import { 
  BoardIdParamSchema, 
  BoardSchema, 
  BoardCategorySchema, 
  SuccessSchema 
} from "../../common/schemas";

export function createBoardRouter(): OpenAPIHono {
  const app = new OpenAPIHono();

  // 게시판 목록 조회 라우트
  const getBoardsRoute = createRoute({
    method: "get",
    path: "/",
    summary: "게시판 목록 조회",
    description: "활성화된 게시판 목록을 조회합니다.",
    tags: ["게시판"],
    responses: {
      200: {
        description: "성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              data: z.array(BoardSchema).openapi({ type: 'array' }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      500: { description: "서버 오류" },
    },
  });

  // 게시판별 카테고리 조회 라우트
  const getBoardCategoriesRoute = createRoute({
    method: "get",
    path: "/{id}/categories",
    summary: "게시판별 카테고리 조회",
    description: "특정 게시판의 활성화된 카테고리 목록을 조회합니다.",
    tags: ["게시판"],
    request: {
      params: BoardIdParamSchema,
    },
    responses: {
      200: {
        description: "성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              data: z.array(BoardCategorySchema).openapi({ type: 'array' }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      400: { description: "잘못된 게시판 ID" },
      500: { description: "서버 오류" },
    },
  });

  // 라우트 등록
  app.openapi(getBoardsRoute, (c) => boardApi.getBoards(c));
  app.openapi(getBoardCategoriesRoute, (c) => boardApi.getBoardCategories(c));

  return app;
} 