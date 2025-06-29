export const API_TAGS = [
  {
    name: "데이터베이스",
    description: "데이터베이스 기본 작업 (댓글, JSON 저장소)"
  },
  {
    name: "인증", 
    description: "Google OAuth 로그인 및 세션 관리"
  },
  {
    name: "사주 프로필",
    description: "개인 사주 프로필 관리 (로그인 필요)"
  },
  {
    name: "유명인물",
    description: "유명인물 사주 프로필 (공개 조회, 관리자 편집)"
  }
] as const;

// 경로에서 태그 자동 추출
export function getTagFromPath(path: string): string {
  if (path.startsWith('/api/auth')) return '인증';
  if (path.startsWith('/api/saju-profiles')) return '사주 프로필';
  if (path.startsWith('/api/celebrities')) return '유명인물';
  if (path.startsWith('/api/comments') || path.startsWith('/api/json')) return '데이터베이스';
  return '기타';
} 