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
    auth: true,
    parameters: [
      { name: 'userId', in: 'path', required: true, description: '사용자 ID', schema: { type: 'integer' } }
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
                user: {
                  type: "object",
                  properties: {
                    id: { type: "integer" },
                    email: { type: "string" },
                    name: { type: "string" },
                    picture: { type: "string" },
                    role: { type: "string" },
                    createdAt: { type: "string", format: "date-time" }
                  }
                },
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
                      "달력": { type: "string" },
                      "성별": { type: "string" },
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
      "400": { description: "잘못된 사용자 ID" },
      "403": { description: "관리자 권한이 필요합니다." },
      "404": { description: "사용자를 찾을 수 없습니다." }
    }
  });

  router.get("/api/admin/stats", adminApiHandlers.getAdminStats, {
    summary: '전체 통계 정보 조회',
    description: '전체 사용자 수, 프로필 수 등 관리자용 통계 정보를 조회합니다.',
    tags: ['관리자'],
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
                stats: {
                  type: "object",
                  properties: {
                    totalUsers: { type: "integer" },
                    totalProfiles: { type: "integer" },
                    adminUsers: { type: "integer" },
                    averageProfilesPerUser: { type: "number" }
                  }
                }
              }
            }
          }
        }
      },
      "403": { description: "관리자 권한이 필요합니다." }
    }
  });

  router.get('/api/admin/history/login', adminApiHandlers.getLoginHistory, {
    summary: '로그인/로그아웃 기록 조회',
    description: '전체 사용자의 로그인/로그아웃 기록을 페이지네이션으로 조회합니다.',
    tags: ['관리자'],
    auth: true, // `isAdmin` check is inside the handler
    parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: '페이지 번호' },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 }, description: '페이지 당 항목 수' },
        { name: 'search', in: 'query', schema: { type: 'string' }, description: '사용자 이름 또는 이메일로 검색' },
        { name: 'action', in: 'query', schema: { type: 'string', enum: ['login', 'logout'] }, description: '활동 종류 필터링' }
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
                history: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "integer" },
                      action: { type: "string", enum: ['login', 'logout'] },
                      createdAt: { type: "string", format: "date-time" },
                      user: {
                        type: "object",
                        properties: {
                          id: { type: "integer" },
                          email: { type: "string" },
                          name: { type: "string" },
                          picture: { type: "string" },
                        }
                      }
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
      },
      "403": { description: "관리자 권한이 필요합니다." }
    }
  });

  return router;
} 