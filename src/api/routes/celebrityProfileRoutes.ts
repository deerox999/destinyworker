import { Router } from '../../common/router';
import { celebrityProfileApiHandlers } from '../celebrityProfileApi';

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

// 이전 버전과의 호환성을 위한 핸들러 (사용하지 않음)
export async function handleCelebrityProfileRoutes(
  request: Request,
  env: any,
  pathname: string
): Promise<Response | null> {
  const method = request.method;

  // 댓글 목록 조회 (/api/celebrities/{id}/comments)
  const commentsMatch = pathname.match(/^\/api\/celebrities\/([^\/]+)\/comments$/);
  if (commentsMatch) {
    const id = commentsMatch[1];
    const params = { id };
    
    switch (method) {
      case 'GET':
        return celebrityProfileApiHandlers.getCelebrityComments(request, env, params);
      case 'POST':
        return celebrityProfileApiHandlers.createCelebrityComment(request, env, params);
      case 'OPTIONS':
        return new Response(null, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
        });
      default:
        return new Response('Method Not Allowed', { status: 405 });
    }
  }

  // 댓글 수정/삭제 (/api/celebrities/{id}/comments/{commentId})
  const commentMatch = pathname.match(/^\/api\/celebrities\/([^\/]+)\/comments\/([^\/]+)$/);
  if (commentMatch) {
    const [, id, commentId] = commentMatch;
    const params = { id, commentId };
    
    switch (method) {
      case 'PUT':
        return celebrityProfileApiHandlers.updateCelebrityComment(request, env, params);
      case 'DELETE':
        return celebrityProfileApiHandlers.deleteCelebrityComment(request, env, params);
      case 'OPTIONS':
        return new Response(null, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
        });
      default:
        return new Response('Method Not Allowed', { status: 405 });
    }
  }
  
  // 매칭되지 않으면 null 반환 (다른 라우터가 처리)
  return null;
} 