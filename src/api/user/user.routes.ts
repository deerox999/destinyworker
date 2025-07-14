import { Context, Hono } from "hono";
import { getUserProfile, updateUserProfile } from "./userApi";

export function createUserRouter(): Hono {
  const app = new Hono();

  const getUserProfileHandler = (c: Context) => getUserProfile(c);
  app.get("/profile", getUserProfileHandler);
  getUserProfileHandler.swagger = {
    summary: "사용자 프로필 조회",
    description: "현재 로그인한 사용자의 프로필 정보를 조회합니다.",
    tags: ["사용자"],
    security: [{ BearerAuth: [] }],
    responses: {
      "200": {
        description: "프로필 조회 성공",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean" },
                user: {
                  type: "object",
                  properties: {
                    id: { type: "integer" },
                    이메일: { type: "string" },
                    이름: { type: "string" },
                    프로필이름: { type: "string" },
                    프로필사진: { type: "string" },
                    가입일: { type: "string", format: "date-time" },
                    수정일: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
        },
      },
      "401": { description: "인증 실패" },
      "404": { description: "사용자를 찾을 수 없음" },
    },
  };

  const updateUserProfileHandler = (c: Context) => updateUserProfile(c);
  app.put("/profile", updateUserProfileHandler);
  updateUserProfileHandler.swagger = {
    summary: "프로필 수정",
    description: "사용자의 프로필 이름 또는 사진을 수정합니다.",
    tags: ["사용자"],
    security: [{ BearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              userName: {
                type: "string",
                description: "새로운 프로필 이름 (1-50자)",
              },
              picture: {
                type: "string",
                description: "새로운 프로필 사진 URL",
              },
            },
          },
        },
      },
    },
    responses: {
      "200": {
        description: "프로필 수정 성공",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean" },
                message: { type: "string" },
                user: {
                  type: "object",
                  properties: {
                    프로필이름: { type: "string" },
                    프로필사진: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
      "400": { description: "잘못된 요청" },
      "401": { description: "인증 실패" },
      "404": { description: "사용자를 찾을 수 없음" },
    },
  };

  return app;
}
