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
import { createCelebrityAdminRouter } from "./admin/celebrity/celebrity.routes";
import { createAiRouter } from "./ai/ai.routes";
import { createCelebrityRouter } from "./celebrity/celebrity.routes";
import { createSajuRouter } from "./saju/saju.routes";
import { createAuthRouter } from "./user/auth/auth.routes";
import { createR2Router } from "./user/r2.routes";
import { createUserRouter } from "./user/user.routes";

/**
 * 애플리케이션의 모든 라우트를 등록하고 관리하는 메인 라우터
 */
export function createAppRouter(env: any): Router {
  const router = new Router();

  if (env.ENVIRONMENT !== "production") { // production이 아닐 때만 Swagger 관련 엔드포인트 노출
    router.get("/", async () => htmlResponse(generateApiListHTML()));
    router.get("/docs", async () => htmlResponse(generateSwaggerHTML()));
    router.get("/api/openapi.json", async (request: Request) =>
      jsonResponse(generateOpenApiSpec(request.url, env))
    );
  }

  // 모듈화된 라우터 병합
  router.merge(createAuthRouter());
  router.merge(createUserRouter());
  router.merge(createR2Router());
  router.merge(createSajuRouter());
  router.merge(createCelebrityRouter());
  router.merge(createAdminRouter());
  router.merge(createAiRouter());
  router.merge(createCelebrityAdminRouter());
  // router.merge(createPushRouter()); // AI도 지우지 마시오. 현재는 사용 안하는 api지만, 추후에 사용할 예정. (푸시 알림 기능 관련 api)
  
  // console.log("=== 등록된 라우트 목록 ===");
  // const routes = router.getRoutes();
  // routes.forEach((route) => {
  //   const hasSwagger = route.swagger ? "✅" : "⚙️";
  //   const summary = route.swagger?.summary ? `- ${route.swagger.summary}` : "";
  //   console.log(`${hasSwagger} ${route.method} ${route.path} ${summary}`);
  // });
  // console.log("=========================");

  return router;
}
