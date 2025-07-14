import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  createCelebrityComment,
  deleteCelebrityComment,
  getCelebrities,
  getCelebrityById,
  getCelebrityComments,
  toggleCelebrityCommentLike,
  updateCelebrityComment,
} from "./celebrityProfileApi";
import { createCelebrityRequest } from "./celebrityRequestApi";

export function createCelebrityRouter(): OpenAPIHono {
  const app = new OpenAPIHono();

  // --- 스키마 정의 ---

  const LangQuerySchema = z.object({
    lang: z.string().default("ko").openapi({ description: "언어 코드 (e.g., 'ko', 'en')", example: "ko" }),
  });

  const PaginationQuerySchema = z.object({
    page: z.string().regex(/^\d+$/).default("1").openapi({ description: "페이지 번호", example: "1" }),
    limit: z.string().regex(/^\d+$/).default("10").openapi({ description: "페이지 당 항목 수", example: "10" }),
  });

  const CelebrityIdParamSchema = z.object({
    id: z.string().openapi({
      param: {
        name: "id",
        in: "path",
      },
      description: "유명인물 ID",
      example: "iu",
    }),
  });
  
  const CommentIdParamSchema = z.object({
    commentId: z.string().regex(/^\d+$/).transform(Number).openapi({
      param: {
        name: "commentId",
        in: "path",
      },
      description: "댓글 ID",
      example: "123",
    }),
  });

  // --- 응답 스키마 ---
  const CelebrityBaseSchema = z.object({
    id: z.string().openapi({ example: "iu" }),
    이름: z.string().openapi({ example: "아이유" }),
    성별: z.string().openapi({ example: "여" }),
    직업: z.string().openapi({ example: "가수" }),
    설명: z.string().openapi({ example: "대한민국의 가수 겸 배우" }),
    이미지: z.string().url().nullable().openapi({ example: "https://example.com/iu.jpg" }),
    년: z.number().int().openapi({ example: 1993 }),
    월: z.number().int().openapi({ example: 5 }),
    일: z.number().int().openapi({ example: 16 }),
    달력: z.string().openapi({ example: "양력" })
  }).openapi({ type: 'object' });

  const CommentFieldsSchema = z.object({
      id: z.number().int().openapi({ example: 1 }),
      내용: z.string().openapi({ example: "정말 멋져요!" }),
      작성자: z.string().openapi({ example: "사용자1" }),
      작성자ID: z.string().openapi({ example: "user123" }),
      부모댓글ID: z.number().int().nullable().openapi({ example: null }),
      추천수: z.number().int().openapi({ example: 5 }),
      내가추천함: z.boolean().openapi({ example: true }),
      작성일: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }),
      수정일: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }),
  });
  
  const RecursiveCommentSchema: z.ZodType<any> = CommentFieldsSchema.extend({
      답글: z.array(CommentFieldsSchema).openapi({ type: 'array' }),
  });

  // --- 라우트 정의 ---
  const getCelebritiesRoute = createRoute({
    method: "get",
    path: "/",
    summary: "유명인물 목록 조회",
    description: "페이지네이션, 다국어 지원과 함께 유명인물 목록을 조회합니다.",
    tags: ["유명인물"],
    security: [{ BearerAuth: [] }],
    request: {
      query: PaginationQuerySchema.merge(LangQuerySchema).openapi({ type: 'object' }),
    },
    responses: {
      200: { 
        description: "성공",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean().openapi({ example: true }),
              celebrities: z.array(CelebrityBaseSchema).openapi({ type: 'array' }),
              pagination: z.object({
                  page: z.number().int().openapi({ example: 1 }),
                  limit: z.number().int().openapi({ example: 10 }),
                  total: z.number().int().openapi({ example: 100 }),
                  totalPages: z.number().int().openapi({ example: 10 })
              }).openapi({ type: 'object' })
            }).openapi({ type: 'object' })
          }
        }
      },
    },
  });

  const getCelebrityByIdRoute = createRoute({
    method: "get",
    path: "/{id}",
    summary: "특정 유명인물 정보 조회",
    description: "ID와 언어 코드를 사용하여 특정 유명인물의 상세 정보를 조회합니다.",
    tags: ["유명인물"],
    request: {
      params: CelebrityIdParamSchema,
      query: LangQuerySchema,
    },
    responses: {
      200: { 
        description: "성공",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean().openapi({ example: true }),
              celebrity: CelebrityBaseSchema
            }).openapi({ type: 'object' })
          }
        }
      },
      404: { description: "유명인물을 찾을 수 없음" },
    },
  });

  const getCelebrityCommentsRoute = createRoute({
    method: "get",
    path: "/{id}/comments",
    summary: "유명인물 댓글 목록 조회",
    description: "특정 유명인물의 댓글 목록을 페이지네이션, 정렬, 추천 여부와 함께 조회합니다.",
    tags: ["유명인물"],
    request: {
      params: CelebrityIdParamSchema,
      query: PaginationQuerySchema.extend({
        sort: z.enum(["latest", "likes"]).default("latest").describe("정렬 기준 (latest 또는 likes)"),
      }).openapi({ type: 'object' }),
    },
    responses: {
      200: { 
        description: "성공",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean().openapi({ example: true }),
              comments: z.array(RecursiveCommentSchema).openapi({ type: 'array' }),
              pagination: z.object({
                totalItems: z.number().int().openapi({ example: 50 }),
                totalPages: z.number().int().openapi({ example: 5 }),
                currentPage: z.number().int().openapi({ example: 1 }),
                pageSize: z.number().int().openapi({ example: 10 })
              }).openapi({ type: 'object' })
            }).openapi({ type: 'object' })
          }
        }
      },
      400: { description: "잘못된 유명인물 ID" },
    },
  });

  const createCelebrityCommentRoute = createRoute({
    method: "post",
    path: "{id}/comments",
    summary: "유명인물 댓글 작성",
    description: "특정 유명인물에게 새로운 댓글이나 대댓글을 작성합니다.",
    tags: ["유명인물"],
    security: [{ BearerAuth: [] }],
    request: {
      params: CelebrityIdParamSchema,
      body: {
        content: {
          "application/json": { 
            schema: z.object({
              내용: z.string().min(1).openapi({ description: "댓글 내용", example: "응원합니다!" }),
              부모댓글ID: z.number().int().positive().optional().nullable().openapi({ description: "대댓글일 경우 부모 댓글의 ID", example: 123 }),
            }).openapi({ type: 'object' })
          },
        },
      },
    },
    responses: {
      201: {
        description: "생성 성공",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean().openapi({ example: true }),
              comment: CommentFieldsSchema,
              message: z.string().openapi({ example: "댓글이 성공적으로 작성되었습니다." })
            }).openapi({ type: 'object' })
          }
        }
      },
      400: { description: "잘못된 요청 데이터" },
      401: { description: "인증 실패" },
      404: { description: "유명인물을 찾을 수 없음" },
    },
  });
  
  const updateCelebrityCommentRoute = createRoute({
    method: "put",
    path: "/{id}/comments/{commentId}",
    summary: "유명인물 댓글 수정",
    description: "자신이 작성한 댓글을 수정합니다.",
    tags: ["유명인물"],
    security: [{ BearerAuth: [] }],
    request: {
        params: CelebrityIdParamSchema.merge(CommentIdParamSchema).openapi({ type: 'object' }),
        body: {
            content: {
                "application/json": { 
                  schema: z.object({
                    내용: z.string().min(1).openapi({ description: "댓글 내용", example: "정말 멋져요!" }),
                    부모댓글ID: z.number().int().positive().optional().nullable().openapi({ description: "대댓글일 경우 부모 댓글의 ID", example: null }),
                  }).openapi({ type: 'object' })
                }
            }
        }
    },
    responses: {
        200: { 
          description: "수정 성공",
          content: {
            "application/json": {
              schema: z.object({
                success: z.boolean().openapi({ example: true }),
                message: z.string().openapi({ example: "댓글이 성공적으로 수정되었습니다." })
              }).openapi({ type: 'object' })
            }
          }
        },
        400: { description: "잘못된 요청 데이터" },
        401: { description: "인증 실패" },
        403: { description: "권한 없음" },
        404: { description: "댓글을 찾을 수 없음" },
    }
  });

  const deleteCelebrityCommentRoute = createRoute({
    method: "delete",
    path: "/{id}/comments/{commentId}",
    summary: "유명인물 댓글 삭제",
    description: "자신이 작성한 댓글 또는 관리자가 댓글을 삭제합니다.",
    tags: ["유명인물"],
    security: [{ BearerAuth: [] }],
    request: {
        params: CelebrityIdParamSchema.merge(CommentIdParamSchema).openapi({ type: 'object' })
    },
    responses: {
        200: { 
          description: "삭제 성공",
          content: {
            "application/json": {
              schema: z.object({
                success: z.boolean().openapi({ example: true }),
                message: z.string().openapi({ example: "댓글이 성공적으로 삭제되었습니다." })
              }).openapi({ type: 'object' })
            }
          }
        },
        401: { description: "인증 실패" },
        403: { description: "권한 없음" },
        404: { description: "댓글을 찾을 수 없음" },
    }
  });
  
  const toggleCelebrityCommentLikeRoute = createRoute({
      method: "post",
      path: "/{id}/comments/{commentId}/like",
      summary: "댓글 추천 토글",
      description: "유명인물 댓글을 추천하거나 추천을 취소합니다.",
      tags: ["유명인물"],
      security: [{ BearerAuth: [] }],
      request: {
          params: CelebrityIdParamSchema.merge(CommentIdParamSchema).openapi({ type: 'object' })
      },
      responses: {
          200: {
              description: "추천/추천 취소 성공",
              content: {
                  "application/json": {
                      schema: z.object({
                          success: z.boolean().openapi({ example: true }),
                          action: z.enum(["liked", "unliked"]).openapi({ example: "liked" }),
                          likeCount: z.number().int().openapi({ example: 10 })
                      }).openapi({ type: 'object' })
                  }
              }
          },
          401: { description: "인증 실패" },
          404: { description: "댓글을 찾을 수 없음" },
      }
  });

  const createCelebrityRequestRoute = createRoute({
      method: 'post',
      path: 'requests',
      summary: "유명인물 추가 요청",
      description: "새로운 유명인물 추가를 요청합니다.",
      tags: ["유명인물"],
      request: {
          body: {
              content: {
                  "application/json": {
                      schema: z.object({
                          name: z.string().openapi({ description: "유명인물 이름", example: "새로운 연예인" }),
                          description: z.string().openapi({ description: "유명인물에 대한 설명", example: "최근 데뷔한 가수" }),
                          birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다.").openapi({ description: "생년월일 (YYYY-MM-DD)", example: "2000-01-01" }),
                          occupation: z.string().openapi({ description: "직업", example: "가수" }),
                      }).openapi({ type: 'object' })
                  }
              }
          }
      },
      responses: {
          201: { 
            description: "요청 성공",
            content: {
              "application/json": {
                schema: z.object({
                  success: z.boolean().openapi({ example: true }),
                  data: z.object({
                      id: z.number().int().openapi({ example: 1 }),
                      name: z.string().openapi({ example: "새로운 연예인" }),
                      description: z.string().openapi({ example: "최근 데뷔한 가수" }),
                      birthDate: z.string().openapi({ example: "2000-01-01" }),
                      occupation: z.string().openapi({ example: "가수" }),
                      isProcessed: z.boolean().openapi({ example: false }),
                      createdAt: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }),
                      updatedAt: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }),
                  }).openapi({ type: 'object' }),
                  message: z.string().openapi({ example: "요청이 성공적으로 접수되었습니다." })
                }).openapi({ type: 'object' })
              }
            }
          },
          400: { description: "잘못된 요청 데이터" },
          500: { description: "서버 오류" },
      }
  });
  
  app.openapi(getCelebritiesRoute, (c) => getCelebrities(c)); // 안됨
  app.openapi(getCelebrityByIdRoute, (c) => getCelebrityById(c)); // 안됨
  app.openapi(getCelebrityCommentsRoute, (c) => getCelebrityComments(c)); // 안됨
  app.openapi(createCelebrityCommentRoute, (c) => createCelebrityComment(c)); // 안됨
  app.openapi(updateCelebrityCommentRoute, (c) => updateCelebrityComment(c)); // 안됨
  app.openapi(deleteCelebrityCommentRoute, (c) => deleteCelebrityComment(c)); // 안됨
  app.openapi(toggleCelebrityCommentLikeRoute, (c) => toggleCelebrityCommentLike(c)); // 안됨
  app.openapi(createCelebrityRequestRoute, (c) => createCelebrityRequest(c));

  return app;
}
