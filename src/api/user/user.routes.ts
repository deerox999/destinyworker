import { Router } from "../../common/router";
import { userApiHandlers } from "./userApi";

export function createUserRouter(): Router {
  const router = new Router();

  router.get('/api/user/profile', userApiHandlers.getUserProfile, {
    summary: '사용자 프로필 조회',
    description: '현재 로그인한 사용자의 프로필 정보를 조회합니다.',
    tags: ['사용자'],
    auth: true
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
              프로필이름: { type: 'string', description: '새로운 프로필 이름 (1-50자)' }
            },
            required: ['프로필이름']
          }
        }
      }
    }
  });

  return router;
} 