-- 사용자 테이블에 role 컬럼 추가
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';

-- 유명인물 사주 프로필 테이블 생성
CREATE TABLE celebrity_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  year TEXT NOT NULL,
  month TEXT NOT NULL,
  day TEXT NOT NULL,
  calendar TEXT NOT NULL,
  gender TEXT NOT NULL,
  occupation TEXT NOT NULL,
  description TEXT NOT NULL,
  thumbnail TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 샘플 데이터 삽입
INSERT INTO celebrity_profiles (
  id, name, year, month, day, calendar, gender, occupation, description
) VALUES (
  'lee-seung-man',
  '이승만',
  '1875',
  '03',
  '26',
  '양력',
  '남자',
  '대통령',
  '1대~3대 대통령 (재임 1948~1960)'
); 