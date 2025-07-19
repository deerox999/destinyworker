import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
    CommentIdParamSchema,
    CommentSchema,
    CreateCommentSchema,
    SuccessSchema,
    UpdateCommentSchema
} from "../../common/schemas";
import { commentApi } from './commentApi';

export function createCommentRouter(): OpenAPIHono {
  const app = new OpenAPIHono();

  // 댓글 작성 라우트
  const createCommentRoute = createRoute({
    method: "post",
    path: "/",
    summary: "댓글 작성",
    description: "새로운 댓글을 작성합니다.",
    tags: ["댓글"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: CreateCommentSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: "생성 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              data: CommentSchema,
            }).openapi({ type: 'object' }),
          },
        },
      },
      400: { description: "잘못된 데이터 형식" },
      404: { description: "게시글 또는 부모 댓글을 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  // 댓글 수정 라우트
  const updateCommentRoute = createRoute({
    method: "put",
    path: "/{id}",
    summary: "댓글 수정",
    description: "기존 댓글을 수정합니다.",
    tags: ["댓글"],
    request: {
      params: CommentIdParamSchema,
      body: {
        content: {
          "application/json": {
            schema: UpdateCommentSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: "수정 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              data: CommentSchema,
            }).openapi({ type: 'object' }),
          },
        },
      },
      400: { description: "잘못된 데이터 형식 또는 ID" },
      403: { description: "권한 없음" },
      404: { description: "댓글을 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  // 댓글 삭제 라우트
  const deleteCommentRoute = createRoute({
    method: "delete",
    path: "/{id}",
    summary: "댓글 삭제",
    description: "댓글을 삭제합니다.",
    tags: ["댓글"],
    request: {
      params: CommentIdParamSchema,
    },
    responses: {
      200: {
        description: "삭제 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              message: z.string().openapi({ example: "댓글이 삭제되었습니다." }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      400: { description: "잘못된 댓글 ID" },
      403: { description: "권한 없음" },
      404: { description: "댓글을 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  // 댓글 추천/취소 라우트
  const toggleCommentLikeRoute = createRoute({
    method: "post",
    path: "/{id}/like",
    summary: "댓글 추천/취소",
    description: "댓글에 추천을 추가하거나 취소합니다.",
    tags: ["댓글"],
    request: {
      params: CommentIdParamSchema,
    },
    responses: {
      200: {
        description: "성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              data: z.object({
                liked: z.boolean().openapi({ example: true }),
              }).openapi({ type: 'object' }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      400: { description: "잘못된 댓글 ID" },
      500: { description: "서버 오류" },
    },
  });

  // 라우트 등록
  app.openapi(createCommentRoute, (c) => commentApi.createComment(c));
  app.openapi(updateCommentRoute, (c) => commentApi.updateComment(c));
  app.openapi(deleteCommentRoute, (c) => commentApi.deleteComment(c));
  app.openapi(toggleCommentLikeRoute, (c) => commentApi.toggleCommentLike(c));

  return app;
} 