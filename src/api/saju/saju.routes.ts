import { Router } from "../../common/router";
import { sajuProfileApiHandlers } from "./sajuProfileApi";

export function createSajuRouter(): Router {
  const router = new Router();

  router.get('/api/saju-profiles', sajuProfileApiHandlers.getSajuProfiles, {
    summary: '내 사주 프로필 목록 조회',
    description: '현재 로그인한 사용자의 사주 프로필 목록을 조회합니다.',
    tags: ['사주 프로필'],
    auth: true,
    responses: {
      "200": {
        description: "성공",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean" },
                profiles: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "integer" },
                      "이름": { type: "string" },
                      "년": { type: "string" },
                      "월": { type: "string" },
                      "일": { type: "string" },
                      "시간": { type: "string" },
                      "분": { type: "string" },
                      "달력": { type: "string", enum: ['양력', '음력'] },
                      "성별": { type: "string", enum: ['남자', '여자'] },
                      createdAt: { type: "string", format: "date-time" },
                      updatedAt: { type: "string", format: "date-time" }
                    }
                  }
                },
                count: { type: "integer" }
              }
            }
          }
        }
      },
      "401": { description: "인증 실패" },
      "500": { description: "서버 오류" }
    }
  });

  const sajuProfileSchema = {
    type: 'object',
    properties: {
      "이름": { type: 'string', description: '이름' },
      "년": { type: 'string', description: '출생년도 (YYYY)', pattern: '^\\d{4}$' },
      "월": { type: 'string', description: '출생월 (MM)', pattern: '^(0[1-9]|1[0-2])$' },
      "일": { type: 'string', description: '출생일 (DD)', pattern: '^(0[1-9]|[12]\\d|3[01])$' },
      "시간": { type: 'string', description: '출생시간 (HH, 00-23)', pattern: '^([01]\\d|2[0-3])$' },
      "분": { type: 'string', description: '출생분 (MM, 00-59)', pattern: '^[0-5]\\d$' },
      "달력": { type: 'string', enum: ['양력', '음력'], description: '달력 종류' },
      "성별": { type: 'string', enum: ['남자', '여자'], description: '성별' }
    },
    required: ['이름', '년', '월', '일', '달력', '성별']
  };

  router.post('/api/saju-profiles', sajuProfileApiHandlers.createSajuProfile, {
    summary: '사주 프로필 생성',
    description: '새로운 사주 프로필을 생성합니다.',
    tags: ['사주 프로필'],
    auth: true,
    requestBody: {
      required: true,
      content: {
        'application/json': { schema: sajuProfileSchema }
      }
    },
    responses: {
      "201": { 
        description: "생성 성공",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean" },
                id: { type: "integer" },
                message: { type: "string" }
              }
            }
          }
        }
      },
      "400": { description: "잘못된 데이터 형식" },
      "401": { description: "인증 실패" },
      "500": { description: "서버 오류" }
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
        schema: { type: 'integer' }
      }
    ],
    responses: {
      "200": {
        description: "성공",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean" },
                profile: {
                  type: "object",
                  properties: {
                    id: { type: "integer" },
                    "이름": { type: "string" },
                    "년": { type: "string" },
                    "월": { type: "string" },
                    "일": { type: "string" },
                    "시간": { type: "string" },
                    "분": { type: "string" },
                    "달력": { type: "string", enum: ['양력', '음력'] },
                    "성별": { type: "string", enum: ['남자', '여자'] },
                    createdAt: { type: "string", format: "date-time" },
                    updatedAt: { type: "string", format: "date-time" }
                  }
                }
              }
            }
          }
        }
      },
      "400": { description: "잘못된 ID" },
      "401": { description: "인증 실패" },
      "403": { description: "권한 없음" },
      "404": { description: "프로필을 찾을 수 없음" },
      "500": { description: "서버 오류" }
    }
  });

  router.put('/api/saju-profiles/:id', sajuProfileApiHandlers.updateSajuProfile, {
    summary: '사주 프로필 수정',
    description: '기존 사주 프로필을 수정합니다.',
    tags: ['사주 프로필'],
    auth: true,
    parameters: [
      {
        name: 'id',
        in: 'path',
        required: true,
        description: '사주 프로필 ID',
        schema: { type: 'integer' }
      }
    ],
    requestBody: {
      required: true,
      content: {
        'application/json': { schema: sajuProfileSchema }
      }
    },
    responses: {
      "200": {
        description: "수정 성공",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean" },
                message: { type: "string" }
              }
            }
          }
        }
      },
      "400": { description: "잘못된 데이터 형식 또는 ID" },
      "401": { description: "인증 실패" },
      "403": { description: "권한 없음" },
      "404": { description: "프로필을 찾을 수 없음" },
      "500": { description: "서버 오류" }
    }
  });

  router.delete('/api/saju-profiles/:id', sajuProfileApiHandlers.deleteSajuProfile, {
    summary: '사주 프로필 삭제',
    description: '사주 프로필을 삭제합니다.',
    tags: ['사주 프로필'],
    auth: true,
    parameters: [
      {
        name: 'id',
        in: 'path',
        required: true,
        description: '사주 프로필 ID',
        schema: { type: 'integer' }
      }
    ],
    responses: {
      "200": {
        description: "삭제 성공",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean" },
                message: { type: "string" }
              }
            }
          }
        }
      },
      "400": { description: "잘못된 ID" },
      "401": { description: "인증 실패" },
      "403": { description: "권한 없음" },
      "404": { description: "프로필을 찾을 수 없음" },
      "500": { description: "서버 오류" }
    }
  });

  return router;
} 