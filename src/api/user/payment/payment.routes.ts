import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { MiddlewareHandler } from "hono";
import { SuccessSchema } from "../../../common/schemas";
import { completePaymentApi, getPointsApi, initiateOrderApi, nicepayApproveApi, refundSubscriptionApi, subscribeApi, nicepayCancelPlaceholderApi, nicepayPartialCancelPlaceholderApi, nicepayRefundPlaceholderApi } from "./paymentApi";

export function createPaymentRouter(authMiddleware: MiddlewareHandler): OpenAPIHono {
  const app = new OpenAPIHono();
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

  // 결제 주문 생성(서버 생성 orderId)
  const initiateOrderRoute = createRoute({
    method: "post",
    path: "/orders/initiate",
    summary: "결제 주문 생성",
    description: "서버가 orderId를 생성하고 결제용 Payment 레코드를 생성합니다.",
    tags: ["결제"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                amount: z.number().int().positive().openapi({ description: "결제 금액(KRW)", example: 5000 }),
                currency: z.string().default("KRW").openapi({ description: "통화", example: "KRW" }),
              })
              .openapi({ type: "object" }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "주문 생성 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              data: z
                .object({
                  orderId: z.string().openapi({ description: "주문 ID", example: "ord_20250101_abcdef" }),
                  amount: z.number().openapi({ description: "금액", example: 5000 }),
                  currency: z.string().openapi({ description: "통화", example: "KRW" }),
                  status: z.string().openapi({ description: "상태", example: "created" }),
                })
                .openapi({ type: "object" }),
            }).openapi({ type: "object" }),
          },
        },
      },
      401: { description: "인증 실패" },
      400: { description: "잘못된 요청" },
    },
  });
  app.openapi(initiateOrderRoute, (c) => initiateOrderApi(c));

  // 구독 구매 라우트
  const subscribeRoute = createRoute({
    method: "post",
    path: "/subscribe",
    summary: "구독 구매",
    description: "개월 수만큼 30일씩 구독을 연장합니다 (최대 12개월).",
    tags: ["결제"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                months: z
                  .number()
                  .int()
                  .min(1)
                  .max(12)
                  .default(1)
                  .openapi({ description: "연장 개월 수 (1~12)", example: 1 }),
              })
              .openapi({ type: "object" }),
          },
        },
      },
    },
    responses: {
      200: { description: "구독 구매 성공" },
      400: { description: "포인트 부족 또는 잘못된 요청" },
      401: { description: "인증 실패" },
    },
  });

  // 구독 환불 라우트
  const refundSubscriptionRoute = createRoute({
    method: "post",
    path: "/subscribe/refund",
    summary: "구독 환불",
    description: "남은 기간 중 30일 단위로 환불합니다. 남은 기간이 30일뿐이면 환불 불가.",
    tags: ["결제"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                months: z
                  .number()
                  .int()
                  .min(1)
                  .optional()
                  .openapi({ description: "환불 개월 수 (생략 시 환불 가능한 최대치)", example: 1 }),
              })
              .openapi({ type: "object" }),
          },
        },
      },
    },
    responses: {
      200: { description: "구독 환불 성공" },
      400: { description: "환불 불가 또는 잘못된 요청" },
      401: { description: "인증 실패" },
    },
  });

  app.openapi(subscribeRoute, (c) => subscribeApi(c));
  app.openapi(refundSubscriptionRoute, (c) => refundSubscriptionApi(c));
  // 나이스페이 결제 승인 라우트
  app.post("/nice/approve", (c) => nicepayApproveApi(c));

  // 나이스페이 취소/부분취소/환불 (빈 엔드포인트, 추후 구현)
  const niceCancelRoute = createRoute({
    method: "post",
    path: "/nice/cancel",
    summary: "나이스페이 취소(빈 구현)",
    description: "취소 로직은 추후 구현 예정.",
    tags: ["결제"],
    security: [{ BearerAuth: [] }],
    responses: { 501: { description: "Not Implemented" } },
  });
  const nicePartialCancelRoute = createRoute({
    method: "post",
    path: "/nice/partial-cancel",
    summary: "나이스페이 부분취소(빈 구현)",
    description: "부분취소 로직은 추후 구현 예정.",
    tags: ["결제"],
    security: [{ BearerAuth: [] }],
    responses: { 501: { description: "Not Implemented" } },
  });
  const niceRefundRoute = createRoute({
    method: "post",
    path: "/nice/refund",
    summary: "나이스페이 환불(빈 구현)",
    description: "환불 로직은 추후 구현 예정.",
    tags: ["결제"],
    security: [{ BearerAuth: [] }],
    responses: { 501: { description: "Not Implemented" } },
  });
  app.openapi(niceCancelRoute, (c) => nicepayCancelPlaceholderApi(c));
  app.openapi(nicePartialCancelRoute, (c) => nicepayPartialCancelPlaceholderApi(c));
  app.openapi(niceRefundRoute, (c) => nicepayRefundPlaceholderApi(c));
  return app;
}