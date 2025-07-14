import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  googleLogin,
  getUserInfo,
  logout,
  refreshToken,
} from "./googleAuthApi";

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
                .describe("Google OAuth 토큰(id_token or access_token)"),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "로그인 성공",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              token: z.string().describe("JWT"),
              user: z.object({
                id: z.number(),
                google_id: z.string(),
                email: z.string().email(),
                name: z.string(),
                picture: z.string().url(),
                createdAt: z.string().datetime(),
                updatedAt: z.string().datetime(),
              }),
            }),
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
            schema: z.object({
              success: z.boolean(),
              message: z.string(),
            }),
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
            schema: z.object({
              user: z.object({
                id: z.number(),
                email: z.string().email(),
                name: z.string(),
                picture: z.string().url(),
                createdAt: z.string().datetime(),
              }),
            }),
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
            schema: z.object({
              success: z.boolean(),
              token: z.string().describe("새로운 JWT"),
            }),
          },
        },
      },
      401: { description: "유효하지 않은 토큰" },
    },
  });

  app.openapi(refreshTokenRoute, (c) => refreshToken(c));

  return app;
}
