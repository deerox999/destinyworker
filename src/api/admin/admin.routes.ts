import { Context, Hono } from "hono";
import {
  getAdminStats,
  getAiUsageLogsForUser,
  getAiUsageStatsByModel,
  getAiUsageStatsByUser,
  getAiUsageStatsForModel,
  getLoginHistory,
  getUserProfiles,
  getUsers,
} from "./adminApi";

export function createAdminRouter(): Hono {
  const app = new Hono();

  const getUsersHandler = (c: Context) => getUsers(c);
  app.get("/users", getUsersHandler);
  getUsersHandler.swagger = {
    summary: "가입한 유저 목록 조회",
    description:
      "가입한 모든 유저의 목록을 조회합니다. 페이지네이션과 검색 기능을 지원합니다.",
    tags: ["관리자"],
    security: [{ BearerAuth: [] }],
    parameters: [
      {
        name: "page",
        in: "query",
        required: false,
        description: "페이지 번호 (기본값: 1)",
        schema: { type: "integer", default: 1, minimum: 1 },
      },
      {
        name: "limit",
        in: "query",
        required: false,
        description: "페이지당 항목 수 (기본값: 20)",
        schema: { type: "integer", default: 20, minimum: 1, maximum: 100 },
      },
      {
        name: "search",
        in: "query",
        required: false,
        description: "검색어 (이름 또는 이메일)",
        schema: { type: "string" },
      },
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
                      profileCount: { type: "integer" },
                    },
                  },
                },
                pagination: {
                  type: "object",
                  properties: {
                    totalItems: { type: "integer" },
                    totalPages: { type: "integer" },
                    currentPage: { type: "integer" },
                    pageSize: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  const getUserProfilesHandler = (c: Context) => getUserProfiles(c);
  app.get("/users/:userId/profiles", getUserProfilesHandler);
  getUserProfilesHandler.swagger = {
    summary: "특정 유저의 프로필 조회",
    description: "특정 유저가 보유한 모든 사주 프로필을 조회합니다.",
    tags: ["관리자"],
    security: [{ BearerAuth: [] }],
    parameters: [
      {
        name: "userId",
        in: "path",
        required: true,
        description: "사용자 ID",
        schema: { type: "integer" },
      },
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
                    createdAt: { type: "string", format: "date-time" },
                  },
                },
                profiles: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "integer" },
                      이름: { type: "string" },
                      년: { type: "string" },
                      월: { type: "string" },
                      일: { type: "string" },
                      시간: { type: "string" },
                      분: { type: "string" },
                      달력: { type: "string" },
                      성별: { type: "string" },
                      createdAt: { type: "string", format: "date-time" },
                      updatedAt: { type: "string", format: "date-time" },
                    },
                  },
                },
                count: { type: "integer" },
              },
            },
          },
        },
      },
      "400": { description: "잘못된 사용자 ID" },
      "403": { description: "관리자 권한이 필요합니다." },
      "404": { description: "사용자를 찾을 수 없습니다." },
    },
  };

  const getAdminStatsHandler = (c: Context) => getAdminStats(c);
  app.get("/stats", getAdminStatsHandler);
  getAdminStatsHandler.swagger = {
    summary: "전체 통계 정보 조회",
    description:
      "전체 사용자 수, 프로필 수 등 관리자용 통계 정보를 조회합니다.",
    tags: ["관리자"],
    security: [{ BearerAuth: [] }],
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
                    averageProfilesPerUser: { type: "number" },
                  },
                },
              },
            },
          },
        },
      },
      "403": { description: "관리자 권한이 필요합니다." },
    },
  };

  const getLoginHistoryHandler = (c: Context) => getLoginHistory(c);
  app.get("/history/login", getLoginHistoryHandler);
  getLoginHistoryHandler.swagger = {
    summary: "로그인/로그아웃 기록 조회",
    description:
      "전체 사용자의 로그인/로그아웃 기록을 페이지네이션으로 조회합니다.",
    tags: ["관리자"],
    security: [{ BearerAuth: [] }], // `isAdmin` check is inside the handler
    parameters: [
      {
        name: "page",
        in: "query",
        schema: { type: "integer", default: 1 },
        description: "페이지 번호",
      },
      {
        name: "limit",
        in: "query",
        schema: { type: "integer", default: 20 },
        description: "페이지 당 항목 수",
      },
      {
        name: "search",
        in: "query",
        schema: { type: "string" },
        description: "사용자 이름 또는 이메일로 검색",
      },
      {
        name: "action",
        in: "query",
        schema: { type: "string", enum: ["login", "logout"] },
        description: "활동 종류 필터링",
      },
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
                      action: { type: "string", enum: ["login", "logout"] },
                      createdAt: { type: "string", format: "date-time" },
                      user: {
                        type: "object",
                        properties: {
                          id: { type: "integer" },
                          email: { type: "string" },
                          name: { type: "string" },
                          picture: { type: "string" },
                        },
                      },
                    },
                  },
                },
                pagination: {
                  type: "object",
                  properties: {
                    totalItems: { type: "integer" },
                    totalPages: { type: "integer" },
                    currentPage: { type: "integer" },
                    pageSize: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
      "403": { description: "관리자 권한이 필요합니다." },
    },
  };

  // 모델별 AI 사용량 통계 조회
  const getAiUsageStatsByModelHandler = (c: Context) =>
    getAiUsageStatsByModel(c);
  app.get("/stats/ai-usage-by-model", getAiUsageStatsByModelHandler);
  getAiUsageStatsByModelHandler.swagger = {
    summary: "[Admin] 모델별 AI 사용량 통계",
    description:
      "기간별로 각 AI 모델의 총 토큰 사용량, 호출 수, 순수 사용자 수를 페이지네이션하여 조회합니다.",
    tags: ["Admin"],
    security: [{ BearerAuth: [] }],
    parameters: [
      {
        name: "page",
        in: "query",
        description: "페이지 번호",
        schema: { type: "integer", default: 1 },
      },
      {
        name: "limit",
        in: "query",
        description: "페이지당 항목 수",
        schema: { type: "integer", default: 20 },
      },
      {
        name: "startDate",
        in: "query",
        description: "조회 시작일 (YYYY-MM-DD)",
        schema: { type: "string", format: "date" },
      },
      {
        name: "endDate",
        in: "query",
        description: "조회 종료일 (YYYY-MM-DD)",
        schema: { type: "string", format: "date" },
      },
      {
        name: "sort",
        in: "query",
        description:
          "정렬 필드 (model, total_tokens, total_calls, unique_users)",
        schema: { type: "string", default: "total_tokens" },
      },
      {
        name: "order",
        in: "query",
        description: "정렬 순서",
        schema: { type: "string", enum: ["asc", "desc"], default: "desc" },
      },
    ],
    responses: {
      "200": {
        description: "모델별 통계 조회 성공",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean" },
                stats: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      model: {
                        type: "string",
                        description: "AI 모델 이름",
                      },
                      total_tokens: {
                        type: "integer",
                      },
                      total_calls: {
                        type: "integer",
                      },
                      unique_users: {
                        type: "integer",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  // 특정 모델의 사용자별 AI 사용량 통계 조회
  const getAiUsageStatsForModelHandler = (c: Context) =>
    getAiUsageStatsForModel(c);
  app.get("/stats/ai-usage-by-model/:model+", getAiUsageStatsForModelHandler);
  getAiUsageStatsForModelHandler.swagger = {
    summary: "[Admin] 특정 모델의 사용자별 AI 사용량 통계",
    description:
      "특정 AI 모델을 사용한 유저 목록과 각 유저의 토큰 사용량을 페이지네이션하여 조회합니다. 모델 이름에 '/'가 포함될 수 있으므로 인코딩된 상태로 요청해야 합니다.",
    tags: ["Admin"],
    security: [{ BearerAuth: [] }],
    parameters: [
      {
        name: "model",
        in: "path",
        required: true,
        description: "AI 모델 이름 (URL-encoded)",
        schema: { type: "string" },
      },
      {
        name: "page",
        in: "query",
        schema: { type: "integer", default: 1 },
        description: "페이지 번호",
      },
      {
        name: "limit",
        in: "query",
        schema: { type: "integer", default: 20 },
        description: "페이지당 항목 수",
      },
      {
        name: "startDate",
        in: "query",
        description: "조회 시작일 (YYYY-MM-DD)",
        schema: { type: "string", format: "date" },
      },
      {
        name: "endDate",
        in: "query",
        description: "조회 종료일 (YYYY-MM-DD)",
        schema: { type: "string", format: "date" },
      },
      {
        name: "sort",
        in: "query",
        description:
          "정렬 필드 (total_tokens, total_prompt_tokens, total_completion_tokens, total_calls)",
        schema: { type: "string", default: "total_tokens" },
      },
      {
        name: "order",
        in: "query",
        description: "정렬 순서",
        schema: { type: "string", enum: ["asc", "desc"], default: "desc" },
      },
    ],
    responses: {
      "200": { description: "성공" },
      "400": { description: "모델 이름이 필요합니다." },
      "403": { description: "관리자 권한이 필요합니다." },
    },
  };

  // 사용자별 AI 사용량 통계 조회
  const getAiUsageStatsByUserHandler = (c: Context) => getAiUsageStatsByUser(c);
  app.get("/stats/ai-usage-by-user", getAiUsageStatsByUserHandler);
  getAiUsageStatsByUserHandler.swagger = {
    summary: "[Admin] 사용자별 AI 사용량 통계",
    description:
      "기간별로 각 사용자의 AI 사용량을 모델별로 상세히 페이지네이션하여 조회합니다.",
    tags: ["Admin"],
    security: [{ BearerAuth: [] }],
    parameters: [
      {
        name: "page",
        in: "query",
        description: "페이지 번호",
        schema: { type: "integer", default: 1 },
      },
      {
        name: "limit",
        in: "query",
        description: "페이지당 항목 수",
        schema: { type: "integer", default: 20 },
      },
      {
        name: "startDate",
        in: "query",
        description: "조회 시작일 (YYYY-MM-DD)",
        schema: { type: "string", format: "date" },
      },
      {
        name: "endDate",
        in: "query",
        description: "조회 종료일 (YYYY-MM-DD)",
        schema: { type: "string", format: "date" },
      },
      {
        name: "sort",
        in: "query",
        description: "정렬 필드 (total_tokens, total_calls)",
        schema: { type: "string", default: "total_tokens" },
      },
      {
        name: "order",
        in: "query",
        description: "정렬 순서",
        schema: { type: "string", enum: ["asc", "desc"], default: "desc" },
      },
    ],
    responses: {
      "200": {
        description: "사용자별 통계 조회 성공",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean" },
                stats: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      user: {
                        type: "object",
                        properties: {
                          id: { type: "integer" },
                          name: { type: "string" },
                          email: { type: "string" },
                        },
                      },
                      totalUsage: {
                        type: "object",
                        properties: {
                          tokens: { type: "integer" },
                          calls: { type: "integer" },
                        },
                      },
                      modelUsage: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            model: { type: "string" },
                            total_tokens: { type: "integer" },
                            total_calls: { type: "integer" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  // 특정 사용자의 AI 사용 기록 조회
  const getAiUsageLogsForUserHandler = (c: Context) => getAiUsageLogsForUser(c);
  app.get("/users/:userId/ai-usage", getAiUsageLogsForUserHandler);
  getAiUsageLogsForUserHandler.swagger = {
    summary: "[Admin] 특정 사용자 AI 사용 기록 조회",
    description:
      "특정 사용자의 모든 AI API 호출 기록을 페이지네이션하여 조회합니다. 기간 및 정렬 필터링을 지원합니다.",
    tags: ["Admin"],
    security: [{ BearerAuth: [] }],
    parameters: [
      {
        name: "userId",
        in: "path",
        required: true,
        schema: { type: "integer" },
        description: "사용자 ID",
      },
      {
        name: "page",
        in: "query",
        schema: { type: "integer", default: 1 },
        description: "페이지 번호",
      },
      {
        name: "limit",
        in: "query",
        schema: { type: "integer", default: 20 },
        description: "페이지당 항목 수",
      },
      {
        name: "startDate",
        in: "query",
        schema: { type: "string", format: "date" },
        description: "조회 시작일 (YYYY-MM-DD)",
      },
      {
        name: "endDate",
        in: "query",
        schema: { type: "string", format: "date" },
        description: "조회 종료일 (YYYY-MM-DD)",
      },
      {
        name: "sort",
        in: "query",
        description: "정렬 필드 (e.g., total_tokens, created_at)",
        schema: { type: "string", default: "created_at" },
      },
      {
        name: "order",
        in: "query",
        description: "정렬 순서",
        schema: { type: "string", enum: ["asc", "desc"], default: "desc" },
      },
    ],
    responses: {
      "200": {
        description: "성공",
      },
      "403": { description: "관리자 권한이 필요합니다." },
      "400": { description: "잘못된 사용자 ID입니다." },
    },
  };

  return app;
}
