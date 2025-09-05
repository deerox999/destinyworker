import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { MiddlewareHandler } from "hono";
import { dreamApi } from "./dreamApi";

export function createDreamRouter(authMiddleware: MiddlewareHandler): OpenAPIHono {
  const app = new OpenAPIHono();

  // 관리자 토큰만 허용(기존 verify + isAdmin 내부 검증 병행)
  app.use(authMiddleware);
  const GenerateRoute = createRoute({
    method: "post",
    path: "/dream/generate",
    summary: "[Admin] 꿈해몽 생성 후 저장",
    description: "지정한 언어들로 꿈해몽을 생성/번역하여 저장합니다. 요청한 언어만 생성합니다.",
    tags: ["Dream"],
    security: [{ BearerAuth: [] }],
    request: { body: { content: { "application/json": { schema: z.object({
      languages: z.array(z.string()).min(1).openapi({ example: ["ko", "en"] }),
      title: z.string().min(1).optional().openapi({ example: "거미를 보는 꿈이란?" }),
    }).openapi({ type: "object" }) } } } },
    responses: {
      200: {
        description: "성공",
        content: { "application/json": { schema: z.object({ success: z.literal(true), dreamId: z.string(), createdLanguages: z.array(z.string()) }).openapi({ type: "object" }) } },
      },
      400: { description: "잘못된 요청(languages 미제공, 분량/섹션 검증 실패 등)" },
      403: { description: "관리자 권한이 필요합니다." },
      409: { description: "유사도 중복(제목/내용)" },
    },
  });

  app.openapi(GenerateRoute, (c) => dreamApi.generateAndCreate(c));

  return app;
}


