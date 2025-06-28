-- JSON 저장 테이블 생성
CREATE TABLE IF NOT EXISTS json_storage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    json_data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 추가 (user_id로 빠른 검색을 위해)
CREATE INDEX IF NOT EXISTS idx_json_storage_user_id ON json_storage(user_id);

-- 같은 user_id로 여러 JSON을 저장할 수 있도록 UNIQUE 제약 조건은 추가하지 않음 