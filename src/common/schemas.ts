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

export const CelebrityCommentIdParamSchema = z.object({
  commentId: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .openapi({
      param: {
        name: "commentId",
        in: "path",
      },
      description: "유명인물 댓글 ID",
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

// 커뮤니티 관련 스키마들
export const BoardIdParamSchema = z.object({
  id: z.coerce
    .number()
    .int()
    .positive()
    .openapi({
      param: {
        name: "id",
        in: "path",
      },
      description: "게시판 ID",
      example: 1,
    }),
}).openapi({ type: 'object' });

export const PostIdParamSchema = z.object({
  id: z.coerce
    .number()
    .int()
    .positive()
    .openapi({
      param: {
        name: "id",
        in: "path",
      },
      description: "게시글 ID",
      example: 1,
    }),
}).openapi({ type: 'object' });

export const CommentIdParamSchema = z.object({
  id: z.coerce
    .number()
    .int()
    .positive()
    .openapi({
      param: {
        name: "id",
        in: "path",
      },
      description: "댓글 ID",
      example: 1,
    }),
}).openapi({ type: 'object' });

export const BoardSchema = z.object({
  id: z.number().int().openapi({ example: 1 }),
  name: z.string().openapi({ example: "bug-report" }),
  displayName: z.string().openapi({ example: "버그 제보" }),
  description: z.string().nullable().openapi({ example: "버그를 제보하는 게시판입니다." }),
  isActive: z.boolean().openapi({ example: true }),
  createdAt: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }),
  updatedAt: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }),
}).openapi({ type: 'object' });

export const BoardCategorySchema = z.object({
  id: z.number().int().openapi({ example: 1 }),
  boardId: z.number().int().openapi({ example: 1 }),
  name: z.string().openapi({ example: "치명적 버그" }),
  sortOrder: z.number().int().openapi({ example: 0 }),
  isActive: z.boolean().openapi({ example: true }),
  createdAt: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }),
  updatedAt: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }),
}).openapi({ type: 'object' });

export const TagSchema = z.object({
  id: z.number().int().openapi({ example: 1 }),
  name: z.string().openapi({ example: "버그" }),
  createdAt: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }),
}).openapi({ type: 'object' });

export const UserInfoSchema = z.object({
  id: z.number().int().openapi({ example: 1 }),
  name: z.string().openapi({ example: "홍길동" }),
  userName: z.string().nullable().openapi({ example: "hong" }),
  picture: z.string().nullable().openapi({ example: "https://example.com/avatar.jpg" }),
}).openapi({ type: 'object' });

export const PostSchema = z.object({
  id: z.number().int().openapi({ example: 1 }),
  boardId: z.number().int().openapi({ example: 1 }),
  categoryId: z.number().int().openapi({ example: 1 }),
  authorId: z.number().int().openapi({ example: 1 }),
  title: z.string().openapi({ example: "버그 제보합니다" }),
  content: z.string().openapi({ example: "<p>버그 내용입니다.</p>" }),
  viewCount: z.number().int().openapi({ example: 10 }),
  likeCount: z.number().int().openapi({ example: 5 }),
  commentCount: z.number().int().openapi({ example: 3 }),
  isNotice: z.boolean().openapi({ example: false }),
  isDeleted: z.boolean().openapi({ example: false }),
  createdAt: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }),
  updatedAt: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }),
  author: UserInfoSchema,
  board: z.object({
    id: z.number().int().openapi({ example: 1 }),
    name: z.string().openapi({ example: "bug-report" }),
    displayName: z.string().openapi({ example: "버그 제보" }),
  }).openapi({ type: 'object' }),
  category: z.object({
    id: z.number().int().openapi({ example: 1 }),
    name: z.string().openapi({ example: "치명적 버그" }),
  }).openapi({ type: 'object' }),
  postTags: z.array(z.object({
    tag: TagSchema,
  })).openapi({ type: 'array' }),
}).openapi({ type: 'object' });

