-- 커뮤니티 다국어 지원을 위한 누락 컬럼 추가 스크립트
-- 주의: 이 스크립트는 해당 컬럼이 없는 환경에서만 1회 실행하세요.
-- 대상 테이블: Board, BoardCategory, Post, Tag

-- Board: language 컬럼 추가
ALTER TABLE "Board" ADD COLUMN language TEXT DEFAULT 'ko';

-- BoardCategory: language 컬럼 추가
ALTER TABLE "BoardCategory" ADD COLUMN language TEXT DEFAULT 'ko';

-- Post: language 컬럼 추가
ALTER TABLE "Post" ADD COLUMN language TEXT DEFAULT 'ko';

-- Tag: language 컬럼 추가
ALTER TABLE "Tag" ADD COLUMN language TEXT DEFAULT 'ko';


