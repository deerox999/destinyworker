import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getPointsApi, completePaymentApi } from "./paymentApi";
import { MiddlewareHandler } from "hono";
import { SuccessSchema } from "../../../common/schemas";

export function createPaymentRouter(
  authMiddleware: MiddlewareHandler
): OpenAPIHono {
  const app = new OpenAPIHono();
  app.use(authMiddleware);

  // 포인트 조회 라우트
  const getPointsRoute = createRoute({
    method: "get",
    path: "/points",
    summary: "포인트 조회",
    description: "현재 사용자의 포인트를 조회합니다.",
    tags: ["결제"],
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        description: "포인트 조회 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              data: z
                .object({
                  currentPoints: z.number().openapi({
                    description: "현재 포인트",
                    example: 1000,
                  }),
                })
                .openapi({ type: "object" }),
            }).openapi({ type: "object" }),
          },
        },
      },
      401: { description: "인증 실패" },
    },
  });

  // 결제 완료 라우트
  const completePaymentRoute = createRoute({
    method: "post",
    path: "/complete",
    summary: "결제 완료 처리",
    description: "결제 완료 후 포인트를 증감 처리합니다.",
    tags: ["결제"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                amount: z.number().positive().openapi({
                  description: "처리할 포인트 금액",
                  example: 100,
                }),
                description: z.string().min(1).openapi({
                  description: "포인트 처리 사유",
                  example: "포인트 충전",
                }),
                type: z.enum(["CREDIT", "DEBIT"]).default("CREDIT").openapi({
                  description: "처리 타입 (CREDIT: 증가, DEBIT: 차감)",
                  example: "CREDIT",
                }),
                reference: z.string().optional().openapi({
                  description: "참조 정보",
                  example: "payment_123",
                }),
              })
              .openapi({ type: "object" }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "결제 완료 처리 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              data: z
                .object({
                  type: z.enum(["CREDIT", "DEBIT"]).openapi({
                    description: "처리 타입",
                    example: "CREDIT",
                  }),
                  amount: z.number().openapi({
                    description: "처리된 포인트 금액",
                    example: 100,
                  }),
                  newTotalPoints: z.number().optional().openapi({
                    description: "새로운 총 포인트 (CREDIT인 경우)",
                    example: 1100,
                  }),
                  remainingPoints: z.number().optional().openapi({
                    description: "잔여 포인트 (DEBIT인 경우)",
                    example: 950,
                  }),
                })
                .openapi({ type: "object" }),
            }).openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 요청 또는 포인트 부족" },
      401: { description: "인증 실패" },
    },
  });

  app.openapi(getPointsRoute, (c) => getPointsApi(c));
  app.openapi(completePaymentRoute, (c) => completePaymentApi(c));

  return app;
}
