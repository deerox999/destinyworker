-- 실행 방법(로컬):
-- npx wrangler d1 execute destiny-local --local --file=prisma/migrations/add_api_log.sql

-- 실행 방법(원격/개발):
-- npx wrangler d1 execute destiny-dev --remote --file=prisma/migrations/add_api_log.sql

-- 실행 방법(프로덕션/원격):
-- npx wrangler d1 execute destiny-new --remote --file=prisma/migrations/add_api_log.sql

-- ApiLog 테이블 생성
CREATE TABLE IF NOT EXISTS ApiLog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  statusCode INTEGER,
  durationMs INTEGER,
  userJson TEXT,
  paramsJson TEXT,
  responseJson TEXT,
  ip TEXT,
  userAgent TEXT,
  notes TEXT,
  createdAt DATETIME DEFAULT (datetime('now', 'utc'))
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_apilog_createdAt ON ApiLog(createdAt);
CREATE INDEX IF NOT EXISTS idx_apilog_status_createdAt ON ApiLog(statusCode, createdAt);
CREATE INDEX IF NOT EXISTS idx_apilog_url_createdAt ON ApiLog(url, createdAt);


