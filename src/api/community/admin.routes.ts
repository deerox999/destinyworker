import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { SuccessSchema } from "../../common/schemas";
import { adminCommunityApi } from "./adminCommunityApi";

export function createAdminCommunityRouter(): OpenAPIHono {
  const app = new OpenAPIHono();

  // 게시판 목록 조회 (관리자용 - 전체)
  const getBoardsRoute = createRoute({
    method: "get",
    path: "/boards",
    summary: "게시판 목록 조회 (관리자용)",
    description: "모든 게시판 목록을 조회합니다. (활성/비활성 포함)",
    tags: ["커뮤니티-관리자"],
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
                    sortOrder: z.number().int().openapi({ example: 0 }),
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

  // 게시판 생성
  const createBoardRoute = createRoute({
    method: "post",
    path: "/boards",
    summary: "게시판 생성",
    description: "새로운 게시판을 생성합니다.",
    tags: ["커뮤니티-관리자"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                items: z.array(z.object({
                  language: z.enum(["ko", "en", "ja", "zh", "vi"]).openapi({ example: "ko" }),
                  name: z.string().min(1).max(50).openapi({ example: "bug-report" }),
                  displayName: z.string().min(1).max(100).openapi({ example: "버그 제보" }),
                  description: z.string().max(500).optional().openapi({ example: "버그를 제보하는 공간입니다." }),
                  sortOrder: z.number().int().default(0).openapi({ example: 0 }),
                  isActive: z.boolean().default(true).openapi({ example: true }),
                }))
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
                  name: z.string().openapi({ example: "bug-report" }),
                  displayName: z.string().openapi({ example: "버그 제보" }),
                  description: z
                    .string()
                    .nullable()
                    .openapi({ example: "버그를 제보하는 공간입니다." }),
                  sortOrder: z.number().int().openapi({ example: 0 }),
                  isActive: z.boolean().openapi({ example: true }),
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
      409: { description: "이미 존재하는 게시판명" },
      500: { description: "서버 오류" },
    },
  });

  // 게시판 수정
  const updateBoardRoute = createRoute({
    method: "put",
    path: "/boards/{boardId}",
    summary: "게시판 수정",
    description: "기존 게시판을 수정합니다.",
    tags: ["커뮤니티-관리자"],
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
      }),
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                displayName: z
                  .string()
                  .min(1)
                  .max(100)
                  .optional()
                  .openapi({ example: "버그 제보" }),
                description: z
                  .string()
                  .max(500)
                  .optional()
                  .openapi({ example: "버그를 제보하는 공간입니다." }),
                sortOrder: z.number().int().optional().openapi({ example: 0 }),
                isActive: z.boolean().optional().openapi({ example: true }),
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
                  name: z.string().openapi({ example: "bug-report" }),
                  displayName: z.string().openapi({ example: "버그 제보" }),
                  description: z
                    .string()
                    .nullable()
                    .openapi({ example: "버그를 제보하는 공간입니다." }),
                  sortOrder: z.number().int().openapi({ example: 0 }),
                  isActive: z.boolean().openapi({ example: true }),
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
      404: { description: "게시판을 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  // 게시판 삭제
  const deleteBoardRoute = createRoute({
    method: "delete",
    path: "/boards/{boardId}",
    summary: "게시판 삭제",
    description: "게시판을 삭제합니다. (물리적 삭제가 아닌 비활성화)",
    tags: ["커뮤니티-관리자"],
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
                .openapi({ example: "게시판이 삭제되었습니다." }),
            }).openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 게시판 ID" },
      404: { description: "게시판을 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  // 게시판별 카테고리 목록 조회
  const getBoardCategoriesRoute = createRoute({
    method: "get",
    path: "/boards/{boardId}/categories",
    summary: "게시판별 카테고리 목록 조회",
    description:
      "특정 게시판의 모든 카테고리 목록을 조회합니다. (활성/비활성 포함)",
    tags: ["커뮤니티-관리자"],
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
                    name: z.string().openapi({ example: "치명적 버그" }),
                    sortOrder: z.number().int().openapi({ example: 0 }),
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
      400: { description: "잘못된 게시판 ID" },
      404: { description: "게시판을 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  // 카테고리 생성
  const createCategoryRoute = createRoute({
    method: "post",
    path: "/boards/{boardId}/categories",
    summary: "카테고리 생성",
    description: "새로운 카테고리를 생성합니다.",
    tags: ["커뮤니티-관리자"],
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
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                items: z.array(z.object({
                  language: z.enum(["ko", "en", "ja", "zh", "vi"]).openapi({ example: "ko" }),
                  name: z.string().min(1).max(100).openapi({ example: "치명적 버그" }),
                  sortOrder: z.number().int().default(0).openapi({ example: 0 }),
                  isActive: z.boolean().default(true).openapi({ example: true }),
                }))
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
                  name: z.string().openapi({ example: "치명적 버그" }),
                  sortOrder: z.number().int().openapi({ example: 0 }),
                  isActive: z.boolean().openapi({ example: true }),
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
      404: { description: "게시판을 찾을 수 없음" },
      409: { description: "이미 존재하는 카테고리명" },
      500: { description: "서버 오류" },
    },
  });

  // 카테고리 수정
  const updateCategoryRoute = createRoute({
    method: "put",
    path: "/categories/{categoryId}",
    summary: "카테고리 수정",
    description: "기존 카테고리를 수정합니다.",
    tags: ["커뮤니티-관리자"],
    request: {
      params: z.object({
        categoryId: z.coerce
          .number()
          .int()
          .positive()
          .openapi({
            param: { name: "categoryId", in: "path" },
            description: "카테고리 ID",
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
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                name: z
                  .string()
                  .min(1)
                  .max(100)
                  .optional()
                  .openapi({ example: "치명적 버그" }),
                sortOrder: z.number().int().optional().openapi({ example: 0 }),
                isActive: z.boolean().optional().openapi({ example: true }),
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
                  name: z.string().openapi({ example: "치명적 버그" }),
                  sortOrder: z.number().int().openapi({ example: 0 }),
                  isActive: z.boolean().openapi({ example: true }),
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
      404: { description: "카테고리를 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  // 카테고리 삭제
  const deleteCategoryRoute = createRoute({
    method: "delete",
    path: "/categories/{categoryId}",
    summary: "카테고리 삭제",
    description: "카테고리를 삭제합니다. (물리적 삭제가 아닌 비활성화)",
    tags: ["커뮤니티-관리자"],
    request: {
      params: z.object({
        categoryId: z.coerce
          .number()
          .int()
          .positive()
          .openapi({
            param: { name: "categoryId", in: "path" },
            description: "카테고리 ID",
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
                .openapi({ example: "카테고리가 삭제되었습니다." }),
            }).openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 카테고리 ID" },
      404: { description: "카테고리를 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  // 샘플 데이터 생성
  const createSampleDataRoute = createRoute({
    method: "post",
    path: "/sample-data",
    summary: "샘플 데이터 생성",
    description: "테스트용 게시판과 카테고리 샘플 데이터를 생성합니다.",
    tags: ["커뮤니티-관리자"],
    responses: {
      201: {
        description: "생성 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              data: z
                .object({
                  message: z.string().openapi({ example: "샘플 데이터가 생성되었습니다." }),
                  boards: z.number().int().openapi({ example: 4 }),
                  categories: z.number().int().openapi({ example: 12 }),
                  details: z.object({
                    boards: z.array(z.object({
                      id: z.number().int().openapi({ example: 1 }),
                      name: z.string().openapi({ example: "free-discussion" }),
                      displayName: z.string().openapi({ example: "자유 토론" }),
                      sortOrder: z.number().int().openapi({ example: 0 })
                    })),
                    categories: z.array(z.object({
                      id: z.number().int().openapi({ example: 1 }),
                      name: z.string().openapi({ example: "일상" }),
                      boardId: z.number().int().openapi({ example: 1 }),
                      sortOrder: z.number().int().openapi({ example: 0 })
                    }))
                  })
                })
                .openapi({ type: "object" }),
            }).openapi({ type: "object" }),
          },
        },
      },
      403: { description: "관리자 권한 없음" },
      500: { description: "서버 오류" },
    },
  });

  // 샘플 데이터 초기화
  const resetSampleDataRoute = createRoute({
    method: "delete",
    path: "/sample-data",
    summary: "샘플 데이터 초기화",
    description: "모든 게시판과 카테고리를 초기화합니다.",
    tags: ["커뮤니티-관리자"],
    responses: {
      200: {
        description: "초기화 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              data: z
                .object({
                  message: z.string().openapi({ example: "모든 게시판과 카테고리가 초기화되었습니다." }),
                  deletedBoards: z.number().int().openapi({ example: 4 }),
                  deletedCategories: z.number().int().openapi({ example: 12 })
                })
                .openapi({ type: "object" }),
            }).openapi({ type: "object" }),
          },
        },
      },
      403: { description: "관리자 권한 없음" },
      500: { description: "서버 오류" },
    },
  });

  // 라우트 등록
  app.openapi(getBoardsRoute, adminCommunityApi.getBoards);
  app.openapi(createBoardRoute, adminCommunityApi.createBoard);
  app.openapi(updateBoardRoute, adminCommunityApi.updateBoard);
  app.openapi(deleteBoardRoute, adminCommunityApi.deleteBoard);
  app.openapi(getBoardCategoriesRoute, adminCommunityApi.getBoardCategories);
  app.openapi(createCategoryRoute, adminCommunityApi.createCategory);
  app.openapi(updateCategoryRoute, adminCommunityApi.updateCategory);
  app.openapi(deleteCategoryRoute, adminCommunityApi.deleteCategory);
  app.openapi(createSampleDataRoute, adminCommunityApi.createSampleData);
  app.openapi(resetSampleDataRoute, adminCommunityApi.resetSampleData);

  return app;
}