export const CommentSchema = z.object({
  id: z.number().int().openapi({ example: 1 }),
  postId: z.number().int().openapi({ example: 1 }),
  authorId: z.number().int().openapi({ example: 1 }),
  parentId: z.number().int().nullable().openapi({ example: null }),
  content: z.string().openapi({ example: "좋은 게시글이네요!" }),
  likeCount: z.number().int().openapi({ example: 2 }),
  isDeleted: z.boolean().openapi({ example: false }),
  createdAt: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }),
  updatedAt: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }),
  author: UserInfoSchema,
  replies: z.array(z.object({
    id: z.number().int().openapi({ example: 2 }),
    postId: z.number().int().openapi({ example: 1 }),
    authorId: z.number().int().openapi({ example: 2 }),
    parentId: z.number().int().openapi({ example: 1 }),
    content: z.string().openapi({ example: "동의합니다!" }),
    likeCount: z.number().int().openapi({ example: 1 }),
    isDeleted: z.boolean().openapi({ example: false }),
    createdAt: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }),
    updatedAt: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }),
    author: UserInfoSchema,
  })).openapi({ type: 'array' }),
}).openapi({ type: 'object' });

export const CreatePostSchema = z.object({
  boardId: z.number().int().openapi({ example: 1 }),
  categoryId: z.number().int().openapi({ example: 1 }),
  title: z.string().min(1).openapi({ example: "버그 제보합니다" }),
  content: z.string().min(1).openapi({ example: "<p>버그 내용입니다.</p>" }),
  tags: z.array(z.string()).optional().openapi({ example: ["버그", "UI"] }),
}).openapi({ type: 'object' });

export const UpdatePostSchema = z.object({
  title: z.string().min(1).openapi({ example: "버그 제보합니다" }),
  content: z.string().min(1).openapi({ example: "<p>버그 내용입니다.</p>" }),
  tags: z.array(z.string()).optional().openapi({ example: ["버그", "UI"] }),
}).openapi({ type: 'object' });

export const CreateCommentSchema = z.object({
  postId: z.number().int().openapi({ example: 1 }),
  parentId: z.number().int().nullable().optional().openapi({ example: null }),
  content: z.string().min(1).openapi({ example: "좋은 게시글이네요!" }),
}).openapi({ type: 'object' });

export const UpdateCommentSchema = z.object({
  content: z.string().min(1).openapi({ example: "좋은 게시글이네요!" }),
}).openapi({ type: 'object' });

export const PostQuerySchema = z.object({
  boardId: z.coerce.number().int().positive().optional().openapi({
    param: { name: "boardId", in: "query" },
    description: "게시판 ID",
    example: 1,
  }),
  categoryId: z.coerce.number().int().positive().optional().openapi({
    param: { name: "categoryId", in: "query" },
    description: "카테고리 ID",
    example: 1,
  }),
  page: z.coerce.number().int().positive().default(1).optional().openapi({
    param: { name: "page", in: "query" },
    description: "페이지 번호",
    example: 1,
  }),
  limit: z.coerce.number().int().positive().default(20).optional().openapi({
    param: { name: "limit", in: "query" },
    description: "페이지당 항목 수",
    example: 20,
  }),
  sort: z.enum(["latest", "oldest", "popular", "views"]).default("latest").optional().openapi({
    param: { name: "sort", in: "query" },
    description: "정렬 기준",
    example: "latest",
  }),
  search: z.string().optional().openapi({
    param: { name: "search", in: "query" },
    description: "검색어",
    example: "버그",
  }),
}).openapi({ type: 'object' });

export const CommentQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1).optional().openapi({
    param: { name: "page", in: "query" },
    description: "페이지 번호",
    example: 1,
  }),
  limit: z.coerce.number().int().positive().default(50).optional().openapi({
    param: { name: "limit", in: "query" },
    description: "페이지당 항목 수",
    example: 50,
  }),
}).openapi({ type: 'object' });

export const TagQuerySchema = z.object({
  search: z.string().optional().openapi({
    param: { name: "search", in: "query" },
    description: "검색어",
    example: "버그",
  }),
  limit: z.coerce.number().int().positive().default(10).optional().openapi({
    param: { name: "limit", in: "query" },
    description: "조회할 태그 수",
    example: 10,
  }),
}).openapi({ type: 'object' });