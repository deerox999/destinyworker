import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  createSajuProfile,
  deleteSajuProfile,
  getSajuProfile,
  getSajuProfiles,
  updateSajuProfile,
} from "./sajuProfileApi";

export function createSajuRouter(): OpenAPIHono {
  const app = new OpenAPIHono();

  // 스키마 정의
  const SajuProfileSchema = z.object({
    이름: z.string().openapi({ description: "이름", example: "홍길동" }),
    년: z
      .string()
      .length(4)
      .regex(/^\d{4}$/)
      .openapi({ description: "출생년도 (YYYY)", example: "1990" }),
    월: z
      .string()
      .length(2)
      .regex(/^(0[1-9]|1[0-2])$/)
      .openapi({ description: "출생월 (MM)", example: "01" }),
    일: z
      .string()
      .length(2)
      .regex(/^(0[1-9]|[12]\d|3[01])$/)
      .openapi({ description: "출생일 (DD)", example: "15" }),
    시간: z
      .string()
      .length(2)
      .regex(/^([01]\d|2[0-3])$/)
      .optional()
      .openapi({ description: "출생시간 (HH, 00-23)", example: "14" }),
    분: z
      .string()
      .length(2)
      .regex(/^[0-5]\d$/)
      .optional()
      .openapi({ description: "출생분 (MM, 00-59)", example: "30" }),
    달력: z.enum(["양력", "음력"]).openapi({ description: "달력 종류", example: "양력" }),
    성별: z.enum(["남자", "여자"]).openapi({ description: "성별", example: "남자" }),
  }).openapi({ type: 'object' });

  const SajuProfileResponseSchema = SajuProfileSchema.extend({
    id: z.number().int().positive().openapi({ description: "사주 프로필 ID", example: 1 }),
    createdAt: z.string().datetime().openapi({ description: "생성일", example: "2023-01-01T00:00:00.000Z" }),
    updatedAt: z.string().datetime().openapi({ description: "수정일", example: "2023-01-01T00:00:00.000Z" }),
  }).openapi({ type: 'object' });

  // 라우트 정의
  const getSajuProfilesRoute = createRoute({
    method: "get",
    path: "saju-profiles",
    summary: "내 사주 프로필 목록 조회",
    description: "현재 로그인한 사용자의 사주 프로필 목록을 조회합니다.",
    tags: ["사주 프로필"],
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        description: "성공",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean().openapi({ example: true }),
              profiles: z.array(SajuProfileResponseSchema).openapi({ type: 'array' }),
              count: z.number().int().openapi({ example: 1 }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      401: { description: "인증 실패" },
      500: { description: "서버 오류" },
    },
  });

  const createSajuProfileRoute = createRoute({
    method: "post",
    path: "saju-profiles",
    summary: "사주 프로필 생성",
    description: "새로운 사주 프로필을 생성합니다.",
    tags: ["사주 프로필"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: SajuProfileSchema,
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
              id: z.number().int().openapi({ example: 1 }),
              message: z.string().openapi({ example: "사주 프로필이 성공적으로 생성되었습니다." }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      400: { description: "잘못된 데이터 형식" },
      401: { description: "인증 실패" },
      500: { description: "서버 오류" },
    },
  });

  const getSajuProfileRoute = createRoute({
    method: "get",
    path: "saju-profiles/{id}",
    summary: "사주 프로필 상세 조회",
    description: "특정 사주 프로필의 상세 정보를 조회합니다.",
    tags: ["사주 프로필"],
    security: [{ BearerAuth: [] }],
    request: {
      params: z.object({
        id: z
          .string()
          .regex(/^\d+$/)
          .pipe(z.coerce.number())
          .openapi({
            param: {
              name: "id",
              in: "path",
            },
            description: "사주 프로필 ID",
            example: "123",
          }),
      }).openapi({ type: "object" }),
    },
    responses: {
      200: {
        description: "성공",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean().openapi({ example: true }),
              profile: SajuProfileResponseSchema,
            }).openapi({ type: 'object' }),
          },
        },
      },
      400: { description: "잘못된 ID" },
      401: { description: "인증 실패" },
      403: { description: "권한 없음" },
      404: { description: "프로필을 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  const updateSajuProfileRoute = createRoute({
    method: "put",
    path: "saju-profiles/{id}",
    summary: "사주 프로필 수정",
    description: "기존 사주 프로필을 수정합니다.",
    tags: ["사주 프로필"],
    security: [{ BearerAuth: [] }],
    request: {
      params: z.object({
        id: z
          .string()
          .regex(/^\d+$/)
          .pipe(z.coerce.number())
          .openapi({
            param: {
              name: "id",
              in: "path",
            },
            description: "사주 프로필 ID",
            example: "123",
          }),
      }).openapi({ type: "object" }),
      body: {
        content: {
          "application/json": {
            schema: SajuProfileSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: "수정 성공",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean().openapi({ example: true }),
              message: z.string().openapi({ example: "프로필이 성공적으로 수정되었습니다." }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      400: { description: "잘못된 데이터 형식 또는 ID" },
      401: { description: "인증 실패" },
      403: { description: "권한 없음" },
      404: { description: "프로필을 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  const deleteSajuProfileRoute = createRoute({
    method: "delete",
    path: "saju-profiles/{id}",
    summary: "사주 프로필 삭제",
    description: "사주 프로필을 삭제합니다.",
    tags: ["사주 프로필"],
    security: [{ BearerAuth: [] }],
    request: {
      params: z.object({
        id: z
          .string()
          .regex(/^\d+$/)
          .pipe(z.coerce.number())
          .openapi({
            param: {
              name: "id",
              in: "path",
            },
            description: "사주 프로필 ID",
            example: "123",
          }),
      }).openapi({ type: "object" }),
    },
    responses: {
      200: {
        description: "삭제 성공",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean().openapi({ example: true }),
              message: z.string().openapi({ example: "프로필이 성공적으로 삭제되었습니다." }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      400: { description: "잘못된 ID" },
      401: { description: "인증 실패" },
      403: { description: "권한 없음" },
      404: { description: "프로필을 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  // 라우트 등록
  app.openapi(getSajuProfilesRoute, (c) => getSajuProfiles(c));
  app.openapi(createSajuProfileRoute, (c) => createSajuProfile(c));
  app.openapi(getSajuProfileRoute, (c) => getSajuProfile(c)); // 안됨
  app.openapi(updateSajuProfileRoute, (c) => updateSajuProfile(c)); // 안됨
  app.openapi(deleteSajuProfileRoute, (c) => deleteSajuProfile(c)); // 안됨
  return app;
}
