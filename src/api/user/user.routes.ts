import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { updateUserProfile, updateConsent, deleteAccount } from "./userApi";

import { MiddlewareHandler } from "hono";
import { SuccessSchema } from "../../common/schemas";

export function createUserRouter(
  authMiddleware: MiddlewareHandler
): OpenAPIHono {
  const app = new OpenAPIHono();
  app.use(authMiddleware);

  const updateUserProfileRoute = createRoute({
    method: "put",
    path: "/profile",
    summary: "프로필 수정",
    description: "사용자의 프로필 이름 또는 사진을 수정합니다.",
    tags: ["사용자"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                userName: z.string().min(1).max(50).openapi({
                  description: "새로운 프로필 이름",
                  example: "새로운 닉네임",
                }),
                picture: z.string().url().openapi({
                  description: "새로운 프로필 사진 URL",
                  example: "https://example.com/new-profile.jpg",
                }),
              })
              .openapi({ type: "object" }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "프로필 수정 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              message: z.string().openapi({
                description: "성공 메시지",
                example: "프로필이 성공적으로 수정되었습니다.",
              }),
              user: z
                .object({
                  프로필이름: z.string().openapi({
                    description: "수정된 프로필 이름",
                    example: "새로운 닉네임",
                  }),
                  프로필사진: z.string().openapi({
                    description: "수정된 프로필 사진 URL",
                    example: "https://example.com/new-profile.jpg",
                  }),
                })
                .openapi({ type: "object" }),
            }).openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 요청" },
      401: { description: "인증 실패" },
      404: { description: "사용자를 찾을 수 없음" },
    },
  });

  app.openapi(updateUserProfileRoute, (c) => updateUserProfile(c));

  // 개인정보 동의 업데이트 라우트
  const updateConsentRoute = createRoute({
    method: "put",
    path: "/consent",
    summary: "개인정보 동의 업데이트",
    description: "사용자의 개인정보 동의 상태를 업데이트합니다.",
    tags: ["사용자"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                privacyConsent: z.boolean().optional().openapi({
                  description: "개인정보 수집 및 이용 동의 여부",
                  example: true,
                }),
                privacyConsentVersion: z.string().optional().openapi({
                  description: "개인정보 수집 및 이용 동의 버전",
                  example: "1.0",
                }),
                reportStorageConsent: z.boolean().optional().openapi({
                  description: "분석 리포트 저장 동의 여부",
                  example: true,
                }),
                reportStorageConsentVersion: z.string().optional().openapi({
                  description: "분석 리포트 저장 동의 버전",
                  example: "1.0",
                }),
              })
              .openapi({ type: "object" }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "동의 정보 업데이트 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              message: z.string().openapi({
                description: "성공 메시지",
                example: "동의 정보가 성공적으로 업데이트되었습니다.",
              }),
              consent: z
                .object({
                  개인정보동의: z.boolean().openapi({
                    description: "개인정보 수집 및 이용 동의 여부",
                    example: true,
                  }),
                  개인정보동의버전: z.string().openapi({
                    description: "개인정보 수집 및 이용 동의 버전",
                    example: "1.0",
                  }),
                  개인정보동의일시: z.string().datetime().nullable().openapi({
                    description: "개인정보 수집 및 이용 동의 일시",
                    example: "2023-01-01T00:00:00.000Z",
                  }),
                  리포트저장동의: z.boolean().openapi({
                    description: "분석 리포트 저장 동의 여부",
                    example: true,
                  }),
                  리포트저장동의버전: z.string().openapi({
                    description: "분석 리포트 저장 동의 버전",
                    example: "1.0",
                  }),
                  리포트저장동의일시: z.string().datetime().nullable().openapi({
                    description: "분석 리포트 저장 동의 일시",
                    example: "2023-01-01T00:00:00.000Z",
                  }),
                  최종동의일시: z.string().datetime().nullable().openapi({
                    description: "전체 동의 일시",
                    example: "2023-01-01T00:00:00.000Z",
                  }),
                  동의상태: z.string().openapi({
                    description: "동의 상태 (none, partial, complete)",
                    example: "complete",
                  }),
                })
                .openapi({ type: "object" }),
            }).openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 요청" },
      401: { description: "인증 실패" },
      404: { description: "사용자를 찾을 수 없음" },
    },
  });

  app.openapi(updateConsentRoute, (c) => updateConsent(c));

  // 회원 탈퇴 라우트
  const deleteAccountRoute = createRoute({
    method: "delete",
    path: "/account",
    summary: "회원탈퇴",
    description:
      "로그인/가입된 사용자의 모든 기록을 삭제하고 계정을 제거합니다.",
    tags: ["사용자"],
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        description: "회원탈퇴 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              message: z.string().openapi({
                description: "성공 메시지",
                example:
                  "회원탈퇴가 완료되었습니다. 모든 기록이 삭제되었습니다.",
              }),
            }).openapi({ type: "object" }),
          },
        },
      },
      401: { description: "인증 실패" },
      500: { description: "서버 오류" },
    },
  });

  app.openapi(deleteAccountRoute, (c) => deleteAccount(c));

  return app;
}
