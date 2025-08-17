import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  createSajuProfile,
  deleteSajuProfiles,
  getSajuProfiles,
  updateSajuProfile,
  updateSajuProfilesBulk
} from "./sajuProfileApi";

import { MiddlewareHandler } from "hono";
import { SuccessSchema } from "../../../common/schemas";

export function createSajuRouter(authMiddleware: MiddlewareHandler): OpenAPIHono {
  const app = new OpenAPIHono();
  app.use(authMiddleware);

  // 스키마 정의
  const SajuProfileSchema = z.object({
    name: z.string().openapi({ description: "이름", example: "홍길동" }),
    year: z
      .string()
      .length(4)
      .regex(/^\d{4}$/)
      .openapi({ description: "출생년도 (YYYY)", example: "1990" }),
    month: z
      .string()
      .length(2)
      .regex(/^(0[1-9]|1[0-2])$/)
      .openapi({ description: "출생월 (MM)", example: "01" }),
    day: z
      .string()
      .length(2)
      .regex(/^(0[1-9]|[12]\d|3[01])$/)
      .openapi({ description: "출생일 (DD)", example: "15" }),
    hour: z
      .string()
      .length(2)
      .regex(/^([01]\d|2[0-3])$/)
      .optional()
      .openapi({ description: "출생시간 (HH, 00-23)", example: "14" }),
    minute: z
      .string()
      .length(2)
      .regex(/^[0-5]\d$/)
      .optional()
      .openapi({ description: "출생분 (MM, 00-59)", example: "30" }),
    calendar: z.enum(["양력", "음력"]).openapi({ description: "달력 종류", example: "양력" }),
    gender: z.enum(["남자", "여자"]).openapi({ description: "성별", example: "남자" }),
    country: z.string().openapi({ description: "국가", example: "한국" }),
    city: z.string().openapi({ description: "도시", example: "서울" }),
    calculationMethod: z.string().openapi({ description: "계산 방법", example: "일반" }),
    context: z.string().nullable().optional().openapi({ description: "맥락 정보", example: "특이사항 메모" }),
  }).openapi({ type: 'object' });

  const SajuProfileResponseSchema = SajuProfileSchema.extend({
    groupName: z.string().nullable().optional().openapi({ description: "그룹명", example: "가족" }),
    sortOrder: z.number().int().openapi({ description: "정렬 순서", example: 0 }),
    id: z.number().int().positive().openapi({ description: "사주 프로필 ID", example: 1 }),
    createdAt: z.string().datetime().openapi({ description: "생성일", example: "2023-01-01T00:00:00.000Z" }),
    updatedAt: z.string().datetime().openapi({ description: "수정일", example: "2023-01-01T00:00:00.000Z" }),
  }).openapi({ type: 'object' });

  // 라우트 정의
  const getSajuProfilesRoute = createRoute({
    method: "get",
    path: "/",
    summary: "내 사주 프로필 목록 조회",
    description: "현재 로그인한 사용자의 사주 프로필 목록을 조회합니다.",
    tags: ["사주 프로필"],
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        description: "성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
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
    path: "/",
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
            schema: SuccessSchema.extend({
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

  const updateSajuProfileRoute = createRoute({
    method: "put",
    path: "/{id}",
    summary: "사주 프로필 수정",
    description: "기존 사주 프로필을 수정합니다.",
    tags: ["사주 프로필"],
    security: [{ BearerAuth: [] }],
    request: {
      // params: SajuProfileIdParamSchema,
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
            schema: SuccessSchema.extend({
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

  const deleteSajuProfilesRoute = createRoute({
    method: "delete",
    path: "/",
    summary: "사주 프로필 다중 삭제",
    description: "여러 사주 프로필을 한 번에 삭제합니다.",
    tags: ["사주 프로필"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              ids: z.array(z.number().int().positive()).openapi({ 
                description: "삭제할 프로필 ID 배열", 
                example: [1, 2, 3] 
              }),
            }).openapi({ type: 'object' }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "삭제 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              message: z.string().openapi({ example: "프로필들이 성공적으로 삭제되었습니다." }),
              deletedCount: z.number().int().openapi({ example: 3 }),
              failedIds: z.array(z.number()).optional().openapi({ example: [] }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      400: { description: "잘못된 데이터 형식" },
      401: { description: "인증 실패" },
      500: { description: "서버 오류" },
    },
  });

  // 그룹/정렬 일괄 업데이트
  const updateSajuProfilesBulkRoute = createRoute({
    method: "put",
    path: "/bulk",
    summary: "사주 프로필 목록 일괄 업데이트",
    description: "여러 사주 프로필의 모든 필드를 선택적으로 한 번에 업데이트합니다.",
    tags: ["사주 프로필"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              items: z.array(z.object({
                id: z.number().int().positive(),
                name: z.string().optional(),
                year: z.string().regex(/^\d{4}$/).optional(),
                month: z.string().regex(/^(0[1-9]|1[0-2])$/).optional(),
                day: z.string().regex(/^(0[1-9]|[12]\d|3[01])$/).optional(),
                hour: z.string().regex(/^([01]\d|2[0-3])$/).nullable().optional(),
                minute: z.string().regex(/^[0-5]\d$/).nullable().optional(),
                calendar: z.enum(["양력", "음력"]).optional(),
                gender: z.enum(["남자", "여자"]).optional(),
                country: z.string().nullable().optional(),
                city: z.string().nullable().optional(),
                calculationMethod: z.string().nullable().optional(),
                context: z.string().nullable().optional(),
                groupName: z.string().nullable().optional(),
                sortOrder: z.number().int().nullable().optional(),
              })).openapi({
                description: "업데이트할 항목 배열",
                example: [
                  { id: 1, name: "홍길동", year: "1990", month: "01", day: "15", calendar: "양력", gender: "남자", groupName: "가족", sortOrder: 0 },
                  { id: 2, groupName: "가족", sortOrder: 1 },
                  { id: 3, context: "메모", city: "서울" },
                ],
              }),
              autoSort: z.boolean().optional().openapi({ description: "true이면 sortOrder 미지정 항목에 그룹별 최대값+1 자동 부여", example: true })
            }).openapi({ type: 'object' }),
          },
        },
      },
    },
    responses: {
      200: { description: "수정 성공" },
      400: { description: "잘못된 데이터 형식" },
      401: { description: "인증 실패" },
      500: { description: "서버 오류" },
    },
  });

  // 라우트 등록
  app.openapi(getSajuProfilesRoute, (c) => getSajuProfiles(c));
  app.openapi(createSajuProfileRoute, (c) => createSajuProfile(c));
  // /bulk가 /{id}보다 먼저 등록되어야 라우팅 충돌이 없음
  app.openapi(updateSajuProfilesBulkRoute, (c) => updateSajuProfilesBulk(c));
  app.openapi(updateSajuProfileRoute, (c) => updateSajuProfile(c));
  app.openapi(deleteSajuProfilesRoute, (c) => deleteSajuProfiles(c));
  return app;
}
