import { Context, Hono } from "hono";
import {
  createCelebrityComment,
  deleteCelebrityComment,
  getCelebrities,
  getCelebrityById,
  getCelebrityComments,
  toggleCelebrityCommentLike,
  updateCelebrityComment,
} from "./celebrityProfileApi";
import { createCelebrityRequest } from "./celebrityRequestApi";

export function createCelebrityRouter(): Hono {
  const app = new Hono();

  const commentSchema = {
    type: "object",
    properties: {
      내용: { type: "string", description: "댓글 내용" },
      부모댓글ID: {
        type: "integer",
        description: "대댓글일 경우 부모 댓글의 ID",
        nullable: true,
      },
    },
    required: ["내용"],
  };

  const getCelebritiesHandler = (c: Context) => getCelebrities(c);
  app.get("/", getCelebritiesHandler);
  getCelebritiesHandler.swagger = {
    summary: "유명인물 목록 조회",
    description: "페이지네이션, 다국어 지원과 함께 유명인물 목록을 조회합니다.",
    tags: ["유명인물"],
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
        description: "페이지 당 항목 수",
        schema: { type: "integer", default: 10 },
      },
      {
        name: "lang",
        in: "query",
        description: "언어 코드 (e.g., 'ko', 'en')",
        schema: { type: "string", default: "ko" },
      },
    ],
    responses: {
      "200": { description: "성공" },
    },
  };

  // 유명인물 상세
  const getCelebrityByIdHandler = (c: Context) => getCelebrityById(c);
  app.get("/:id", getCelebrityByIdHandler);
  getCelebrityByIdHandler.swagger = {
    summary: "특정 유명인물 정보 조회",
    description:
      "ID와 언어 코드를 사용하여 특정 유명인물의 상세 정보를 조회합니다.",
    tags: ["유명인물"],
    auth: false,
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "유명인물 ID",
        schema: { type: "string" },
      },
      {
        name: "lang",
        in: "query",
        description: "언어 코드 (e.g., 'ko', 'en')",
        schema: { type: "string", default: "ko" },
      },
    ],
    responses: {
      "200": { description: "성공" },
      "404": { description: "유명인물을 찾을 수 없음" },
    },
  };

  const getCelebrityCommentsHandler = (c: Context) => getCelebrityComments(c);
  app.get("/:id/comments", getCelebrityCommentsHandler);
  getCelebrityCommentsHandler.swagger = {
    summary: "유명인물 댓글 목록 조회",
    description:
      "특정 유명인물의 댓글 목록을 페이지네이션, 정렬, 추천 여부와 함께 조회합니다.",
    tags: ["유명인물"],
    auth: false, // 사용자 비로그인 상태에서도 조회 가능
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "유명인물 ID",
        schema: { type: "string" },
      },
      {
        name: "page",
        in: "query",
        description: "페이지 번호",
        schema: { type: "integer", default: 1 },
      },
      {
        name: "limit",
        in: "query",
        description: "페이지 당 항목 수",
        schema: { type: "integer", default: 20 },
      },
      {
        name: "sort",
        in: "query",
        description: "정렬 기준 (latest 또는 likes)",
        schema: {
          type: "string",
          enum: ["latest", "likes"],
          default: "latest",
        },
      },
    ],
    responses: {
      "200": {
        description: "성공" /* 스키마는 핸들러에서 매우 복잡하므로 생략 */,
      },
      "400": { description: "잘못된 유명인물 ID" },
    },
  };

  const createCelebrityCommentHandler = (c: Context) =>
    createCelebrityComment(c);
  app.post("/:id/comments", createCelebrityCommentHandler);
  createCelebrityCommentHandler.swagger = {
    summary: "유명인물 댓글 작성",
    description: "특정 유명인물에게 새로운 댓글이나 대댓글을 작성합니다.",
    tags: ["유명인물"],
    security: [{ BearerAuth: [] }],
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "유명인물 ID",
        schema: { type: "string" },
      },
    ],
    requestBody: { content: { "application/json": { schema: commentSchema } } },
    responses: {
      "201": { description: "생성 성공" },
      "400": { description: "잘못된 요청 데이터" },
      "401": { description: "인증 실패" },
      "404": { description: "유명인물을 찾을 수 없음" },
    },
  };

  const updateCelebrityCommentHandler = (c: Context) =>
    updateCelebrityComment(c);
  app.put("/:id/comments/:commentId", updateCelebrityCommentHandler);
  updateCelebrityCommentHandler.swagger = {
    summary: "유명인물 댓글 수정",
    description: "자신이 작성한 댓글을 수정합니다.",
    tags: ["유명인물"],
    security: [{ BearerAuth: [] }],
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "유명인물 ID",
        schema: { type: "string" },
      },
      {
        name: "commentId",
        in: "path",
        required: true,
        description: "댓글 ID",
        schema: { type: "integer" },
      },
    ],
    requestBody: {
      content: { "application/json": { schema: commentSchema } },
    },
    responses: {
      "200": { description: "수정 성공" },
      "400": { description: "잘못된 요청 데이터" },
      "401": { description: "인증 실패" },
      "403": { description: "권한 없음" },
      "404": { description: "댓글을 찾을 수 없음" },
    },
  };

  const deleteCelebrityCommentHandler = (c: Context) =>
    deleteCelebrityComment(c);
  app.delete("/:id/comments/:commentId", deleteCelebrityCommentHandler);
  deleteCelebrityCommentHandler.swagger = {
    summary: "유명인물 댓글 삭제",
    description: "자신이 작성한 댓글 또는 관리자가 댓글을 삭제합니다.",
    tags: ["유명인물"],
    security: [{ BearerAuth: [] }],
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "유명인물 ID",
        schema: { type: "string" },
      },
      {
        name: "commentId",
        in: "path",
        required: true,
        description: "댓글 ID",
        schema: { type: "integer" },
      },
    ],
    responses: {
      "200": { description: "삭제 성공" },
      "401": { description: "인증 실패" },
      "403": { description: "권한 없음" },
      "404": { description: "댓글을 찾을 수 없음" },
    },
  };

  // 댓글 추천 토글

  const toggleCelebrityCommentLikeHandler = (c: Context) =>
    toggleCelebrityCommentLike(c);
  app.post("/:id/comments/:commentId/like", toggleCelebrityCommentLikeHandler);
  toggleCelebrityCommentLikeHandler.swagger = {
    summary: "댓글 추천 토글",
    description:
      "유명인물 댓글을 추천하거나 추천을 취소합니다. 이미 추천한 댓글이면 추천 취소, 추천하지 않은 댓글이면 추천합니다.",
    tags: ["유명인물"],
    security: [{ BearerAuth: [] }],
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "유명인물 ID",
        schema: { type: "string" },
      },
      {
        name: "commentId",
        in: "path",
        required: true,
        description: "댓글 ID",
        schema: { type: "integer" },
      },
    ],
    responses: {
      "200": {
        description: "추천/추천 취소 성공",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean" },
                action: { type: "string", enum: ["liked", "unliked"] },
                likeCount: { type: "integer" },
              },
            },
          },
        },
      },
      "401": { description: "인증 실패" },
      "404": { description: "댓글을 찾을 수 없음" },
    },
  };

  const createCelebrityRequestHandler = (c: Context) =>
    createCelebrityRequest(c);
  app.post("/request", createCelebrityRequestHandler);
  createCelebrityRequestHandler.swagger = {
    summary: "유명인물 추가 요청",
    description: "새로운 유명인물 추가를 요청합니다.",
    tags: ["유명인물"],
    auth: false,
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              name: { type: "string", description: "유명인물 이름" },
              description: {
                type: "string",
                description: "유명인물에 대한 설명",
              },
              birthDate: {
                type: "string",
                description: "생년월일 (YYYY-MM-DD)",
                pattern: "^\\d{4}-\\d{2}-\\d{2}$",
              },
              occupation: { type: "string", description: "직업" },
            },
            required: ["name", "description", "birthDate", "occupation"],
          },
        },
      },
    },
    responses: {
      "201": { description: "요청 성공" },
      "400": { description: "잘못된 요청 데이터" },
      "500": { description: "서버 오류" },
    },
  };

  return app;
}
