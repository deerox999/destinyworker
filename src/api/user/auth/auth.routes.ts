import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { googleLogin, getUserInfo, logout, refreshToken } from "./googleAuthApi";
import { SuccessSchema } from "../../../common/schemas";

export function createAuthRouter(): OpenAPIHono {
  const app = new OpenAPIHono(); 

  // Google 로그인 라우트
  const googleLoginRoute = createRoute({
    method: "post",
    path: "/google/login",
    summary: "Google OAuth 로그인",
    description: "Google OAuth를 통해 로그인하고 JWT 토큰을 발급받습니다.",
    tags: ["인증"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              token: z
                .string()
                .openapi({ description: "Google OAuth 토큰(id_token or access_token)", example: "your_google_id_token" }),
            }).openapi({ type: 'object' }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "로그인 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              token: z.string().openapi({ description: "JWT", example: "your_jwt_token" }),
              user: z.object({
                id: z.number().openapi({ example: 1 }),
                google_id: z.string().openapi({ example: "1234567890" }),
                email: z.string().email().openapi({ example: "user@example.com" }),
                name: z.string().openapi({ example: "홍길동" }),
                picture: z.string().url().openapi({ example: "https://example.com/profile.jpg" }),
                createdAt: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }),
                updatedAt: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }),
              }).openapi({ type: 'object' }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      400: { description: "Google 토큰 누락" },
      401: { description: "유효하지 않은 Google 토큰" },
      500: { description: "서버 오류" },
    },
  });

  app.openapi(googleLoginRoute, (c) => googleLogin(c));

  // 로그아웃 라우트
  const logoutRoute = createRoute({
    method: "post",
    path: "/logout",
    summary: "로그아웃",
    description: "현재 세션을 종료하고 토큰을 무효화합니다.",
    tags: ["인증"],
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        description: "로그아웃 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              message: z.string().openapi({ example: "로그아웃 성공" }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      401: { description: "인증 토큰이 없거나 세션이 유효하지 않음" },
    },
  });

  app.openapi(logoutRoute, (c) => logout(c));

  // 사용자 정보 조회 라우트
  const getUserInfoRoute = createRoute({
    method: "get",
    path: "/me",
    summary: "사용자 정보 조회",
    description: "현재 로그인한 사용자의 정보를 조회합니다.",
    tags: ["인증"],
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        description: "사용자 정보 조회 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              user: z.object({
                id: z.number().openapi({ example: 1 }),
                email: z.string().email().openapi({ example: "user@example.com" }),
                name: z.string().openapi({ example: "홍길동" }),
                userName: z.string().nullable().openapi({ example: "쾌남" }),
                picture: z.string().url().openapi({ example: "https://example.com/profile.jpg" }),
                role: z.string().openapi({ example: "user" }),
                point: z.number().openapi({ example: 3000 }),
                created_at: z.string().datetime().openapi({ example: "2023-01-01T00:00:00.000Z" }),
              }).openapi({ type: 'object' }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      401: { description: "유효하지 않은 토큰 또는 만료된 세션" },
      404: { description: "사용자를 찾을 수 없음" },
    },
  });

  app.openapi(getUserInfoRoute, (c) => getUserInfo(c));

  // 토큰 갱신 라우트
  const refreshTokenRoute = createRoute({
    method: "post",
    path: "/refresh",
    summary: "토큰 갱신",
    description: "JWT 토큰을 갱신합니다.",
    tags: ["인증"],
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        description: "토큰 갱신 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              token: z.string().openapi({ description: "새로운 JWT", example: "your_new_jwt_token" }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      401: { description: "유효하지 않은 토큰" },
    },
  });

  app.openapi(refreshTokenRoute, (c) => refreshToken(c));

  return app;
}
