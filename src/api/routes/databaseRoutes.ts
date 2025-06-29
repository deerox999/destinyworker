import { Router } from '../../common/router';
import { databaseApiHandlers } from '../databaseApi';

/**
 * 데이터베이스 관련 API 라우트들을 등록합니다
 */
export function registerDatabaseRoutes(router: Router) {
  // 댓글 조회 API
  router.get('/api/comments', async (request, env) => {
    return await databaseApiHandlers.getComments(request, env);
  });

  // JSON 데이터 저장 API
  router.post('/api/json', async (request, env) => {
    return await databaseApiHandlers.saveJson(request, env);
  });

  // JSON 데이터 조회 API (파라미터 사용)
  router.get('/api/json/:userId', async (request, env, params) => {
    const userId = params?.userId;
    if (!userId) {
      return new Response(JSON.stringify({ error: "userId가 필요합니다." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    return await databaseApiHandlers.getJson(request, env, userId);
  });
} 