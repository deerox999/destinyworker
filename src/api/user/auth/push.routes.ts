import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getVapidPublicKey, subscribe, unsubscribe } from "./pushApi";

import { MiddlewareHandler } from "hono";
import { SuccessSchema } from "../../../common/schemas";

export function createPushRouter(authMiddleware: MiddlewareHandler): OpenAPIHono {
  const app = new OpenAPIHono();

  // --- 스키마 정의 ---
  const PushSubscriptionSchema = z.object({
    endpoint: z.string().url().openapi({ description: "푸시 서비스 엔드포인트", example: "https://fcm.googleapis.com/fcm/send/example" }),
    keys: z.object({
      p256dh: z.string().openapi({ description: "P-256 DH 공개 키", example: "BP_example_key" }),
      auth: z.string().openapi({ description: "인증 시크릿", example: "example_auth_secret" }),
    }).openapi({ type: 'object' }),
  }).openapi({ type: 'object' });

  // --- 라우트 정의 ---
  const getVapidPublicKeyRoute = createRoute({
    method: "get",
    path: "/vapid-public-key",
    summary: "VAPID 공개 키 조회",
    description: "웹 푸시 구독에 필요한 VAPID 공개 키를 반환합니다.",
    tags: ["푸시"],
    responses: {
      200: {
        description: "공개 키 조회 성공",
        content: {
          "application/json": {
            schema: z.object({
              publicKey: z.string().openapi({ example: "your_vapid_public_key" }),
            }).openapi({ type: 'object' }),
          },
        },
      },
      500: { description: "서버에 VAPID 키가 설정되지 않음" },
    },
  });

  const subscribeRoute = createRoute({
    method: "post",
    path: "/subscribe",
    summary: "푸시 구독 정보 저장",
    description: "클라이언트의 PushSubscription 객체를 서버에 저장합니다.",
    tags: ["푸시"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: PushSubscriptionSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: "구독 정보 저장 성공",
        content: {
          "application/json": {
            schema: SuccessSchema,
          },
        },
      },
      200: {
        description: "이미 구독중",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({ message: z.string().openapi({ example: "이미 구독중입니다." }) }).openapi({ type: 'object' }),
          },
        },
      },
      400: { description: "잘못된 구독 정보" },
      401: { description: "인증 실패" },
      500: { description: "서버 오류" },
    },
  });

  const unsubscribeRoute = createRoute({
    method: "post",
    path: "/unsubscribe",
    summary: "푸시 구독 정보 삭제",
    description: "서버에 저장된 클라이언트의 PushSubscription 객체를 삭제합니다.",
    tags: ["푸시"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              endpoint: z.string().url().openapi({ description: "푸시 서비스 엔드포인트", example: "https://fcm.googleapis.com/fcm/send/example" }),
            }).openapi({ type: 'object' }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "구독 정보 삭제 성공",
        content: {
          "application/json": {
            schema: SuccessSchema,
          },
        },
      },
      400: { description: "endpoint 누락" },
      401: { description: "인증 실패" },
      404: { description: "구독 정보를 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  // 라우트 등록
  app.openapi(getVapidPublicKeyRoute, (c) => getVapidPublicKey(c));
  app.use("/subscribe", authMiddleware);
  app.use("/unsubscribe", authMiddleware);
  app.openapi(subscribeRoute, (c) => subscribe(c));
  app.openapi(unsubscribeRoute, (c) => unsubscribe(c));

  return app;
}
