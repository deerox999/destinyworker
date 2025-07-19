import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
    CommentQuerySchema,
    CommentSchema,
    CreatePostSchema,
    PostIdParamSchema,
    PostQuerySchema,
    PostSchema,
    SuccessSchema,
    UpdatePostSchema
} from "../../common/schemas";
import { postApi } from './postApi';

export function createPostRouter(): OpenAPIHono {
  const app = new OpenAPIHono();

  // 게시글 목록 조회 라우트
  const getPostsRoute = createRoute({
    method: "get",
    path: "/",
    summary: "게시글 목록 조회",
    description: "게시글 목록을 필터링, 정렬, 페이지네이션하여 조회합니다.",
    tags: ["게시글"],
    request: {
      query: PostQuerySchema,
    },
    responses: {
      200: {
        description: "성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              data: z.object({
                posts: z.array(PostSchema).openapi({ type: 'array' }),
                pagination: z.object({
                  page: z.number().int().openapi({ example: 1 }),
                  limit: z.number().int().openapi({ example: 20 }),
                  total: z.number().int().openapi({ example: 100 }),
                  totalPages: z.number().int().openapi({ example: 5 }),
                }).openapi({ type: 'object' }),
              }).openapi({ type: 'object' }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      500: { description: "서버 오류" },
    },
  });

  // 게시글 상세 조회 라우트
  const getPostRoute = createRoute({
    method: "get",
    path: "/{id}",
    summary: "게시글 상세 조회",
    description: "특정 게시글의 상세 정보를 조회하고 조회수를 증가시킵니다.",
    tags: ["게시글"],
    request: {
      params: PostIdParamSchema,
    },
    responses: {
      200: {
        description: "성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              data: PostSchema,
            }).openapi({ type: 'object' }),
          },
        },
      },
      400: { description: "잘못된 게시글 ID" },
      404: { description: "게시글을 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  // 게시글 작성 라우트
  const createPostRoute = createRoute({
    method: "post",
    path: "/",
    summary: "게시글 작성",
    description: "새로운 게시글을 작성합니다.",
    tags: ["게시글"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: CreatePostSchema,
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
              data: PostSchema,
            }).openapi({ type: 'object' }),
          },
        },
      },
      400: { description: "잘못된 데이터 형식" },
      500: { description: "서버 오류" },
    },
  });

  // 게시글 수정 라우트
  const updatePostRoute = createRoute({
    method: "put",
    path: "/{id}",
    summary: "게시글 수정",
    description: "기존 게시글을 수정합니다.",
    tags: ["게시글"],
    request: {
      params: PostIdParamSchema,
      body: {
        content: {
          "application/json": {
            schema: UpdatePostSchema,
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
              data: PostSchema,
            }).openapi({ type: 'object' }),
          },
        },
      },
      400: { description: "잘못된 데이터 형식 또는 ID" },
      403: { description: "권한 없음" },
      404: { description: "게시글을 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  // 게시글 삭제 라우트
  const deletePostRoute = createRoute({
    method: "delete",
    path: "/{id}",
    summary: "게시글 삭제",
    description: "게시글을 삭제합니다.",
    tags: ["게시글"],
    request: {
      params: PostIdParamSchema,
    },
    responses: {
      200: {
        description: "삭제 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              message: z.string().openapi({ example: "게시글이 삭제되었습니다." }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      400: { description: "잘못된 게시글 ID" },
      403: { description: "권한 없음" },
      404: { description: "게시글을 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  // 게시글 추천/취소 라우트
  const togglePostLikeRoute = createRoute({
    method: "post",
    path: "/{id}/like",
    summary: "게시글 추천/취소",
    description: "게시글에 추천을 추가하거나 취소합니다.",
    tags: ["게시글"],
    request: {
      params: PostIdParamSchema,
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
      400: { description: "잘못된 게시글 ID" },
      500: { description: "서버 오류" },
    },
  });

  // 게시글 댓글 목록 라우트
  const getPostCommentsRoute = createRoute({
    method: "get",
    path: "/{id}/comments",
    summary: "게시글 댓글 목록",
    description: "특정 게시글의 댓글 목록을 조회합니다.",
    tags: ["게시글"],
    request: {
      params: PostIdParamSchema,
      query: CommentQuerySchema,
    },
    responses: {
      200: {
        description: "성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              data: z.object({
                comments: z.array(CommentSchema).openapi({ type: 'array' }),
                pagination: z.object({
                  page: z.number().int().openapi({ example: 1 }),
                  limit: z.number().int().openapi({ example: 50 }),
                  total: z.number().int().openapi({ example: 10 }),
                  totalPages: z.number().int().openapi({ example: 1 }),
                }).openapi({ type: 'object' }),
              }).openapi({ type: 'object' }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      400: { description: "잘못된 게시글 ID" },
      500: { description: "서버 오류" },
    },
  });

  // 라우트 등록
  app.openapi(getPostsRoute, (c) => postApi.getPosts(c));
  app.openapi(getPostRoute, (c) => postApi.getPost(c));
  app.openapi(createPostRoute, (c) => postApi.createPost(c));
  app.openapi(updatePostRoute, (c) => postApi.updatePost(c));
  app.openapi(deletePostRoute, (c) => postApi.deletePost(c));
  app.openapi(togglePostLikeRoute, (c) => postApi.togglePostLike(c));
  app.openapi(getPostCommentsRoute, (c) => postApi.getPostComments(c));

  return app;
} 