import { Router } from './router';
import { registerDatabaseRoutes } from '../api/routes/databaseRoutes';
import { registerAuthRoutes } from '../api/routes/authRoutes';
import { registerStaticRoutes } from './staticRoutes';

/**
 * 애플리케이션의 모든 라우트를 등록하고 관리하는 메인 라우터
 */
export function createAppRouter(): Router {
  const router = new Router();

  // 정적 페이지 라우트 등록 (문서, API 스펙 등)
  registerStaticRoutes(router);
  
  // 데이터베이스 관련 라우트 등록
  registerDatabaseRoutes(router);
  
  // 인증 관련 라우트 등록
  registerAuthRoutes(router);

  return router;
} 