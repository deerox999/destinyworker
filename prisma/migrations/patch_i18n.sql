-- npx wrangler d1 execute destiny-local --local --file=prisma/migrations/seed_i18n.sql
-- npx wrangler d1 execute destiny-new --remote --file=prisma/migrations/seed_i18n.sql
-- 커뮤니티 i18n 보완 패치 (직접 쿼리)
-- 목적:
-- 1) 기존 데이터의 language 컬럼 값을 ko로 통일
-- 2) Board.name, Tag.name의 단일 고유 제약을 제거하고 (name, language)로 고유 제약 재구성
-- 3) 조회 최적화를 위한 language 인덱스 생성

-- 1) language 값 ko로 채우기 (NULL/빈 문자열)
UPDATE "Board" SET language = 'ko' WHERE language IS NULL OR language = '';
UPDATE "BoardCategory" SET language = 'ko' WHERE language IS NULL OR language = '';
UPDATE "Post" SET language = 'ko' WHERE language IS NULL OR language = '';
UPDATE "Tag" SET language = 'ko' WHERE language IS NULL OR language = '';

-- 2) 기존 단일 고유 인덱스 제거 (환경마다 이름이 다를 수 있어 여러 후보를 정리)
-- Board.name unique
DROP INDEX IF EXISTS "Board_name_key";
DROP INDEX IF EXISTS "boards_name_key";
DROP INDEX IF EXISTS "idx_board_name_unique";
DROP INDEX IF EXISTS "Board_name_idx";

-- Tag.name unique
DROP INDEX IF EXISTS "Tag_name_key";
DROP INDEX IF EXISTS "tags_name_key";
DROP INDEX IF EXISTS "idx_tag_name_unique";
DROP INDEX IF EXISTS "Tag_name_idx";

-- 3) 필요한 고유/일반 인덱스 생성
-- Board: (name, language) 고유 + language 인덱스
CREATE UNIQUE INDEX IF NOT EXISTS "Board_name_language_key" ON "Board" (name, language);
CREATE INDEX IF NOT EXISTS "Board_language_idx" ON "Board" (language);

-- Tag: (name, language) 고유 + language 인덱스
CREATE UNIQUE INDEX IF NOT EXISTS "Tag_name_language_key" ON "Tag" (name, language);
CREATE INDEX IF NOT EXISTS "Tag_language_idx" ON "Tag" (language);

-- BoardCategory / Post: language 인덱스 (고유 아님)
CREATE INDEX IF NOT EXISTS "BoardCategory_language_idx" ON "BoardCategory" (language);
CREATE INDEX IF NOT EXISTS "Post_language_idx" ON "Post" (language);

-- 완료

