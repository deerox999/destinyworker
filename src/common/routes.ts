import { adminApiHandlers } from "../api/adminApi";
import DestinyTellerApi from "../api/ai/DestinyTellerApi";
import { celebrityProfileApiHandlers } from "../api/celebrityProfileApi";
import { celebrityRequestApiHandlers } from "../api/celebrityRequestApi";
import { googleAuthApiHandlers } from "../api/googleAuthApi";
import { sajuProfileApiHandlers } from "../api/sajuProfileApi";
import { userApiHandlers } from "../api/userApi";
import { generateApiListHTML, generateSwaggerHTML } from "../html/swaggerUI";

import { Router } from "./router";
import { generateOpenApiSpec, htmlResponse, jsonResponse } from "./utils";

/**
 * 애플리케이션의 모든 라우트를 등록하고 관리하는 메인 라우터
 */
export function createAppRouter(): Router {
  const router = new Router();
  
  // 정적 페이지
  router.get('/', async () => htmlResponse(generateApiListHTML()));
  router.get('/docs', async () => htmlResponse(generateSwaggerHTML()));
  router.get('/api/openapi.json', async () => jsonResponse(generateOpenApiSpec()));

  // 인증 관련 라우트 (swagger 메타데이터 포함)
  router.post('/api/auth/google/login', googleAuthApiHandlers.googleLogin, {
    summary: 'Google OAuth 로그인',
    description: 'Google OAuth를 통해 로그인하고 JWT 토큰을 발급받습니다.',
    tags: ['인증'],
    auth: false,
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              code: { type: 'string', description: 'Google OAuth 인증 코드' },
              redirectUri: { type: 'string', description: '리다이렉트 URI' }
            },
            required: ['code', 'redirectUri']
          }
        }
      }
    }
  });

  router.post('/api/auth/logout', googleAuthApiHandlers.logout, {
    summary: '로그아웃',
    description: '현재 세션을 종료하고 토큰을 무효화합니다.',
    tags: ['인증'],
    auth: true
  });

  router.get('/api/auth/me', googleAuthApiHandlers.getUserInfo, {
    summary: '사용자 정보 조회',
    description: '현재 로그인한 사용자의 정보를 조회합니다.',
    tags: ['인증'],
    auth: true
  });

  router.post('/api/auth/refresh', googleAuthApiHandlers.refreshToken, {
    summary: '토큰 갱신',
    description: 'JWT 토큰을 갱신합니다.',
    tags: ['인증'],
    auth: true
  });

  // 사용자 프로필 관련 라우트
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

  // 사주 프로필 관련 라우트 (swagger 메타데이터 포함)
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

  // 유명인물 댓글 관련 라우트 (swagger 메타데이터 없음 - 자동 생성됨)
  router.get('/api/celebrities/:id/comments', celebrityProfileApiHandlers.getCelebrityComments);
  router.post('/api/celebrities/:id/comments', celebrityProfileApiHandlers.createCelebrityComment);
  router.put('/api/celebrities/:id/comments/:commentId', celebrityProfileApiHandlers.updateCelebrityComment);
  router.delete('/api/celebrities/:id/comments/:commentId', celebrityProfileApiHandlers.deleteCelebrityComment);
  
  // 댓글 추천 토글 라우트
  router.post('/api/celebrities/:id/comments/:commentId/like', celebrityProfileApiHandlers.toggleCelebrityCommentLike, {
    summary: '댓글 추천 토글',
    description: '유명인물 댓글을 추천하거나 추천을 취소합니다. 이미 추천한 댓글이면 추천 취소, 추천하지 않은 댓글이면 추천합니다.',
    tags: ['유명인물'],
    auth: true,
    parameters: [
      {
        name: 'id',
        in: 'path',
        required: true,
        description: '유명인물 ID',
        schema: { type: 'string' }
      },
      {
        name: 'commentId',
        in: 'path',
        required: true,
        description: '댓글 ID',
        schema: { type: 'integer' }
      }
    ]
  });
  
  // 유명인물 요청 관련 라우트
  router.post("/api/celebrities/request", celebrityRequestApiHandlers.createCelebrityRequest, {
    summary: '유명인물 추가 요청',
    description: '새로운 유명인물 추가를 요청합니다.',
    tags: ['유명인물'],
    auth: false,
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '유명인물 이름' },
              category: { type: 'string', description: '카테고리 (연예인, 정치인 등)' },
              reason: { type: 'string', description: '요청 사유' }
            },
            required: ['name', 'category']
          }
        }
      }
    }
  });

  router.get("/api/celebrities/requests", celebrityRequestApiHandlers.getCelebrityRequests, {
    summary: '유명인물 요청 목록 조회',
    description: '유명인물 추가 요청 목록을 조회합니다.',
    tags: ['유명인물'],
    auth: true
  });

  // 관리자 관련 라우트 (swagger 메타데이터 포함)
  router.get("/api/admin/users", adminApiHandlers.getUsers, {
    summary: '가입한 유저 목록 조회',
    description: '가입한 모든 유저의 목록을 조회합니다. 페이지네이션과 검색 기능을 지원합니다.',
    tags: ['관리자'],
    auth: true,
    parameters: [
      {
        name: 'page',
        in: 'query',
        required: false,
        description: '페이지 번호 (기본값: 1)',
        schema: { type: 'integer', default: 1, minimum: 1 }
      },
      {
        name: 'limit',
        in: 'query',
        required: false,
        description: '페이지당 항목 수 (기본값: 20)',
        schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 }
      },
      {
        name: 'search',
        in: 'query',
        required: false,
        description: '검색어 (이름 또는 이메일)',
        schema: { type: 'string' }
      }
    ]
  });

  router.get("/api/admin/users/:userId/profiles", adminApiHandlers.getUserProfiles, {
    summary: '특정 유저의 프로필 조회',
    description: '특정 유저가 보유한 모든 사주 프로필을 조회합니다.',
    tags: ['관리자'],
    auth: true
  });

  router.get("/api/admin/stats", adminApiHandlers.getAdminStats, {
    summary: '전체 통계 정보 조회',
    description: '전체 시스템의 통계 정보를 조회합니다. (총 사용자 수, 프로필 수, 관리자 수 등)',
    tags: ['관리자'],
    auth: true
  });
  
  // AI 관련 라우트 (swagger 메타데이터 없음 - 자동 생성됨)
  router.post("/api/detailed-fortune-telling", async (request: Request, env: any) => await DestinyTellerApi.fetch(request, env));
  router.get("/api/ai-models", async (request: Request, env: any) => await DestinyTellerApi.fetch(request, env));
  
  console.log("=== 등록된 라우트 목록 ===");
  const routes = router.getRoutes();
  routes.forEach((route) => {
    const hasSwagger = route.swagger ? '✅' : '⚙️';
    console.log(`${hasSwagger} ${route.method} ${route.path}`);
  });
  console.log("✅ = Swagger 메타데이터 있음, ⚙️ = 자동 생성");
  console.log("=========================");

  return router;
}
