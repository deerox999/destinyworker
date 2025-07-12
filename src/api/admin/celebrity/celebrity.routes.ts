import { Router } from "../../../common/class/router";
import {
  createCelebrity,
  deleteCelebrity,
  updateCelebrity,
  getCelebrityRequests,
  getCelebrities,
} from "./celebrity";

export function createCelebrityAdminRouter(): Router {
  const router = new Router();

  // 유명인물 목록 조회
  router.get("/api/admin/celebrities", getCelebrities, {
    summary: "유명인물 목록 조회",
    description: "페이지네이션을 지원하는 유명인물 목록을 조회합니다.",
    tags: ["유명인물"],
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
        description: "검색어 (ID로 검색)",
        required: false,
        schema: { type: "string" },
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
        name: "languageCode",
        in: "query",
        description: "조회할 언어 코드",
        required: false,
        schema: { type: "string", default: "ko" },
      }
    ],
    responses: {
      "200": { description: "조회 성공" },
      "500": { description: "서버 오류" },
    },
  });

  // [Admin] 유명인물 생성
  router.post("/api/admin/celebrities", createCelebrity, {
    summary: "[Admin] 유명인물 생성",
    description: "새로운 유명인물과 관련 다국어 정보를 생성합니다. (관리자용)",
    tags: ["유명인물", "Admin"],
    auth: true,
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
  });

  // [Admin] 유명인물 수정
  router.put("/api/admin/celebrities/:id", updateCelebrity, {
    summary: "[Admin] 유명인물 수정",
    description: "기존 유명인물의 정보를 수정합니다. (관리자용)",
    tags: ["유명인물", "Admin"],
    auth: true,
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
  });

  // [Admin] 유명인물 삭제
  router.delete("/api/admin/celebrities/:id", deleteCelebrity, {
    summary: "[Admin] 유명인물 삭제",
    description: "특정 유명인물을 삭제합니다. (관리자용)",
    tags: ["유명인물", "Admin"],
    auth: true,
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
  });

  router.get("/api/admin/celebrities/requests", getCelebrityRequests, {
    summary: "유명인물 요청 목록 조회",
    description:
      "페이지네이션을 지원하는 유명인물 추가 요청 목록을 조회합니다. (관리자용)",
    tags: ["유명인물"],
    auth: true,
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
  });

  return router;
}
