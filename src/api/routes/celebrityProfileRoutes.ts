import { Router } from '../../common/router';
import { celebrityProfileApiHandlers } from '../celebrityProfileApi';

/**
 * 유명인물 사주 프로필 관련 라우트를 등록합니다.
 * @param router Router 인스턴스
 */
export function registerCelebrityProfileRoutes(router: Router): void {
  // 유명인물 목록 조회 (페이징, 검색 지원)
  router.get('/api/celebrities', celebrityProfileApiHandlers.getCelebrites);
  
  // 특정 유명인물 조회
  router.get('/api/celebrities/:id', celebrityProfileApiHandlers.getCelebrity);
  
  // 유명인물 생성 (관리자만)
  router.post('/api/celebrities', celebrityProfileApiHandlers.createCelebrity);
  
  // 유명인물 수정 (관리자만)
  router.put('/api/celebrities/:id', celebrityProfileApiHandlers.updateCelebrity);
  
  // 유명인물 삭제 (관리자만)
  router.delete('/api/celebrities/:id', celebrityProfileApiHandlers.deleteCelebrity);
}

// 이전 버전과의 호환성을 위한 핸들러 (사용하지 않음)
export async function handleCelebrityProfileRoutes(
  request: Request,
  env: any,
  pathname: string
): Promise<Response | null> {
  const method = request.method;
  
  // 기본 경로 매칭
  if (pathname === '/api/celebrities') {
    switch (method) {
      case 'GET':
        return celebrityProfileApiHandlers.getCelebrites(request, env);
      case 'POST':
        return celebrityProfileApiHandlers.createCelebrity(request, env);
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
  
  // ID가 포함된 경로 매칭 (/api/celebrities/{id})
  const idMatch = pathname.match(/^\/api\/celebrities\/([^\/]+)$/);
  if (idMatch) {
    const id = idMatch[1];
    const params = { id };
    
    switch (method) {
      case 'GET':
        return celebrityProfileApiHandlers.getCelebrity(request, env, params);
      case 'PUT':
        return celebrityProfileApiHandlers.updateCelebrity(request, env, params);
      case 'DELETE':
        return celebrityProfileApiHandlers.deleteCelebrity(request, env, params);
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