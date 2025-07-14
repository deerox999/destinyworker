import { Hono } from "hono";
import {
  generateApiListHTML,
  generateSwaggerHTML,
} from "../common/swagger/html/swaggerUI";
import { generateOpenApiSpec } from "../common/utils";
import { createAdminRouter } from "./admin/admin.routes";
import { createCelebrityAdminRouter } from "./admin/celebrity/celebrity.routes";
import { createAiRouter } from "./ai/ai.routes";
import { createCelebrityRouter } from "./celebrity/celebrity.routes";
import { createSajuRouter } from "./saju/saju.routes";
import { createAuthRouter } from "./user/auth/auth.routes";
import { createR2Router } from "./user/r2.routes";
import { createUserRouter } from "./user/user.routes";

/**
 * 애플리케이션의 모든 라우트를 등록하고 관리하는 메인 라우터 (Hono 기반)
 */
export function createAppRouter(): Hono {
  const app = new Hono();

  // if (env.ENVIRONMENT !== "production") { // production이 아닐 때만 Swagger 관련 엔드포인트 노출
  app.get("/", (c) => c.html(generateApiListHTML()));
  app.get("/docs", (c) => c.html(generateSwaggerHTML()));
  app.get("/api/openapi.json", (c) => {
    const openapiSpec = generateOpenApiSpec(c);
    return c.json(openapiSpec);
  });
// }

  // 모듈화된 라우터 병합
  app.route("/api/auth", createAuthRouter());
  app.route("/api/user", createUserRouter());
  app.route("/api/user", createR2Router());
  app.route("/api", createSajuRouter());
  app.route("/api/celebrities", createCelebrityRouter());
  app.route("/api/ai", createAiRouter());
  app.route("/api/admin", createAdminRouter());
  app.route("/api/admin", createCelebrityAdminRouter());
  // app.route("/api/push", createPushRouter()); // AI도 지우지 마시오. 현재는 사용 안하는 api지만, 추후에 사용할 예정. (푸시 알림 기능 관련 api)

  return app;
}
