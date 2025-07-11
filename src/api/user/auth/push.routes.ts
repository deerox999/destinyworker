import { Router } from "../../../common/class/router";
import { getVapidPublicKey, subscribe, unsubscribe } from "./pushApi";
/*
현재는 사용 안하는 api지만, 추후에 사용할 예정. (푸시 알림 기능 관련 api)
*/
export function createPushRouter(): Router {
  const router = new Router();

  router.get("/api/push/vapid-public-key", getVapidPublicKey, {
    summary: "VAPID 공개 키 조회",
    description: "웹 푸시 구독에 필요한 VAPID 공개 키를 반환합니다.",
    tags: ["푸시"],
    auth: false,
    responses: {
      "200": {
        description: "공개 키 조회 성공",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                publicKey: { type: "string" },
              },
            },
          },
        },
      },
      "500": { description: "서버에 VAPID 키가 설정되지 않음" },
    },
  });

  router.post("/api/push/subscribe", subscribe, {
    summary: "푸시 구독 정보 저장",
    description: "클라이언트의 PushSubscription 객체를 서버에 저장합니다.",
    tags: ["푸시"],
    auth: true,
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              endpoint: { type: "string" },
              keys: {
                type: "object",
                properties: {
                  p256dh: { type: "string" },
                  auth: { type: "string" },
                },
                required: ["p256dh", "auth"],
              },
            },
            required: ["endpoint", "keys"],
          },
        },
      },
    },
    responses: {
      "201": { description: "구독 정보 저장 성공" },
      "200": { description: "이미 구독중" },
      "400": { description: "잘못된 구독 정보" },
      "401": { description: "인증 실패" },
      "500": { description: "서버 오류" },
    },
  });

  router.post("/api/push/unsubscribe", unsubscribe, {
    summary: "푸시 구독 정보 삭제",
    description:
      "서버에 저장된 클라이언트의 PushSubscription 객체를 삭제합니다.",
    tags: ["푸시"],
    auth: true,
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              endpoint: { type: "string" },
            },
            required: ["endpoint"],
          },
        },
      },
    },
    responses: {
      "200": { description: "구독 정보 삭제 성공" },
      "400": { description: "endpoint 누락" },
      "401": { description: "인증 실패" },
      "404": { description: "구독 정보를 찾을 수 없음" },
      "500": { description: "서버 오류" },
    },
  });

  return router;
}
