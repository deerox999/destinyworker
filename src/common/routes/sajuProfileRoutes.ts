import { Router } from '../router';
import { sajuProfileApiHandlers } from '../../api/sajuProfileApi';

/**
 * 사주 프로필 관련 라우트를 등록합니다
 * 모든 엔드포인트는 JWT 인증이 필요합니다
 */
export function registerSajuProfileRoutes(router: Router) {
  // 사주 프로필 목록 조회
  router.get('/api/saju-profiles', sajuProfileApiHandlers.getSajuProfiles);
  
  // 사주 프로필 생성
  router.post('/api/saju-profiles', sajuProfileApiHandlers.createSajuProfile);
  
  // 특정 사주 프로필 조회
  router.get('/api/saju-profiles/:id', sajuProfileApiHandlers.getSajuProfile);
  
  // 사주 프로필 수정
  router.put('/api/saju-profiles/:id', sajuProfileApiHandlers.updateSajuProfile);
  
  // 사주 프로필 삭제
  router.delete('/api/saju-profiles/:id', sajuProfileApiHandlers.deleteSajuProfile);
} 