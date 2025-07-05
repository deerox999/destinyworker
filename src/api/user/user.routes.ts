import { Router } from "../../common/router";
import { userApiHandlers } from "./userApi";

export function createUserRouter(): Router {
  const router = new Router();

  router.get('/api/user/profile', userApiHandlers.getUserProfile, {
    summary: '사용자 프로필 조회',
    description: '현재 로그인한 사용자의 프로필 정보를 조회합니다.',
    tags: ['사용자'],
    auth: true,
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
                    "이메일": { type: "string" },
                    "이름": { type: "string" },
                    "프로필이름": { type: "string" },
                    "프로필사진": { type: "string" },
                    "가입일": { type: "string", format: "date-time" },
                    "수정일": { type: "string", format: "date-time" }
                  }
                }
              }
            }
          }
        }
      },
      "401": { description: "인증 실패" },
      "404": { description: "사용자를 찾을 수 없음" }
    }
  });

  router.put('/api/user/profile/name', userApiHandlers.updateUserName, {
    summary: '프로필 이름 수정',
    description: '사용자의 프로필 이름을 수정합니다.',
    tags: ['사용자'],
    auth: true,
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              userName: { type: 'string', description: '새로운 프로필 이름 (1-50자)' }
            },
            required: ['userName']
          }
        }
      }
    },
    responses: {
      "200": {
        description: "이름 변경 성공",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean" },
                message: { type: "string" },
                "프로필이름": { type: "string" }
              }
            }
          }
        }
      },
      "400": { description: "잘못된 프로필 이름 형식" },
      "401": { description: "인증 실패" },
      "404": { description: "사용자를 찾을 수 없음" }
    }
  });

  return router;
} 