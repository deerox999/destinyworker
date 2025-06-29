import { Router } from '../../common/router';
import { adminApiHandlers } from '../adminApi';

/**
 * 관리자 관련 라우트를 등록합니다
 * 모든 엔드포인트는 관리자 권한이 필요합니다
 */
export function registerAdminRoutes(router: Router) {
  // 가입한 유저 목록 조회 (페이지네이션, 검색 지원)
  router.get('/api/admin/users', adminApiHandlers.getUsers);
  
  // 특정 유저의 프로필 조회
  router.get('/api/admin/users/:userId/profiles', adminApiHandlers.getUserProfiles);
  
  // 전체 통계 정보 조회
  router.get('/api/admin/stats', adminApiHandlers.getAdminStats);
} 