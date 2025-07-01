import { Router } from '../router';
import { googleAuthApiHandlers } from '../../api/googleAuthApi';

/**
 * 인증 관련 API 라우트들을 등록합니다
 */
export function registerAuthRoutes(router: Router) {
  // Google OAuth 로그인 API
  router.post('/api/auth/google/login', async (request, env) => {
    return await googleAuthApiHandlers.googleLogin(request, env);
  });

  // 로그아웃 API
  router.post('/api/auth/logout', async (request, env) => {
    return await googleAuthApiHandlers.logout(request, env);
  });

  // 사용자 정보 조회 API
  router.get('/api/auth/me', async (request, env) => {
    return await googleAuthApiHandlers.getUserInfo(request, env);
  });

  // 토큰 갱신 API
  router.post('/api/auth/refresh', async (request, env) => {
    return await googleAuthApiHandlers.refreshToken(request, env);
  });
} 