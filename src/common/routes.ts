import { createAdminRouter } from "../api/admin/admin.routes";
import { createAiRouter } from "../api/ai/ai.routes";
import { createAuthRouter } from "../api/auth/auth.routes";
import { createCelebrityRouter } from "../api/celebrity/celebrity.routes";
import { createSajuRouter } from "../api/saju/saju.routes";
import { createUserRouter } from "../api/user/user.routes";
import { generateApiListHTML, generateSwaggerHTML } from "../html/swaggerUI";
import { Router } from "./router";
import { generateOpenApiSpec, htmlResponse, jsonResponse } from "./utils";

/**
 * 애플리케이션의 모든 라우트를 등록하고 관리하는 메인 라우터
 */
export function createAppRouter(): Router {
  const router = new Router();
  
  // 정적 페이지
  router.get('/', async () => htmlResponse(generateApiListHTML()));
  router.get('/docs', async () => htmlResponse(generateSwaggerHTML()));
  router.get('/api/openapi.json', async (request: Request) => jsonResponse(generateOpenApiSpec(request.url)));

  // 모듈화된 라우터 병합
  router.merge(createAuthRouter());
  router.merge(createUserRouter());
  router.merge(createSajuRouter());
  router.merge(createCelebrityRouter());
  router.merge(createAdminRouter());
  router.merge(createAiRouter());

  console.log("=== 등록된 라우트 목록 ===");
  const routes = router.getRoutes();
  routes.forEach((route) => {
    const hasSwagger = route.swagger ? '✅' : '⚙️';
    console.log(`${hasSwagger} ${route.method} ${route.path}`);
  });
  console.log("✅ = Swagger 메타데이터 있음, ⚙️ = 자동 생성");
  console.log("=========================");

  return router;
}
