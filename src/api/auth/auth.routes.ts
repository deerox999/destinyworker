import { Router } from "../../common/router";
import { googleAuthApiHandlers } from "./googleAuthApi";

export function createAuthRouter(): Router {
  const router = new Router();

  router.post('/api/auth/google/login', googleAuthApiHandlers.googleLogin, {
    summary: 'Google OAuth 로그인',
    description: 'Google OAuth를 통해 로그인하고 JWT 토큰을 발급받습니다.',
    tags: ['인증'],
    auth: false,
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              token: { type: 'string', description: 'Google OAuth 토큰(id_token or access_token)' }
            },
            required: ['token']
          }
        }
      },
      responses: {
        "200": {
          description: "로그인 성공",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  token: { type: "string", description: "JWT" },
                  user: {
                    type: "object",
                    properties: {
                      id: { type: "integer" },
                      google_id: { type: "string" },
                      email: { type: "string" },
                      name: { type: "string" },
                      picture: { type: "string" },
                      created_at: { type: "string", format: "date-time" },
                      updated_at: { type: "string", format: "date-time" }
                    }
                  }
                }
              }
            }
          }
        },
        "400": { description: "Google 토큰 누락" },
        "401": { description: "유효하지 않은 Google 토큰" },
        "500": { description: "서버 오류" }
      }
    }
  });

  router.post('/api/auth/logout', googleAuthApiHandlers.logout, {
    summary: '로그아웃',
    description: '현재 세션을 종료하고 토큰을 무효화합니다.',
    tags: ['인증'],
    auth: true,
    responses: {
      "200": {
        description: "로그아웃 성공",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean" },
                message: { type: "string" }
              }
            }
          }
        }
      },
      "401": { description: "인증 토큰이 없거나 세션이 유효하지 않음" }
    }
  });

  router.get('/api/auth/me', googleAuthApiHandlers.getUserInfo, {
    summary: '사용자 정보 조회',
    description: '현재 로그인한 사용자의 정보를 조회합니다.',
    tags: ['인증'],
    auth: true,
    responses: {
      "200": {
        description: "사용자 정보 조회 성공",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                user: {
                  type: "object",
                  properties: {
                    id: { type: "integer" },
                    email: { type: "string" },
                    name: { type: "string" },
                    picture: { type: "string" },
                    created_at: { type: "string", format: "date-time" }
                  }
                }
              }
            }
          }
        }
      },
      "401": { description: "유효하지 않은 토큰 또는 만료된 세션" },
      "404": { description: "사용자를 찾을 수 없음" }
    }
  });

  router.post('/api/auth/refresh', googleAuthApiHandlers.refreshToken, {
    summary: '토큰 갱신',
    description: 'JWT 토큰을 갱신합니다.',
    tags: ['인증'],
    auth: true,
    responses: {
      "200": {
        description: "토큰 갱신 성공",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean" },
                token: { type: "string", description: "새로운 JWT" }
              }
            }
          }
        }
      },
      "401": { description: "유효하지 않은 토큰" }
    }
  });

  return router;
} 