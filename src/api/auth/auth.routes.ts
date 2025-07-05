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
              code: { type: 'string', description: 'Google OAuth 인증 코드' },
              redirectUri: { type: 'string', description: '리다이렉트 URI' }
            },
            required: ['code', 'redirectUri']
          }
        }
      }
    }
  });

  router.post('/api/auth/logout', googleAuthApiHandlers.logout, {
    summary: '로그아웃',
    description: '현재 세션을 종료하고 토큰을 무효화합니다.',
    tags: ['인증'],
    auth: true
  });

  router.get('/api/auth/me', googleAuthApiHandlers.getUserInfo, {
    summary: '사용자 정보 조회',
    description: '현재 로그인한 사용자의 정보를 조회합니다.',
    tags: ['인증'],
    auth: true
  });

  router.post('/api/auth/refresh', googleAuthApiHandlers.refreshToken, {
    summary: '토큰 갱신',
    description: 'JWT 토큰을 갱신합니다.',
    tags: ['인증'],
    auth: true
  });

  return router;
} 