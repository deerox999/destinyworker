import { adminApiHandlers } from "../api/adminApi";
import { celebrityRequestApiHandlers } from "../api/celebrityRequestApi";
import { Router } from "./router";

import DestinyTellerApi from "../api/ai/DestinyTellerApi";
import { generateApiListHTML, generateSwaggerHTML } from "../html/swaggerUI";
import { openApiSpec } from "../openapi";
import { registerAuthRoutes } from "./routes/authRoutes";
import { registerCelebrityProfileRoutes } from "./routes/celebrityProfileRoutes";
import { registerSajuProfileRoutes } from "./routes/sajuProfileRoutes";
import { htmlResponse, jsonResponse } from "./utils";

/**
 * 애플리케이션의 모든 라우트를 등록하고 관리하는 메인 라우터
 */
export function createAppRouter(): Router {
  const router = new Router();
  // 메인 페이지 - API 목록 표시
  router.get('/', async (request, env) => htmlResponse(generateApiListHTML()));
  // API 문서 페이지 - Swagger UI
  router.get('/docs', async (request, env) => htmlResponse(generateSwaggerHTML()));
  // OpenAPI 스펙 JSON - API 스키마 정의
  router.get('/api/openapi.json', async (request, env) => jsonResponse(openApiSpec));

  registerAuthRoutes(router); // 인증 관련 라우트 등록
  registerSajuProfileRoutes(router); // 사주 프로필 관련 라우트 등록
  registerCelebrityProfileRoutes(router); // 유명인물 사주 프로필 관련 라우트 등록
  
  // 유명인물 요청 생성
  router.post("/api/celebrities/request", celebrityRequestApiHandlers.createCelebrityRequest);
  // 유명인물 요청 목록 조회 (관리자용)
  router.get("/api/celebrities/requests", celebrityRequestApiHandlers.getCelebrityRequests);

  // 가입한 유저 목록 조회 (페이지네이션, 검색 지원)
  router.get("/api/admin/users", adminApiHandlers.getUsers);
  // 특정 유저의 프로필 조회
  router.get("/api/admin/users/:userId/profiles", adminApiHandlers.getUserProfiles);
  // 전체 통계 정보 조회
  router.get("/api/admin/stats", adminApiHandlers.getAdminStats);
  
  // 🌟 새로운 전문적인 상세 사주 풀이 API
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
