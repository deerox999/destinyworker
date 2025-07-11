import { Router } from "../common/class/router";
import {
  generateApiListHTML,
  generateSwaggerHTML,
} from "../common/swagger/html/swaggerUI";
import {
  generateOpenApiSpec,
  htmlResponse,
  jsonResponse,
} from "../common/utils";
import { createAdminRouter } from "./admin/admin.routes";
import { createAiRouter } from "./ai/ai.routes";
import { createCelebrityRouter } from "./celebrity/celebrity.routes";
import { createSajuRouter } from "./saju/saju.routes";
import { createAuthRouter } from "./user/auth/auth.routes";
import { createUserRouter } from "./user/user.routes";

/**
 * 애플리케이션의 모든 라우트를 등록하고 관리하는 메인 라우터
 */
export function createAppRouter(): Router {
  const router = new Router();

  // 정적 페이지
  router.get("/", async () => htmlResponse(generateApiListHTML()));
  router.get("/docs", async () => htmlResponse(generateSwaggerHTML()));
  router.get("/api/openapi.json", async (request: Request) =>
    jsonResponse(generateOpenApiSpec(request.url))
  );

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
    const hasSwagger = route.swagger ? "✅" : "⚙️";
    const summary = route.swagger?.summary ? `- ${route.swagger.summary}` : "";
    console.log(`${hasSwagger} ${route.method} ${route.path} ${summary}`);
  });
  console.log("=========================");

  return router;
}
