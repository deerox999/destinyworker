import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import { bearerAuth } from "hono/bearer-auth";
import { verifyJWT } from "../common/utils";
import { createAdminRouter } from "./admin/admin.routes";
import { createCelebrityAdminRouter } from "./admin/celebrity/celebrity.routes";
import { createAiRouter } from "./saju/ai/ai.routes";
import { createCelebrityRouter } from "./celebrity/celebrity.routes";
import { createCommunityRouter } from "./community/routes";
import { createSajuRouter } from "./saju/profile/saju.routes";
import { createAuthRouter } from "./user/auth/auth.routes";
import { createPushRouter } from "./user/auth/push.routes";
import { createPaymentRouter } from "./user/payment/payment.routes";
import { createR2Router } from "./user/r2.routes";
import { createUserRouter } from "./user/user.routes";

/**
 * 애플리케이션의 모든 라우트를 등록하고 관리하는 메인 라우터 (Hono 기반)
 */
export function createAppRouter(): OpenAPIHono {
  const app = new OpenAPIHono();

  const authMiddleware = bearerAuth({
    verifyToken: async (token, c) => {
      try {
        const payload = await verifyJWT(token, c.env.GOOGLE_CLIENT_SECRET);
        if (payload) {
          c.set("user", {
            id: payload.userId,
            email: payload.email,
            role: payload.role || "user",
          });
          return true;
        }
        return false;
      } catch (e) {
        console.error("Token verification failed:", e);
        return false;
      }
    },
  });

  const apiConfig = {
    title: "Destiny Worker API",
    version: "1.0.0",
    description: "Cloudflare Workers 기반의 사주/운세 서비스 API 문서",
  };

  // OpenAPI 문서 생성 및 Swagger UI 제공
  app.get("/openapi.json", (c) => {
    try {
      return c.json(
        app.getOpenAPIDocument({ openapi: "3.0.0", info: apiConfig })
      );
    } catch (error: any) {
      console.error(`Error:`, error.message);
      console.error(`Error:`, error.data);
      return c.json({ error: "서버 내부 오류가 발생했습니다." }, 500);
    }
  });
  app.get("/swagger", swaggerUI({ url: "/openapi.json" }));

  // 모듈화된 라우터 병합
  app.route("/api/auth", createAuthRouter());
  app.route("/api/R2", createR2Router(authMiddleware));
  app.route("/api/push", createPushRouter(authMiddleware));
  app.route("/api/user", createUserRouter(authMiddleware));
  app.route("/api/payment", createPaymentRouter(authMiddleware));
  app.route("/api/saju-profiles", createSajuRouter(authMiddleware));
  app.route("/api/ai", createAiRouter(authMiddleware));
  app.route("/api/admin", createAdminRouter(authMiddleware));
  app.route("/api/celebrities", createCelebrityRouter(authMiddleware));
  app.route("/api/admin/celebrities", createCelebrityAdminRouter(authMiddleware));
  app.route("/api/community", createCommunityRouter());

  return app;
}
