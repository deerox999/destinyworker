import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getUserProfile, updateUserProfile } from "./userApi";

export function createUserRouter(): OpenAPIHono {
  const app = new OpenAPIHono();

  const getUserProfileRoute = createRoute({
    method: "get",
    path: "/profile",
    summary: "사용자 프로필 조회",
    description: "현재 로그인한 사용자의 프로필 정보를 조회합니다.",
    tags: ["사용자"],
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        description: "프로필 조회 성공",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean().openapi({
                description: "성공 여부",
                example: true,
              }),
              user: z.object({
                id: z.number().openapi({
                  description: "사용자 ID",
                  example: 1,
                }),
                이메일: z.string().email().openapi({
                  description: "사용자 이메일",
                  example: "user@example.com",
                }),
                이름: z.string().openapi({
                  description: "사용자 이름",
                  example: "홍길동",
                }),
                프로필이름: z.string().openapi({
                  description: "사용자 프로필 이름",
                  example: "쾌남",
                }),
                프로필사진: z.string().url().openapi({
                  description: "사용자 프로필 사진 URL",
                  example: "https://example.com/profile.jpg",
                }),
                가입일: z.string().datetime().openapi({
                  description: "가입일",
                  example: "2023-01-01T00:00:00.000Z",
                }),
                수정일: z.string().datetime().openapi({
                  description: "수정일",
                  example: "2023-01-01T00:00:00.000Z",
                }),
              }).openapi({ type: 'object' }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      401: { description: "인증 실패" },
      404: { description: "사용자를 찾을 수 없음" },
    },
  });

  app.openapi(getUserProfileRoute, (c) => getUserProfile(c));

  const updateUserProfileRoute = createRoute({
    method: "put",
    path: "/profile",
    summary: "프로필 수정",
    description: "사용자의 프로필 이름 또는 사진을 수정합니다.",
    tags: ["사용자"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              userName: z.string().min(1).max(50).openapi({
                description: "새로운 프로필 이름",
                example: "새로운 닉네임",
              }),
              picture: z.string().url().openapi({
                description: "새로운 프로필 사진 URL",
                example: "https://example.com/new-profile.jpg",
              }),
            }).openapi({ type: 'object' }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "프로필 수정 성공",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean().openapi({
                description: "성공 여부",
                example: true,
              }),
              message: z.string().openapi({
                description: "성공 메시지",
                example: "프로필이 성공적으로 수정되었습니다.",
              }),
              user: z.object({
                프로필이름: z.string().openapi({
                  description: "수정된 프로필 이름",
                  example: "새로운 닉네임",
                }),
                프로필사진: z.string().openapi({
                  description: "수정된 프로필 사진 URL",
                  example: "https://example.com/new-profile.jpg",
                }),
              }).openapi({ type: 'object' }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      400: { description: "잘못된 요청" },
      401: { description: "인증 실패" },
      404: { description: "사용자를 찾을 수 없음" },
    },
  });

  app.openapi(updateUserProfileRoute, (c) => updateUserProfile(c));

  return app;
}
