import { Router } from "../../common/router";
import { sajuProfileApiHandlers } from "./sajuProfileApi";

export function createSajuRouter(): Router {
  const router = new Router();

  router.get('/api/saju-profiles', sajuProfileApiHandlers.getSajuProfiles, {
    summary: '내 사주 프로필 목록 조회',
    description: '현재 로그인한 사용자의 사주 프로필 목록을 조회합니다.',
    tags: ['사주 프로필'],
    auth: true
  });

  router.post('/api/saju-profiles', sajuProfileApiHandlers.createSajuProfile, {
    summary: '사주 프로필 생성',
    description: '새로운 사주 프로필을 생성합니다.',
    tags: ['사주 프로필'],
    auth: true,
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '이름' },
              birthDate: { type: 'string', format: 'date-time', description: '생년월일' },
              gender: { type: 'string', enum: ['male', 'female'], description: '성별' },
              birthPlace: { type: 'string', description: '출생지' }
            },
            required: ['name', 'birthDate', 'gender']
          }
        }
      }
    }
  });

  router.get('/api/saju-profiles/:id', sajuProfileApiHandlers.getSajuProfile, {
    summary: '사주 프로필 상세 조회',
    description: '특정 사주 프로필의 상세 정보를 조회합니다.',
    tags: ['사주 프로필'],
    auth: true,
    parameters: [
      {
        name: 'id',
        in: 'path',
        required: true,
        description: '사주 프로필 ID',
        schema: { type: 'string' }
      }
    ]
  });

  router.put('/api/saju-profiles/:id', sajuProfileApiHandlers.updateSajuProfile, {
    summary: '사주 프로필 수정',
    description: '기존 사주 프로필을 수정합니다.',
    tags: ['사주 프로필'],
    auth: true
  });

  router.delete('/api/saju-profiles/:id', sajuProfileApiHandlers.deleteSajuProfile, {
    summary: '사주 프로필 삭제',
    description: '사주 프로필을 삭제합니다.',
    tags: ['사주 프로필'],
    auth: true
  });

  return router;
} 