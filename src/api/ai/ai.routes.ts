import { OpenAPIHono } from "@hono/zod-openapi";
import { MiddlewareHandler } from "hono";
import { createAnalysisRouter } from "./analysis.routes";
import { createRagRouter } from "./rag.routes";
import { createChatRouter } from "./chat.routes";

export function createAiRouter(authMiddleware: MiddlewareHandler): OpenAPIHono {
  const app = new OpenAPIHono();

  // 분리된 라우터들을 통합
  app.route("/", createAnalysisRouter(authMiddleware));
  app.route("/", createRagRouter(authMiddleware));
  app.route("/", createChatRouter(authMiddleware));

  return app;
}
