import { adminApiHandlers } from "../api/adminApi";
import { celebrityRequestApiHandlers } from "../api/celebrityRequestApi";
import { celebrityProfileApiHandlers } from "../api/celebrityProfileApi";
import { sajuProfileApiHandlers } from "../api/sajuProfileApi";
import { googleAuthApiHandlers } from "../api/googleAuthApi";
import { Router } from "./router";

import DestinyTellerApi from "../api/ai/DestinyTellerApi";
import { generateApiListHTML, generateSwaggerHTML } from "../html/swaggerUI";
import { openApiSpec } from "../openapi";
import { htmlResponse, jsonResponse } from "./utils";

/**
 * 애플리케이션의 모든 라우트를 등록하고 관리하는 메인 라우터
 */
export function createAppRouter(): Router {
  const router = new Router();
  
  // 정적 페이지
  router.get('/', async (request, env) => htmlResponse(generateApiListHTML()));
  router.get('/docs', async (request, env) => htmlResponse(generateSwaggerHTML()));
  router.get('/api/openapi.json', async (request, env) => jsonResponse(openApiSpec));

  // 인증 관련 라우트
  router.post('/api/auth/google/login', googleAuthApiHandlers.googleLogin);
  router.post('/api/auth/logout', googleAuthApiHandlers.logout);
  router.get('/api/auth/me', googleAuthApiHandlers.getUserInfo);
  router.post('/api/auth/refresh', googleAuthApiHandlers.refreshToken);

  // 사주 프로필 관련 라우트
  router.get('/api/saju-profiles', sajuProfileApiHandlers.getSajuProfiles);
  router.post('/api/saju-profiles', sajuProfileApiHandlers.createSajuProfile);
  router.get('/api/saju-profiles/:id', sajuProfileApiHandlers.getSajuProfile);
  router.put('/api/saju-profiles/:id', sajuProfileApiHandlers.updateSajuProfile);
  router.delete('/api/saju-profiles/:id', sajuProfileApiHandlers.deleteSajuProfile);

  // 유명인물 댓글 관련 라우트
  router.get('/api/celebrities/:id/comments', celebrityProfileApiHandlers.getCelebrityComments);
  router.post('/api/celebrities/:id/comments', celebrityProfileApiHandlers.createCelebrityComment);
  router.put('/api/celebrities/:id/comments/:commentId', celebrityProfileApiHandlers.updateCelebrityComment);
  router.delete('/api/celebrities/:id/comments/:commentId', celebrityProfileApiHandlers.deleteCelebrityComment);
  
  // 유명인물 요청 관련 라우트
  router.post("/api/celebrities/request", celebrityRequestApiHandlers.createCelebrityRequest);
  router.get("/api/celebrities/requests", celebrityRequestApiHandlers.getCelebrityRequests);

  // 관리자 관련 라우트
  router.get("/api/admin/users", adminApiHandlers.getUsers);
  router.get("/api/admin/users/:userId/profiles", adminApiHandlers.getUserProfiles);
  router.get("/api/admin/stats", adminApiHandlers.getAdminStats);
  
  // AI 관련 라우트
  router.post("/api/detailed-fortune-telling", async (request: Request, env: any) => await DestinyTellerApi.fetch(request, env));
  router.get("/api/ai-models", async (request: Request, env: any) => await DestinyTellerApi.fetch(request, env));
  
  console.log("=== 등록된 라우트 목록 ===");
  const routes = router.getRoutes();
  routes.forEach((route) => {
    console.log(`${route.method} ${route.path}`);
  });
  console.log("=========================");

  return router;
}
