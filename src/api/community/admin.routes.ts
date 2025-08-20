import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { SuccessSchema } from "../../common/schemas";
import { adminCommunityApi } from "./adminCommunityApi";
import { adminColumnApi } from "./adminColumnApi";

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
  // 라우트 등록
  app.openapi(getBoardsRoute, adminCommunityApi.getBoards);
  app.openapi(createBoardRoute, adminCommunityApi.createBoard);
  app.openapi(updateBoardRoute, adminCommunityApi.updateBoard);
  app.openapi(deleteBoardRoute, adminCommunityApi.deleteBoard);
  app.openapi(getBoardCategoriesRoute, adminCommunityApi.getBoardCategories);
  app.openapi(createCategoryRoute, adminCommunityApi.createCategory);
  app.openapi(updateCategoryRoute, adminCommunityApi.updateCategory);
  app.openapi(deleteCategoryRoute, adminCommunityApi.deleteCategory);

  // ===== 사주 칼럼 생성 (관리자) =====
  const dryRunRoute = createRoute({
    method: "post",
    path: "/columns/dry-run",
    summary: "사주 칼럼 미리보기(저장 없음)",
    description: "제목/난이도 기준으로 칼럼 HTML을 생성해 미리보기. 저장하지 않음.",
    tags: ["커뮤니티-관리자"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              title: z.string().optional().openapi({ example: "십성이란 무엇일까" }),
              level: z.enum(["초급","중급","고급"]).default("초급"),
              language: z.enum(["ko","en","ja","zh","vi"]).default("ko"),
            })
          }
        }
      }
    },
    responses: { 200: { description: "성공" }, 400: { description: "유효성 실패" }, 409: { description: "유사도 중복" }, 500: { description: "서버 오류" } }
  });
  const generateRoute = createRoute({
    method: "post",
    path: "/columns/generate",
    summary: "사주 칼럼 생성 및 저장",
    description: "제목/난이도 기준으로 칼럼을 생성하고 게시글로 저장합니다.",
    tags: ["커뮤니티-관리자"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              title: z.string().optional().openapi({ example: "재성은 정말 돈만을 의미하는걸까?" }),
              level: z.enum(["초급","중급","고급"]).default("초급"),
              language: z.enum(["ko","en","ja","zh","vi"]).default("ko"),
            })
          }
        }
      }
    },
    responses: { 202: { description: "작업 등록 성공(비동기)" }, 400: { description: "유효성 실패" }, 409: { description: "유사도 중복" }, 500: { description: "서버 오류" } }
  });

  const generateStatusRoute = createRoute({
    method: "get",
    path: "/columns/generate/status",
    summary: "사주 칼럼 생성 작업 상태 조회",
    description: "비동기 칼럼 생성 작업의 상태를 조회합니다.",
    tags: ["커뮤니티-관리자"],
    request: {
      query: z.object({
        jobId: z.string().min(1).openapi({ param: { name: "jobId", in: "query" }, example: "col_1690000000_abcd1234" })
      })
    },
    responses: { 200: { description: "성공" }, 404: { description: "작업없음" }, 500: { description: "서버 오류" } }
  });

  app.openapi(dryRunRoute, adminColumnApi.dryRunGenerate);
  app.openapi(generateRoute, adminColumnApi.generateAndCreate);
  app.openapi(generateStatusRoute, adminColumnApi.getGenerateStatus);
  return app;
}
