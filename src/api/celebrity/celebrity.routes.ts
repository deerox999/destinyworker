import { Router } from "../../common/router";
import { celebrityProfileApiHandlers } from "./celebrityProfileApi";
import { celebrityRequestApiHandlers } from "./celebrityRequestApi";

export function createCelebrityRouter(): Router {
  const router = new Router();

  // 유명인물 댓글
  router.get('/api/celebrities/:id/comments', celebrityProfileApiHandlers.getCelebrityComments);
  router.post('/api/celebrities/:id/comments', celebrityProfileApiHandlers.createCelebrityComment);
  router.put('/api/celebrities/:id/comments/:commentId', celebrityProfileApiHandlers.updateCelebrityComment);
  router.delete('/api/celebrities/:id/comments/:commentId', celebrityProfileApiHandlers.deleteCelebrityComment);
  
  // 댓글 추천 토글
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
  
  // 유명인물 요청
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

  return router;
} 