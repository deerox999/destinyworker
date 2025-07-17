import { z } from "@hono/zod-openapi";

export const PaginationQuerySchema = z
  .object({
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
  })
  .openapi({ type: "object" });

export const SortQuerySchema = z
  .object({
    sort: z
      .string()
      .default("createdAt")
      .optional()
      .openapi({
        param: { name: "sort", in: "query" },
        description: "정렬 필드",
        example: "createdAt",
      }),
    order: z
      .enum(["asc", "desc"])
      .default("desc")
      .optional()
      .openapi({
        param: { name: "order", in: "query" },
        description: "정렬 순서",
        example: "desc",
      }),
  })
  .openapi({ type: "object" });

export const CelebrityIdParamSchema = z
  .object({
    id: z.string().openapi({
      param: {
        name: "id",
        in: "path",
      },
      description: "유명인물 ID",
      example: "iu",
    }),
  })
  .openapi({ type: "object" });

export const TranslationSchema = z
  .object({
    languageCode: z
      .string()
      .openapi({ description: "언어 코드", example: "ko" }),
    name: z.string().openapi({ description: "이름", example: "아이유" }),
    occupation: z
      .string()
      .optional()
      .openapi({ description: "직업", example: "가수" }),
    description: z
      .string()
      .optional()
      .openapi({ description: "설명", example: "대한민국의 가수 겸 배우" }),
  })
  .openapi({ type: "object" });

export const CelebritySchema = z
  .object({
    id: z.string().openapi({ example: "iu" }),
    birthYear: z.number().int().openapi({ example: 1993 }),
    birthMonth: z.number().int().openapi({ example: 5 }),
    birthDay: z.number().int().openapi({ example: 16 }),
    birthHour: z.number().int().nullable().optional().openapi({ example: 10 }),
    birthMinute: z.number().int().nullable().optional().openapi({ example: 30 }),
    calendar: z.enum(["SOLAR", "LUNAR"]).openapi({ example: "SOLAR" }),
    gender: z.enum(["MALE", "FEMALE"]).openapi({ example: "FEMALE" }),
    imageUrl: z
      .string()
      .nullable()
      .optional()
      .openapi({ example: "https://example.com/iu.jpg" }),
    translations: z.array(TranslationSchema).openapi({ type: "array" }),
  })
  .openapi({ type: "object" });

export const LangQuerySchema = z.object({
  lang: z
    .string()
    .default("ko")
    .openapi({
      param: { name: "lang", in: "query" },
      description: "언어 코드 (e.g., 'ko', 'en')",
      example: "ko",
    }),
});

export const CommentIdParamSchema = z.object({
  commentId: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .openapi({
      param: {
        name: "commentId",
        in: "path",
      },
      description: "댓글 ID",
      example: "123",
    }),
});

export const CommentFieldsSchema = z.object({
  id: z.number().int().openapi({ example: 1 }),
  내용: z.string().openapi({ example: "정말 멋져요!" }),
  작성자: z.string().openapi({ example: "사용자1" }),
  작성자ID: z.string().openapi({ example: "user123" }),
  부모댓글ID: z.number().int().nullable().openapi({ example: null }),
  추천수: z.number().int().openapi({ example: 5 }),
  내가추천함: z.boolean().openapi({ example: true }),
  작성일: z
    .string()
    .datetime()
    .openapi({ example: "2023-01-01T00:00:00.000Z" }),
  수정일: z
    .string()
    .datetime()
    .openapi({ example: "2023-01-01T00:00:00.000Z" }),
});

export const RecursiveCommentSchema = CommentFieldsSchema.extend({
  답글: z.array(CommentFieldsSchema).openapi({ type: "array" }),
});

export const CelebrityBaseSchema = z
  .object({
    id: z.string().openapi({ example: "iu" }),
    이름: z.string().openapi({ example: "아이유" }),
    성별: z.string().openapi({ example: "여" }),
    직업: z.string().openapi({ example: "가수" }),
    설명: z.string().openapi({ example: "대한민국의 가수 겸 배우" }),
    이미지: z
      .string()
      .url()
      .nullable()
      .openapi({ example: "https://example.com/iu.jpg" }),
    년: z.number().int().openapi({ example: 1993 }),
    월: z.number().int().openapi({ example: 5 }),
    일: z.number().int().openapi({ example: 16 }),
    달력: z.string().openapi({ example: "양력" }),
  })
  .openapi({ type: "object" });

export const SajuProfileIdParamSchema = z.object({
    id: z.coerce
      .number()
      .int()
      .positive()
      .openapi({
        param: {
          name: "id",
          in: "path",
        },
        description: "사주 프로필 ID",
        example: 1,
      }),
  });

export const RagIdParamSchema = z
  .object({
    id: z.coerce
      .number()
      .int()
      .positive()
      .openapi({
        param: {
          name: "id",
          in: "path",
        },
        description: "문서 ID",
        example: 123,
      }),
  })
  .openapi({ type: "object" });

export const ConversationIdParamSchema = z
  .object({
    id: z
      .string()
      .uuid()
      .openapi({
        param: {
          name: "id",
          in: "path",
        },
        description: "대화 ID",
        example: "a1b2c3d4-e5f6-7890-1234-567890abcdef",
      }),
  })
  .openapi({ type: "object" });

export const SuccessSchema = z.object({
  success: z.boolean().openapi({ example: true }),
}).openapi({ type: 'object' });

export const PaginationResponseSchema = z.object({
  totalItems: z.number().int().openapi({ example: 100 }),
  totalPages: z.number().int().openapi({ example: 5 }),
  currentPage: z.number().int().openapi({ example: 1 }),
  pageSize: z.number().int().openapi({ example: 10 }),
}).openapi({ type: 'object' });