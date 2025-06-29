-- 사주 프로필 테이블 생성
-- 사용자별 사주 정보 저장을 위한 테이블
CREATE TABLE IF NOT EXISTS "saju_profiles" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "user_id" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "year" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "hour" TEXT NOT NULL,
  "minute" TEXT NOT NULL,
  "calendar" TEXT NOT NULL,
  "gender" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 사용자별 사주 프로필 검색을 위한 인덱스
CREATE INDEX IF NOT EXISTS "idx_saju_profiles_user_id" ON "saju_profiles" ("user_id");

-- 최신 순서 정렬을 위한 인덱스
CREATE INDEX IF NOT EXISTS "idx_saju_profiles_updated_at" ON "saju_profiles" ("updated_at" DESC); 