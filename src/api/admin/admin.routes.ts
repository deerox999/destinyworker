import { Router } from "../../common/router";
import { adminApiHandlers } from "./adminApi";

export function createAdminRouter(): Router {
  const router = new Router();

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
    ],
    responses: {
      "200": {
        description: "성공적인 응답",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "integer" },
                      email: { type: "string" },
                      name: { type: "string" },
                      picture: { type: "string" },
                      role: { type: "string" },
                      createdAt: { type: "string", format: "date-time" },
                      updatedAt: { type: "string", format: "date-time" },
                      profileCount: { type: "integer" }
                    }
                  }
                },
                pagination: {
                  type: "object",
                  properties: {
                    totalItems: { type: "integer" },
                    totalPages: { type: "integer" },
                    currentPage: { type: "integer" },
                    pageSize: { type: "integer" }
                  }
                }
              }
            }
          }
        }
      }
    }
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

  return router;
} 