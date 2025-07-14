import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
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
export function createAppRouter(): OpenAPIHono {
  const app = new OpenAPIHono();

  const apiConfig = {
    title: "Destiny Worker API",
    version: "1.0.0",
    description: "Cloudflare Workers 기반의 사주/운세 서비스 API 문서",
  };

  // OpenAPI 문서 생성 및 Swagger UI 제공
  app.get("/openapi.json", (c) => {
    try {
      console.log(`test1 : `, apiConfig);
      console.log(
        `test2 : `,
        app.getOpenAPIDocument({ openapi: "3.0.0", info: apiConfig })
      );
      return c.json(
        app.getOpenAPIDocument({ openapi: "3.0.0", info: apiConfig })
      );
    } catch (error) {
      console.error(`Error:`, error);
      return c.json({ error: "서버 내부 오류가 발생했습니다." }, 500);
    }
  });
  app.get("/swagger", swaggerUI({ url: "/openapi.json" }));

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
