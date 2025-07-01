import { Router } from '../router';
import { celebrityProfileApiHandlers } from '../../api/celebrityProfileApi';

/**
 * 유명인물 댓글 관련 라우트를 등록합니다.
 * 유명인물 데이터는 프론트엔드에서 정적으로 관리됩니다.
 * @param router Router 인스턴스
 */
export function registerCelebrityProfileRoutes(router: Router): void {
  // 유명인물 댓글 목록 조회 (조회수 포함)
  router.get('/api/celebrities/:id/comments', celebrityProfileApiHandlers.getCelebrityComments);
  
  // 유명인물 댓글 작성 (로그인 필요)
  router.post('/api/celebrities/:id/comments', celebrityProfileApiHandlers.createCelebrityComment);
  
  // 유명인물 댓글 수정 (본인만)
  router.put('/api/celebrities/:id/comments/:commentId', celebrityProfileApiHandlers.updateCelebrityComment);
  
  // 유명인물 댓글 삭제 (본인 또는 관리자)
  router.delete('/api/celebrities/:id/comments/:commentId', celebrityProfileApiHandlers.deleteCelebrityComment);
}