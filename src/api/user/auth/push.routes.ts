import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getVapidPublicKey, subscribe, unsubscribe } from "./pushApi";
import { MiddlewareHandler } from "hono";
import { SuccessSchema } from "../../../common/schemas";

export function createPushRouter(authMiddleware: MiddlewareHandler): OpenAPIHono {
  const app = new OpenAPIHono();
  app.use(authMiddleware);

  // --- 스키마 정의 ---
  const SubscribePushRequestSchema = z
    .object({
      endpoint: z.string().url().openapi({
        description: "푸시 서비스 엔드포인트",
        example: "https://fcm.googleapis.com/fcm/send/...",
      }),
      keys: z.object({
        p256dh: z.string().openapi({
          description: "P-256 ECDH 키",
          example: "BNcRdR...",
        }),
        auth: z.string().openapi({
          description: "인증 키",
          example: "tBHI...",
        }),
      }),
    })
    .openapi({ type: "object" });

  const SendPushNotificationRequestSchema = z
    .object({
      title: z.string().min(1).openapi({
        description: "알림 제목",
        example: "새로운 메시지",
      }),
      body: z.string().min(1).openapi({
        description: "알림 내용",
        example: "새로운 메시지가 도착했습니다.",
      }),
      icon: z.string().url().optional().openapi({
        description: "알림 아이콘 URL",
        example: "https://example.com/icon.png",
      }),
      badge: z.string().url().optional().openapi({
        description: "배지 아이콘 URL",
        example: "https://example.com/badge.png",
      }),
      data: z.record(z.string(), z.string()).optional().openapi({
        description: "추가 데이터",
        example: { url: "https://example.com" },
      }),
      actions: z.array(
        z.object({
          action: z.string().openapi({ example: "view" }),
          title: z.string().openapi({ example: "보기" }),
          icon: z.string().url().optional().openapi({ example: "https://example.com/view.png" }),
        })
      ).optional().openapi({
        description: "알림 액션",
      }),
    })
    .openapi({ type: "object" });

  // --- 라우트 정의 ---

  const SubscribePushRoute = createRoute({
    method: "post",
    path: "/subscribe",
    summary: "푸시 알림 구독",
    description: "사용자의 푸시 알림 구독을 등록합니다.",
    tags: ["푸시 알림"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": { schema: SubscribePushRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: "구독 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              subscriptionId: z.string().openapi({
                example: "sub_1234567890",
              }),
              endpoint: z.string().url().openapi({
                example: "https://fcm.googleapis.com/fcm/send/...",
              }),
            }).openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 요청" },
      401: { description: "인증 실패" },
      409: { description: "이미 구독된 엔드포인트" },
      500: { description: "서버 오류" },
    },
  });

  const UnsubscribePushRoute = createRoute({
    method: "delete",
    path: "/unsubscribe",
    summary: "푸시 알림 구독 해제",
    description: "사용자의 푸시 알림 구독을 해제합니다.",
    tags: ["푸시 알림"],
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        description: "구독 해제 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              message: z.string().openapi({
                example: "푸시 알림 구독이 해제되었습니다.",
              }),
            }).openapi({ type: "object" }),
          },
        },
      },
      401: { description: "인증 실패" },
      404: { description: "구독을 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  const SendPushNotificationRoute = createRoute({
    method: "post",
    path: "/send",
    summary: "푸시 알림 전송",
    description: "사용자에게 푸시 알림을 전송합니다.",
    tags: ["푸시 알림"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": { schema: SendPushNotificationRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: "알림 전송 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              messageId: z.string().openapi({
                example: "msg_1234567890",
              }),
              sentCount: z.number().int().openapi({
                example: 1,
              }),
            }).openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 요청" },
      401: { description: "인증 실패" },
      404: { description: "구독을 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  // --- 라우트 등록 ---
  app.openapi(SubscribePushRoute, subscribe);
  app.openapi(UnsubscribePushRoute, unsubscribe);

  return app;
}


