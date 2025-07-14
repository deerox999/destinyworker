import { Hono, Context } from "hono";
import {
  createCelebrity,
  createCelebritiesBatch,
  deleteCelebrity,
  updateCelebrity,
  getCelebrityRequests,
  getCelebrities,
} from "./celebrity";

export function createCelebrityAdminRouter(): Hono {
  const app = new Hono();

  // 유명인물 목록 조회
  const getCelebritiesHandler = (c: Context) => getCelebrities(c);
  app.get("/celebrities", getCelebritiesHandler);
  getCelebritiesHandler.swagger = {
    summary: "유명인물 목록 조회",
    description: "페이지네이션을 지원하는 유명인물 목록을 조회합니다.",
    tags: ["유명인물"],
    security: [{ BearerAuth: [] }],
    parameters: [
      {
        name: "page",
        in: "query",
        description: "페이지 번호",
        required: false,
        schema: { type: "integer", default: 1 },
      },
      {
        name: "limit",
        in: "query",
        description: "페이지당 항목 수",
        required: false,
        schema: { type: "integer", default: 10 },
      },
      {
        name: "sort",
        in: "query",
        description: "정렬 필드",
        required: false,
        schema: { type: "string", default: "createdAt" },
      },
      {
        name: "order",
        in: "query",
        description: "정렬 순서",
        required: false,
        schema: { type: "string", enum: ["asc", "desc"], default: "desc" },
      },
      {
        name: "id",
        in: "query",
        description: "ID로 검색 (정확한 ID 매칭)",
        required: false,
        schema: { type: "string" },
      },
      {
        name: "search",
        in: "query",
        description:
          "통합 검색 (ID, 이름, 직업, 설명에서 검색, 모든 언어 지원)",
        required: false,
        schema: { type: "string" },
      },
    ],
    responses: {
      "200": { description: "조회 성공" },
      "500": { description: "서버 오류" },
    },
  };

  // [Admin] 유명인물 생성
  const createCelebrityHandler = (c: Context) => createCelebrity(c);
  app.post("/celebrities", createCelebrityHandler);
  createCelebrityHandler.swagger = {
    summary: "[Admin] 유명인물 생성",
    description: "새로운 유명인물과 관련 다국어 정보를 생성합니다. (관리자용)",
    tags: ["유명인물", "Admin"],
    security: [{ BearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              id: { type: "string" },
              birthYear: { type: "number" },
              birthMonth: { type: "number" },
              birthDay: { type: "number" },
              calendar: { type: "string" },
              gender: { type: "string" },
              translations: { type: "array", items: { type: "object" } },
            },
            required: [
              "id",
              "birthYear",
              "birthMonth",
              "birthDay",
              "calendar",
              "gender",
              "translations",
            ],
          },
        },
      },
    },
    responses: {
      "201": { description: "생성 성공" },
      "400": { description: "잘못된 요청 데이터" },
      "401": { description: "인증 실패" },
      "403": { description: "권한 없음" },
    },
  };

  // [Admin] 유명인물 대량 생성
  const createCelebritiesBatchHandler = (c: Context) =>
    createCelebritiesBatch(c);
  app.post("/celebrities/batch", createCelebritiesBatchHandler);
  createCelebritiesBatchHandler.swagger = {
    summary: "[Admin] 유명인물 대량 생성",
    description: "여러 유명인물을 한 번에 생성합니다. (관리자용)",
    tags: ["유명인물", "Admin"],
    security: [{ BearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              celebrities: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    birthYear: { type: "number" },
                    birthMonth: { type: "number" },
                    birthDay: { type: "number" },
                    birthHour: { type: "number" },
                    birthMinute: { type: "number" },
                    calendar: { type: "string", enum: ["SOLAR", "LUNAR"] },
                    gender: { type: "string", enum: ["MALE", "FEMALE"] },
                    imageUrl: { type: "string" },
                    translations: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          languageCode: { type: "string" },
                          name: { type: "string" },
                          occupation: { type: "string" },
                          description: { type: "string" },
                        },
                        required: ["languageCode", "name"],
                      },
                    },
                  },
                  required: [
                    "id",
                    "birthYear",
                    "birthMonth",
                    "birthDay",
                    "calendar",
                    "gender",
                    "translations",
                  ],
                },
              },
            },
            required: ["celebrities"],
          },
        },
      },
    },
    responses: {
      "201": { description: "대량 생성 성공" },
      "400": { description: "잘못된 요청 데이터" },
      "401": { description: "인증 실패" },
      "403": { description: "권한 없음" },
    },
  };

  // [Admin] 유명인물 수정
  const updateCelebrityHandler = (c: Context) => updateCelebrity(c);
  app.put("/celebrities/:id", updateCelebrityHandler);
  updateCelebrityHandler.swagger = {
    summary: "[Admin] 유명인물 수정",
    description: "기존 유명인물의 정보를 수정합니다. (관리자용)",
    tags: ["유명인물", "Admin"],
    security: [{ BearerAuth: [] }],
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "수정할 유명인물 ID",
        schema: { type: "string" },
      },
    ],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              id: { type: "string" },
              birthYear: { type: "number" },
              birthMonth: { type: "number" },
              birthDay: { type: "number" },
              calendar: { type: "string" },
              gender: { type: "string" },
              translations: { type: "array", items: { type: "object" } },
            },
          },
        },
      },
    },
    responses: {
      "200": { description: "수정 성공" },
      "400": { description: "잘못된 요청 데이터" },
      "401": { description: "인증 실패" },
      "403": { description: "권한 없음" },
      "404": { description: "유명인물을 찾을 수 없음" },
    },
  };

  // [Admin] 유명인물 삭제
  const deleteCelebrityHandler = (c: Context) => deleteCelebrity(c);
  app.delete("/celebrities/:id", deleteCelebrityHandler);
  deleteCelebrityHandler.swagger = {
    summary: "[Admin] 유명인물 삭제",
    description: "특정 유명인물을 삭제합니다. (관리자용)",
    tags: ["유명인물", "Admin"],
    security: [{ BearerAuth: [] }],
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "삭제할 유명인물 ID",
        schema: { type: "string" },
      },
    ],
    responses: {
      "200": { description: "삭제 성공" },
      "401": { description: "인증 실패" },
      "403": { description: "권한 없음" },
      "404": { description: "유명인물을 찾을 수 없음" },
    },
  };

  const getCelebrityRequestsHandler = (c: Context) => getCelebrityRequests(c);
  app.get("/celebrities/requests", getCelebrityRequestsHandler);
  getCelebrityRequestsHandler.swagger = {
    summary: "유명인물 요청 목록 조회",
    description:
      "페이지네이션을 지원하는 유명인물 추가 요청 목록을 조회합니다. (관리자용)",
    tags: ["유명인물"],
    security: [{ BearerAuth: [] }],
    parameters: [
      {
        name: "page",
        in: "query",
        description: "페이지 번호",
        required: false,
        schema: { type: "integer", default: 1 },
      },
      {
        name: "limit",
        in: "query",
        description: "페이지당 항목 수",
        required: false,
        schema: { type: "integer", default: 10 },
      },
      {
        name: "search",
        in: "query",
        description: "검색어 (요청된 이름으로 검색)",
        required: false,
        schema: { type: "string" },
      },
      {
        name: "sort",
        in: "query",
        description: "정렬 필드",
        required: false,
        schema: { type: "string", default: "created_at" },
      },
      {
        name: "order",
        in: "query",
        description: "정렬 순서",
        required: false,
        schema: { type: "string", enum: ["asc", "desc"], default: "desc" },
      },
    ],
    responses: {
      "200": { description: "조회 성공" },
      "401": { description: "인증 실패 (관리자 권한 필요)" },
      "500": { description: "서버 오류" },
    },
  };

  return app;
}
