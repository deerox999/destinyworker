import { registerAuthRoutes } from "../api/routes/authRoutes";
import { registerCelebrityProfileRoutes } from "../api/routes/celebrityProfileRoutes";
import { registerSajuProfileRoutes } from "../api/routes/sajuProfileRoutes";
import { registerAdminRoutes } from "../api/routes/adminRoutes";
import { Router } from "./router";
import { registerStaticRoutes } from "./staticRoutes";

/**
 * 애플리케이션의 모든 라우트를 등록하고 관리하는 메인 라우터
 */
export function createAppRouter(): Router {
  const router = new Router();
  registerStaticRoutes(router); // 정적 페이지 라우트 등록 (문서, API 스펙 등)
  registerAuthRoutes(router); // 인증 관련 라우트 등록
  registerSajuProfileRoutes(router); // 사주 프로필 관련 라우트 등록
  registerCelebrityProfileRoutes(router); // 유명인물 사주 프로필 관련 라우트 등록
  registerAdminRoutes(router); // 관리자 관련 라우트 등록
  
  // 디버깅: 등록된 라우트들 출력
  console.log("=== 등록된 라우트 목록 ===");
  const routes = router.getRoutes();
  routes.forEach(route => {
    console.log(`${route.method} ${route.path}`);
  });
  console.log("=========================");
  
  return router;
}