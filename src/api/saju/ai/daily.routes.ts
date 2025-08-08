import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { DailyFortune } from "./dailyFortuneApi";

export function createDailyRouter(): OpenAPIHono {
  const app = new OpenAPIHono();

  const DailyFortuneRoute = createRoute({
    method: "post",
    path: "/daily-fortune",
    summary: "무료 오늘의 운세",
    description: "사주 데이터로 오늘의 운세(점수, 설명, 차트)를 생성합니다.",
    tags: ["AI - 무료"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                sajuData: z.object({}).openapi({ description: "사주 데이터" }),
                options: z
                  .object({
                    i18n: z.string().optional().openapi({ example: "ko" }),
                    timezone: z
                      .string()
                      .optional()
                      .openapi({ example: "Asia/Seoul" }),
                  })
                  .optional(),
              })
              .openapi({ type: "object" }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "생성 성공",
        content: {
          "application/json": {
            schema: z
              .object({
                success: z.literal(true),
                data: z.any(),
                model: z.string().openapi({ example: "gemini-2.5-flash" }),
              })
              .openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 요청" },
      500: { description: "서버 오류" },
    },
  });

  app.openapi(DailyFortuneRoute, DailyFortune);

  return app;
}


