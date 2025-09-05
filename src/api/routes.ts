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
import { createPaymentRouter } from "./user/payment/payment.routes";
import { createR2Router } from "./common/r2.routes";
import { createSitemapRouter } from "./common/sitemapApi";
import { createUserRouter } from "./user/user.routes";
import { createHistoryRouter } from "./admin/history.routes";
import { createDreamRouter } from "./dream/dream.routes";
import { createPrismaClient } from "../common/prismaUtils";
import { logApi } from "../common/historyLogger";

/**
 * 애플리케이션의 모든 라우트를 등록하고 관리하는 메인 라우터 (Hono 기반)
 */
type AppEnv = {
  Bindings: {
    DB: any;
    GOOGLE_CLIENT_SECRET?: string;
  };
  Variables: {
    user?: { id: number; email: string; role: string };
    reqStartedAtMs?: number;
  };
};

export function createAppRouter(): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>();

  // 요청 시작 시각 저장(에러 로깅용 duration 계산)
  app.use("*", async (c, next) => {
    c.set("reqStartedAtMs", Date.now());
    await next();
  });

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
        app.getOpenAPIDocument({
          openapi: "3.0.0",
          info: apiConfig,
          servers: [
            { url: "https://destiny-91f.pages.dev", description: "Production" },
            { url: "http://localhost:9393", description: "Local Dev" },
          ],
          components: {
            securitySchemes: {
              BearerAuth: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "JWT",
              },
            },
          },
        } as any)
      );
    } catch (error: any) {
      console.error(`Error:`, error.message);
      console.error(`Error:`, error.data);
      return c.json({ error: "서버 내부 오류가 발생했습니다." }, 500);
    }
  });
  app.get("/swagger", swaggerUI({ url: "/openapi.json" }));

   // 전역 에러 로깅(에러만 기록)
  app.onError(async (err, c) => {
    try {
      const prisma = createPrismaClient(c.env.DB);
      const started = c.get("reqStartedAtMs");
      const durationMs = typeof started === "number" ? Date.now() - started : undefined;
      const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? undefined;
      const userAgent = c.req.header("user-agent") ?? undefined;
      const status = (err as any)?.status ?? 500;
      await logApi(prisma as any, {
        method: c.req.method,
        url: c.req.url,
        statusCode: status,
        durationMs,
        user: c.get("user"),
        params: undefined,
        ip,
        userAgent,
        notes: err?.message ?? "Unhandled error",
      });
      await (prisma as any).$disconnect?.();
    } catch (_) {}

    // 표준 에러 응답
    const status = (err as any)?.status ?? 500;
    const message = (err as any)?.message ?? "Internal Server Error";
    return c.json({ success: false, error: message }, status as any);
  });

  // 모듈화된 라우터 병합
  app.route("/api/auth", createAuthRouter());
  app.route("/api/R2", createR2Router(authMiddleware));
  app.route("/api/user", createUserRouter(authMiddleware));
  app.route("/api/payment", createPaymentRouter(authMiddleware));
  app.route("/api/saju-profiles", createSajuRouter(authMiddleware));
  app.route("/api/ai", createAiRouter(authMiddleware));
  app.route("/api/admin", createAdminRouter(authMiddleware));
  app.route("/api/celebrities", createCelebrityRouter(authMiddleware));
  app.route("/api/admin/celebrities", createCelebrityAdminRouter(authMiddleware));
  app.route("/api/community", createCommunityRouter());
  app.route("/api/history", createHistoryRouter());
  app.route("/api/sitemap", createSitemapRouter());
  app.route("/api/dream", createDreamRouter(authMiddleware));

  return app;
}
