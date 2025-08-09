import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { SuccessSchema } from "../../common/schemas";
import { userCommunityApi } from "./userCommunityApi";

export function createUserCommunityRouter(): OpenAPIHono {
  const app = new OpenAPIHono();

  // 커뮤니티 전체 데이터 조회
  const getCommunityDataRoute = createRoute({
    method: "get",
    path: "/",
    summary: "커뮤니티 전체 데이터 조회",
    description: "게시판, 카테고리, 최근 게시글을 한 번에 조회합니다.",
    tags: ["커뮤니티-사용자"],
    request: {
      query: z.object({
        language: z.enum(["ko", "en", "ja", "zh", "vi"]).openapi({
          param: { name: "language", in: "query" },
          description: "언어 코드",
          example: "ko",
        }),
      }),
    },
    responses: {
      200: {
        description: "성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              data: z
                .object({
                  boards: z
                    .array(
                      z.object({
                        id: z.number().int().openapi({ example: 1 }),
                        name: z.string().openapi({ example: "bug-report" }),
                        displayName: z
                          .string()
                          .openapi({ example: "버그 제보" }),
                        description: z
                          .string()
                          .nullable()
                          .openapi({ example: "버그를 제보하는 공간입니다." }),
                        isActive: z.boolean().openapi({ example: true }),
                        createdAt: z
                          .string()
                          .datetime()
                          .openapi({ example: "2023-01-01T00:00:00.000Z" }),
                        updatedAt: z
                          .string()
                          .datetime()
                          .openapi({ example: "2023-01-01T00:00:00.000Z" }),
                        categories: z
                          .array(
                            z.object({
                              id: z.number().int().openapi({ example: 1 }),
                              name: z
                                .string()
                                .openapi({ example: "치명적 버그" }),
                              sortOrder: z
                                .number()
                                .int()
                                .openapi({ example: 0 }),
                              isActive: z.boolean().openapi({ example: true }),
                            })
                          )
                          .openapi({ type: "array" }),
                        recentPosts: z
                          .array(
                            z.object({
                              id: z.number().int().openapi({ example: 1 }),
                              title: z
                                .string()
                                .openapi({ example: "버그 제보합니다" }),
                              authorName: z
                                .string()
                                .openapi({ example: "유람하는 방랑자" }),
                              isAnonymous: z
                                .boolean()
                                .openapi({ example: false }),
                              tags: z
                                .array(z.string())
                                .openapi({ example: ["버그", "중요"] }),
                              viewCount: z
                                .number()
                                .int()
                                .openapi({ example: 10 }),
                              likeCount: z
                                .number()
                                .int()
                                .openapi({ example: 5 }),
                              commentCount: z
                                .number()
                                .int()
                                .openapi({ example: 3 }),
                              createdAt: z
                                .string()
                                .datetime()
                                .openapi({
                                  example: "2023-01-01T00:00:00.000Z",
                                }),
                            })
                          )
                          .openapi({ type: "array" }),
                      })
                    )
                    .openapi({ type: "array" }),
                  recentPosts: z
                    .array(
                      z.object({
                        id: z.number().int().openapi({ example: 1 }),
                        boardId: z.number().int().openapi({ example: 1 }),
                        title: z
                          .string()
                          .openapi({ example: "버그 제보합니다" }),
                        authorName: z
                          .string()
                          .openapi({ example: "유람하는 방랑자" }),
                        isAnonymous: z.boolean().openapi({ example: false }),
                        tags: z
                          .array(z.string())
                          .openapi({ example: ["버그", "중요"] }),
                        viewCount: z.number().int().openapi({ example: 10 }),
                        likeCount: z.number().int().openapi({ example: 5 }),
                        commentCount: z.number().int().openapi({ example: 3 }),
                        createdAt: z
                          .string()
                          .datetime()
                          .openapi({ example: "2023-01-01T00:00:00.000Z" }),
                      })
                    )
                    .openapi({ type: "array" }),
                  popularPosts: z
                    .array(
                      z.object({
                        id: z.number().int().openapi({ example: 1 }),
                        boardId: z.number().int().openapi({ example: 1 }),
                        title: z.string().openapi({ example: "인기 게시글" }),
                        authorName: z
                          .string()
                          .openapi({ example: "유람하는 방랑자" }),
                        isAnonymous: z.boolean().openapi({ example: false }),
                        tags: z
                          .array(z.string())
                          .openapi({ example: ["인기", "추천"] }),
                        viewCount: z.number().int().openapi({ example: 50 }),
                        likeCount: z.number().int().openapi({ example: 20 }),
                        commentCount: z.number().int().openapi({ example: 10 }),
                        createdAt: z
                          .string()
                          .datetime()
                          .openapi({ example: "2023-01-01T00:00:00.000Z" }),
                      })
                    )
                    .openapi({ type: "array" }),
                })
                .openapi({ type: "object" }),
            }).openapi({ type: "object" }),
          },
        },
      },
      500: { description: "서버 오류" },
    },
  });

  // 게시판 목록 조회
  const getBoardsRoute = createRoute({
    method: "get",
    path: "/boards",
    summary: "게시판 목록 조회",
    description: "활성화된 게시판 목록을 조회합니다.",
    tags: ["커뮤니티-사용자"],
    request: {
      query: z.object({
        language: z.enum(["ko", "en", "ja", "zh", "vi"]).openapi({
          param: { name: "language", in: "query" },
          description: "언어 코드",
          example: "ko",
        }),
      }),
    },
    responses: {
      200: {
        description: "성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              data: z
                .array(
                  z.object({
                    id: z.number().int().openapi({ example: 1 }),
                    name: z.string().openapi({ example: "bug-report" }),
                    displayName: z.string().openapi({ example: "버그 제보" }),
                    description: z
                      .string()
                      .nullable()
                      .openapi({ example: "버그를 제보하는 공간입니다." }),
                    isActive: z.boolean().openapi({ example: true }),
                    createdAt: z
                      .string()
                      .datetime()
                      .openapi({ example: "2023-01-01T00:00:00.000Z" }),
                    updatedAt: z
                      .string()
                      .datetime()
                      .openapi({ example: "2023-01-01T00:00:00.000Z" }),
                  })
                )
                .openapi({ type: "array" }),
            }).openapi({ type: "object" }),
          },
        },
      },
      500: { description: "서버 오류" },
    },
  });

  // 특정 게시판 데이터 조회
  const getBoardDataRoute = createRoute({
    method: "get",
    path: "/boards/{boardId}",
    summary: "특정 게시판 데이터 조회",
    description: "특정 게시판의 정보, 카테고리, 게시글을 한 번에 조회합니다.",
    tags: ["커뮤니티-사용자"],
    request: {
      params: z.object({
        boardId: z.coerce
          .number()
          .int()
          .positive()
          .openapi({
            param: { name: "boardId", in: "path" },
            description: "게시판 ID",
            example: 1,
          }),
      }),
      query: z.object({
        language: z.enum(["ko", "en", "ja", "zh", "vi"]).openapi({
          param: { name: "language", in: "query" },
          description: "언어 코드",
          example: "ko",
        }),
        page: z.coerce
          .number()
          .int()
          .positive()
          .default(1)
          .optional()
          .openapi({
            param: { name: "page", in: "query" },
            description: "페이지 번호",
            example: 1,
          }),
        limit: z.coerce
          .number()
          .int()
          .positive()
          .default(10)
          .optional()
          .openapi({
            param: { name: "limit", in: "query" },
            description: "페이지당 항목 수",
            example: 10,
          }),
        categoryId: z
          .string()
          .optional()
          .openapi({
            param: { name: "categoryId", in: "query" },
            description: "카테고리 ID (숫자 또는 'all' - 모든 카테고리)",
            example: "1",
          }),
        sort: z
          .string()
          .optional()
          .openapi({
            param: { name: "sort", in: "query" },
            description: "정렬 기준 (newest/latest, oldest, popular, views)",
            example: "newest",
          }),
        search: z
          .string()
          .optional()
          .openapi({
            param: { name: "search", in: "query" },
            description: "검색어",
            example: "버그",
          }),
        tags: z
          .string()
          .optional()
          .openapi({
            param: { name: "tags", in: "query" },
            description: "태그 검색 (콤마로 구분)",
            example: "버그,중요",
          }),
      }),
    },
    responses: {
      200: {
        description: "성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              data: z
                .object({
                  board: z
                    .object({
                      id: z.number().int().openapi({ example: 1 }),
                      name: z.string().openapi({ example: "bug-report" }),
                      displayName: z.string().openapi({ example: "버그 제보" }),
                      description: z
                        .string()
                        .nullable()
                        .openapi({ example: "버그를 제보하는 공간입니다." }),
                      isActive: z.boolean().openapi({ example: true }),
                      createdAt: z
                        .string()
                        .datetime()
                        .openapi({ example: "2023-01-01T00:00:00.000Z" }),
                      updatedAt: z
                        .string()
                        .datetime()
                        .openapi({ example: "2023-01-01T00:00:00.000Z" }),
                    })
                    .openapi({ type: "object" }),
                  categories: z
                    .array(
                      z.object({
                        id: z.number().int().openapi({ example: 1 }),
                        name: z.string().openapi({ example: "치명적 버그" }),
                        sortOrder: z.number().int().openapi({ example: 0 }),
                        isActive: z.boolean().openapi({ example: true }),
                      })
                    )
                    .openapi({ type: "array" }),
                  posts: z
                    .array(
                      z.object({
                        id: z.number().int().openapi({ example: 1 }),
                        title: z
                          .string()
                          .openapi({ example: "버그 제보합니다" }),
                        authorName: z
                          .string()
                          .openapi({ example: "유람하는 방랑자" }),
                        isAnonymous: z.boolean().openapi({ example: false }),
                        tags: z
                          .array(z.string())
                          .openapi({ example: ["버그", "중요"] }),
                        viewCount: z.number().int().openapi({ example: 10 }),
                        likeCount: z.number().int().openapi({ example: 5 }),
                        commentCount: z.number().int().openapi({ example: 3 }),
                        createdAt: z
                          .string()
                          .datetime()
                          .openapi({ example: "2023-01-01T00:00:00.000Z" }),
                        category: z
                          .object({
                            id: z.number().int().openapi({ example: 1 }),
                            name: z
                              .string()
                              .openapi({ example: "치명적 버그" }),
                          })
                          .openapi({ type: "object" }),
                      })
                    )
                    .openapi({ type: "array" }),
                  pagination: z
                    .object({
                      page: z.number().int().openapi({ example: 1 }),
                      limit: z.number().int().openapi({ example: 10 }),
                      total: z.number().int().openapi({ example: 100 }),
                      totalPages: z.number().int().openapi({ example: 10 }),
                      hasNext: z.boolean().openapi({ example: true }),
                      hasPrev: z.boolean().openapi({ example: false }),
                    })
                    .openapi({ type: "object" }),
                })
                .openapi({ type: "object" }),
            }).openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 게시판 ID" },
      404: { description: "게시판을 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  // 게시글 목록 조회
  const getPostsRoute = createRoute({
    method: "get",
    path: "/posts",
    summary: "게시글 목록 조회",
    description: "게시글 목록을 필터링, 정렬, 페이지네이션하여 조회합니다.",
    tags: ["커뮤니티-사용자"],
    request: {
      query: z.object({
        language: z.enum(["ko", "en", "ja", "zh", "vi"]).openapi({
          param: { name: "language", in: "query" },
          description: "언어 코드",
          example: "ko",
        }),
        page: z.coerce
          .number()
          .int()
          .positive()
          .default(1)
          .optional()
          .openapi({
            param: { name: "page", in: "query" },
            description: "페이지 번호",
            example: 1,
          }),
        limit: z.coerce
          .number()
          .int()
          .positive()
          .default(20)
          .optional()
          .openapi({
            param: { name: "limit", in: "query" },
            description: "페이지당 항목 수",
            example: 20,
          }),
        boardId: z.coerce
          .number()
          .int()
          .positive()
          .optional()
          .openapi({
            param: { name: "boardId", in: "query" },
            description: "게시판 ID",
            example: 1,
          }),
        categoryId: z.coerce
          .number()
          .int()
          .positive()
          .optional()
          .openapi({
            param: { name: "categoryId", in: "query" },
            description: "카테고리 ID",
            example: 1,
          }),
        search: z
          .string()
          .optional()
          .openapi({
            param: { name: "search", in: "query" },
            description: "검색어",
            example: "버그",
          }),
        tags: z
          .string()
          .optional()
          .openapi({
            param: { name: "tags", in: "query" },
            description: "태그 검색 (콤마로 구분)",
            example: "버그,중요",
          }),
        sort: z
          .string()
          .optional()
          .openapi({
            param: { name: "sort", in: "query" },
            description: "정렬 기준 (newest, oldest, popular, views)",
            example: "newest",
          }),
      }),
    },
    responses: {
      200: {
        description: "성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              data: z
                .object({
                  posts: z
                    .array(
                      z.object({
                        id: z.number().int().openapi({ example: 1 }),
                        title: z
                          .string()
                          .openapi({ example: "버그 제보합니다" }),
                        content: z
                          .string()
                          .openapi({ example: "게시글 내용..." }),
                        authorName: z.string().nullable().openapi({ example: "유람하는 방랑자" }),
                        isAnonymous: z.boolean().openapi({ example: false }),
                        tags: z
                          .array(z.string())
                          .openapi({ example: ["버그", "중요"] }),
                        viewCount: z.number().int().openapi({ example: 10 }),
                        likeCount: z.number().int().openapi({ example: 5 }),
                        commentCount: z.number().int().openapi({ example: 3 }),
                        createdAt: z
                          .string()
                          .datetime()
                          .openapi({ example: "2023-01-01T00:00:00.000Z" }),
                        updatedAt: z
                          .string()
                          .datetime()
                          .openapi({ example: "2023-01-01T00:00:00.000Z" }),
                        board: z
                          .object({
                            id: z.number().int().openapi({ example: 1 }),
                            name: z.string().openapi({ example: "bug-report" }),
                            displayName: z
                              .string()
                              .openapi({ example: "버그 제보" }),
                          })
                          .openapi({ type: "object" }),
                        category: z
                          .object({
                            id: z.number().int().openapi({ example: 1 }),
                            name: z
                              .string()
                              .openapi({ example: "치명적 버그" }),
                          })
                          .openapi({ type: "object" }),
                      })
                    )
                    .openapi({ type: "array" }),
                  pagination: z
                    .object({
                      page: z.number().int().openapi({ example: 1 }),
                      limit: z.number().int().openapi({ example: 20 }),
                      total: z.number().int().openapi({ example: 100 }),
                      totalPages: z.number().int().openapi({ example: 5 }),
                    })
                    .openapi({ type: "object" }),
                })
                .openapi({ type: "object" }),
            }).openapi({ type: "object" }),
          },
        },
      },
      500: { description: "서버 오류" },
    },
  });

  // 게시글 상세 조회
  const getPostRoute = createRoute({
    method: "get",
    path: "/posts/{id}",
    summary: "게시글 상세 조회",
    description: "특정 게시글의 상세 정보를 조회하고 조회수를 증가시킵니다.",
    tags: ["커뮤니티-사용자"],
    request: {
      params: z.object({
        id: z.coerce
          .number()
          .int()
          .positive()
          .openapi({
            param: { name: "id", in: "path" },
            description: "게시글 ID",
            example: 1,
          }),
      }),
      query: z.object({
        language: z.enum(["ko", "en", "ja", "zh", "vi"]).openapi({
          param: { name: "language", in: "query" },
          description: "언어 코드",
          example: "ko",
        }),
      }),
    },
    responses: {
      200: {
        description: "성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              data: z
                .object({
                  id: z.number().int().openapi({ example: 1 }),
                  title: z.string().openapi({ example: "버그 제보합니다" }),
                  content: z.string().openapi({ example: "게시글 내용..." }),
                  authorName: z.string().nullable().openapi({ example: "유람하는 방랑자" }),
                  isAnonymous: z.boolean().openapi({ example: false }),
                  tags: z
                    .array(z.string())
                    .openapi({ example: ["버그", "중요"] }),
                  viewCount: z.number().int().openapi({ example: 10 }),
                  likeCount: z.number().int().openapi({ example: 5 }),
                  commentCount: z.number().int().openapi({ example: 3 }),
                  isLiked: z.boolean().openapi({ example: false }),
                  createdAt: z
                    .string()
                    .datetime()
                    .openapi({ example: "2023-01-01T00:00:00.000Z" }),
                  updatedAt: z
                    .string()
                    .datetime()
                    .openapi({ example: "2023-01-01T00:00:00.000Z" }),
                  board: z
                    .object({
                      id: z.number().int().openapi({ example: 1 }),
                      name: z.string().openapi({ example: "bug-report" }),
                      displayName: z.string().openapi({ example: "버그 제보" }),
                    })
                    .openapi({ type: "object" }),
                  category: z
                    .object({
                      id: z.number().int().openapi({ example: 1 }),
                      name: z.string().openapi({ example: "치명적 버그" }),
                    })
                    .openapi({ type: "object" }),
                })
                .openapi({ type: "object" }),
            }).openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 게시글 ID" },
      404: { description: "게시글을 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  // 게시글 작성
  const createPostRoute = createRoute({
    method: "post",
    path: "/posts",
    summary: "게시글 작성",
    description: "새로운 게시글을 작성합니다.",
    tags: ["커뮤니티-사용자"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                language: z.enum(["ko", "en", "ja", "zh", "vi"]).openapi({ example: "ko" }),
                title: z
                  .string()
                  .min(1)
                  .max(200)
                  .openapi({ example: "버그 제보합니다" }),
                content: z
                  .string()
                  .min(1)
                  .max(5000000)
                  .openapi({ example: "게시글 내용..." }),
                boardId: z.number().int().positive().openapi({ example: 1 }),
                categoryId: z
                  .number()
                  .int()
                  .positive()
                  .optional()
                  .openapi({ example: 1 }),
                tags: z
                  .array(z.string())
                  .optional()
                  .openapi({ example: ["버그", "중요"] }),
              })
              .openapi({ type: "object" }),
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
              data: z
                .object({
                  id: z.number().int().openapi({ example: 1 }),
                  title: z.string().openapi({ example: "버그 제보합니다" }),
                  content: z.string().openapi({ example: "게시글 내용..." }),
                  authorName: z
                    .string()
                    .openapi({ example: "유람하는 방랑자" }),
                  isAnonymous: z.boolean().openapi({ example: false }),
                  tags: z
                    .array(z.string())
                    .openapi({ example: ["버그", "중요"] }),
                  createdAt: z
                    .string()
                    .datetime()
                    .openapi({ example: "2023-01-01T00:00:00.000Z" }),
                })
                .openapi({ type: "object" }),
            }).openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 데이터 형식" },
      500: { description: "서버 오류" },
    },
  });

  // 게시글 수정
  const updatePostRoute = createRoute({
    method: "put",
    path: "/posts/{id}",
    summary: "게시글 수정",
    description: "기존 게시글을 수정합니다.",
    tags: ["커뮤니티-사용자"],
    request: {
      params: z.object({
        id: z.coerce
          .number()
          .int()
          .positive()
          .openapi({
            param: { name: "id", in: "path" },
            description: "게시글 ID",
            example: 1,
          }),
      }),
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                title: z
                  .string()
                  .min(1)
                  .max(200)
                  .optional()
                  .openapi({ example: "버그 제보합니다" }),
                content: z
                  .string()
                  .min(1)
                  .max(5000000)
                  .optional()
                  .openapi({ example: "게시글 내용..." }),
                categoryId: z
                  .number()
                  .int()
                  .positive()
                  .optional()
                  .openapi({ example: 1 }),
                tags: z
                  .array(z.string())
                  .optional()
                  .openapi({ example: ["버그", "중요"] }),
              })
              .openapi({ type: "object" }),
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
              data: z
                .object({
                  id: z.number().int().openapi({ example: 1 }),
                  title: z.string().openapi({ example: "버그 제보합니다" }),
                  content: z.string().openapi({ example: "게시글 내용..." }),
                  tags: z
                    .array(z.string())
                    .openapi({ example: ["버그", "중요"] }),
                  updatedAt: z
                    .string()
                    .datetime()
                    .openapi({ example: "2023-01-01T00:00:00.000Z" }),
                })
                .openapi({ type: "object" }),
            }).openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 데이터 형식 또는 ID" },
      403: { description: "권한 없음" },
      404: { description: "게시글을 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  // 게시글 삭제
  const deletePostRoute = createRoute({
    method: "delete",
    path: "/posts/{id}",
    summary: "게시글 삭제",
    description: "게시글을 삭제합니다. (물리적 삭제가 아닌 비활성화)",
    tags: ["커뮤니티-사용자"],
    request: {
      params: z.object({
        id: z.coerce
          .number()
          .int()
          .positive()
          .openapi({
            param: { name: "id", in: "path" },
            description: "게시글 ID",
            example: 1,
          }),
      }),
      query: z.object({
        language: z.enum(["ko", "en", "ja", "zh", "vi"]).openapi({
          param: { name: "language", in: "query" },
          description: "언어 코드",
          example: "ko",
        }),
      }),
    },
    responses: {
      200: {
        description: "삭제 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              message: z
                .string()
                .openapi({ example: "게시글이 삭제되었습니다." }),
            }).openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 게시글 ID 또는 비밀번호" },
      403: { description: "권한 없음" },
      404: { description: "게시글을 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  // 게시글 추천/취소
  const togglePostLikeRoute = createRoute({
    method: "post",
    path: "/posts/{id}/like",
    summary: "게시글 추천/취소",
    description: "게시글에 추천을 추가하거나 취소합니다.",
    tags: ["커뮤니티-사용자"],
    request: {
      params: z.object({
        id: z.coerce
          .number()
          .int()
          .positive()
          .openapi({
            param: { name: "id", in: "path" },
            description: "게시글 ID",
            example: 1,
          }),
      }),
    },
    responses: {
      200: {
        description: "성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              data: z
                .object({
                  liked: z.boolean().openapi({ example: true }),
                })
                .openapi({ type: "object" }),
            }).openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 게시글 ID" },
      500: { description: "서버 오류" },
    },
  });

  // 게시글 댓글 목록
  const getPostCommentsRoute = createRoute({
    method: "get",
    path: "/posts/{id}/comments",
    summary: "게시글 댓글 목록",
    description: "특정 게시글의 댓글 목록을 조회합니다.",
    tags: ["커뮤니티-사용자"],
    request: {
      params: z.object({
        id: z.coerce
          .number()
          .int()
          .positive()
          .openapi({
            param: { name: "id", in: "path" },
            description: "게시글 ID",
            example: 1,
          }),
      }),
      query: z.object({
        language: z.enum(["ko", "en", "ja", "zh", "vi"]).openapi({
          param: { name: "language", in: "query" },
          description: "언어 코드",
          example: "ko",
        }),
        page: z.coerce
          .number()
          .int()
          .positive()
          .default(1)
          .optional()
          .openapi({
            param: { name: "page", in: "query" },
            description: "페이지 번호",
            example: 1,
          }),
        limit: z.coerce
          .number()
          .int()
          .positive()
          .default(50)
          .optional()
          .openapi({
            param: { name: "limit", in: "query" },
            description: "페이지당 항목 수",
            example: 50,
          }),
      }),
    },
    responses: {
      200: {
        description: "성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              data: z
                .object({
                  comments: z
                    .array(
                      z.object({
                        id: z.number().int().openapi({ example: 1 }),
                        content: z.string().openapi({ example: "댓글 내용" }),
                        authorName: z
                          .string()
                          .openapi({ example: "댓글 작성자" }),
                        authorImage: z.string().nullable().openapi({ example: "https://example.com/user-profile.jpg" }),
                        isAnonymous: z.boolean().openapi({ example: false }),
                        likeCount: z.number().int().openapi({ example: 2 }),
                        isLiked: z.boolean().openapi({ example: false }),
                        createdAt: z
                          .string()
                          .datetime()
                          .openapi({ example: "2023-01-01T00:00:00.000Z" }),
                        parentId: z
                          .number()
                          .int()
                          .nullable()
                          .openapi({ example: null }),
                      })
                    )
                    .openapi({ type: "array" }),
                  pagination: z
                    .object({
                      page: z.number().int().openapi({ example: 1 }),
                      limit: z.number().int().openapi({ example: 50 }),
                      total: z.number().int().openapi({ example: 10 }),
                      totalPages: z.number().int().openapi({ example: 1 }),
                    })
                    .openapi({ type: "object" }),
                })
                .openapi({ type: "object" }),
            }).openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 게시글 ID" },
      500: { description: "서버 오류" },
    },
  });

  // 댓글 작성
  const createCommentRoute = createRoute({
    method: "post",
    path: "/posts/{postId}/comments",
    summary: "댓글 작성",
    description: "새로운 댓글을 작성합니다.",
    tags: ["커뮤니티-사용자"],
    request: {
      params: z.object({
        postId: z.coerce
          .number()
          .int()
          .positive()
          .openapi({
            param: { name: "postId", in: "path" },
            description: "게시글 ID",
            example: 1,
          }),
      }),
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                content: z
                  .string()
                  .min(1)
                  .max(100000)
                  .openapi({ example: "댓글 내용" }),
                parentId: z
                  .number()
                  .int()
                  .positive()
                  .optional()
                  .openapi({ example: 1 }),
              })
              .openapi({ type: "object" }),
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
              data: z
                .object({
                  id: z.number().int().openapi({ example: 1 }),
                  content: z.string().openapi({ example: "댓글 내용" }),
                  authorName: z.string().openapi({ example: "댓글 작성자" }),
                  authorImage: z.string().nullable().openapi({ example: "https://example.com/user-profile.jpg" }),
                  isAnonymous: z.boolean().openapi({ example: false }),
                  createdAt: z
                    .string()
                    .datetime()
                    .openapi({ example: "2023-01-01T00:00:00.000Z" }),
                })
                .openapi({ type: "object" }),
            }).openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 데이터 형식" },
      404: { description: "게시글 또는 부모 댓글을 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  // 댓글 수정
  const updateCommentRoute = createRoute({
    method: "put",
    path: "/comments/{id}",
    summary: "댓글 수정",
    description: "기존 댓글을 수정합니다.",
    tags: ["커뮤니티-사용자"],
    request: {
      params: z.object({
        id: z.coerce
          .number()
          .int()
          .positive()
          .openapi({
            param: { name: "id", in: "path" },
            description: "댓글 ID",
            example: 1,
          }),
      }),
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                content: z
                  .string()
                  .min(1)
                  .max(100000)
                  .openapi({ example: "댓글 내용" }),
              })
              .openapi({ type: "object" }),
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
              data: z
                .object({
                  id: z.number().int().openapi({ example: 1 }),
                  content: z.string().openapi({ example: "댓글 내용" }),
                  updatedAt: z
                    .string()
                    .datetime()
                    .openapi({ example: "2023-01-01T00:00:00.000Z" }),
                })
                .openapi({ type: "object" }),
            }).openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 데이터 형식 또는 ID" },
      403: { description: "권한 없음" },
      404: { description: "댓글을 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  // 댓글 삭제
  const deleteCommentRoute = createRoute({
    method: "delete",
    path: "/comments/{id}",
    summary: "댓글 삭제",
    description: "댓글을 삭제합니다.",
    tags: ["커뮤니티-사용자"],
    request: {
      params: z.object({
        id: z.coerce
          .number()
          .int()
          .positive()
          .openapi({
            param: { name: "id", in: "path" },
            description: "댓글 ID",
            example: 1,
          }),
      }),
      query: z.object({
        password: z
          .string()
          .min(4)
          .max(20)
          .optional()
          .openapi({
            param: { name: "password", in: "query" },
            description: "익명 댓글 삭제 시 필요한 비밀번호",
            example: "1234",
          }),
      }),
    },
    responses: {
      200: {
        description: "삭제 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              message: z
                .string()
                .openapi({ example: "댓글이 삭제되었습니다." }),
            }).openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 댓글 ID 또는 비밀번호" },
      403: { description: "권한 없음" },
      404: { description: "댓글을 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  // 댓글 추천/취소
  const toggleCommentLikeRoute = createRoute({
    method: "post",
    path: "/comments/{id}/like",
    summary: "댓글 추천/취소",
    description: "댓글에 추천을 추가하거나 취소합니다.",
    tags: ["커뮤니티-사용자"],
    request: {
      params: z.object({
        id: z.coerce
          .number()
          .int()
          .positive()
          .openapi({
            param: { name: "id", in: "path" },
            description: "댓글 ID",
            example: 1,
          }),
      }),
    },
    responses: {
      200: {
        description: "성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              data: z
                .object({
                  liked: z.boolean().openapi({ example: true }),
                })
                .openapi({ type: "object" }),
            }).openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 댓글 ID" },
      500: { description: "서버 오류" },
    },
  });

  // 라우트 등록
  app.openapi(getCommunityDataRoute, userCommunityApi.getCommunityData);
  app.openapi(getBoardsRoute, userCommunityApi.getBoards);
  app.openapi(getBoardDataRoute, userCommunityApi.getBoardData);
  app.openapi(getPostsRoute, userCommunityApi.getPosts);
  app.openapi(getPostRoute, userCommunityApi.getPost);
  app.openapi(createPostRoute, userCommunityApi.createPost);
  app.openapi(updatePostRoute, userCommunityApi.updatePost);
  app.openapi(deletePostRoute, userCommunityApi.deletePost);
  app.openapi(togglePostLikeRoute, userCommunityApi.togglePostLike);
  app.openapi(getPostCommentsRoute, userCommunityApi.getPostComments);
  app.openapi(createCommentRoute, userCommunityApi.createComment);
  app.openapi(updateCommentRoute, userCommunityApi.updateComment);
  app.openapi(deleteCommentRoute, userCommunityApi.deleteComment);
  app.openapi(toggleCommentLikeRoute, userCommunityApi.toggleCommentLike);
  return app;
}
