## Gemini Project Analysis: destinyworker

### 1. 개요
- **이름**: `destinyworker`
- **설명**: Cloudflare Workers 기반 사주/운세 서비스. AI(Gemini) 분석, 대화형 RAG, 커뮤니티, 유명인 사주, 포인트 결제/차감, 파일 업로드(R2) 등을 제공합니다.
- **플랫폼**: Cloudflare Workers (D1, KV, R2, Vectorize, Durable Objects, Cloudflare AI)
- **문서**: `GET /openapi.json`, `GET /swagger`

### 2. 기술 스택
- **언어**: TypeScript
- **프레임워크**: Hono + `@hono/zod-openapi`
- **DB**: Cloudflare D1 (Prisma + `@prisma/adapter-d1`)
- **스토리지**: Cloudflare R2 (이미지 등)
- **KV**: Cloudflare KV (뷰 캐시, 이메일 인증코드)
- **벡터DB**: Cloudflare Vectorize (RAG 인덱스)
- **AI**: Google Gemini SDK(`@google/genai`), Cloudflare AI(임베딩)
- **Durable Object**: 장시간 AI 분석 비동기 처리(SajuAnalysisWorker)

### 3. 환경/바인딩 구성
- 파일: `wrangler.toml`, `wrangler.local.json`
- **D1**: `DB` (로컬/원격), 필요 시 `DB_LOCAL`, `DB_DEV` 정의 존재
- **KV**: `VIEW_CACHE_KV`, `AUTH_CODE_KV`
- **R2**: `DESTINY_R2` (+ `R2_PUBLIC_URL` 사용)
- **Vectorize**: `VECTORIZE_INDEX` (index_name: `saju-index`)
- **AI**: `AI` (Cloudflare AI), `GOOGLE_GEMINI_API_KEY` (Google Gemini)
- **OAuth/보안**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`(현재 JWT 서명키로도 사용 중)
- **이메일**: `RESEND_API_KEY`
- **검색(옵션)**: `BRAVE_API_KEY`
- **DO**: `SAJU_ANALYSIS_WORKER` (클래스 `SajuAnalysisWorker`)
- **기타**: `ENVIRONMENT` (development/production), Observability 활성화

### 4. 프로젝트 구조(요지)
- `src/index.ts`: 앱 엔트리. CORS, 에러 핸들링, 라우트 마운트, DO export
- `src/api/routes.ts`: 메인 라우터/Swagger. `bearerAuth` + `verifyJWT` 적용
- `src/api/ai/*`: 사주 분석/대화형 RAG/일일 운세/DO 통신
- `src/api/user/*`: 인증(Google/이메일), 유저 API, 결제/포인트 API
- `src/api/celebrity/*`: 유명인 사주/프로필/요청
- `src/api/community/*`: 커뮤니티(게시글/댓글/추천) 사용자/관리자용
- `src/common/*`: Prisma 유틸, JWT/언어/페이지네이션/결제, R2 API, RAG 유틸
- `prisma/schema.prisma`: 전체 스키마(유저/세션/사주/분석/문서/대화/커뮤니티/포인트 등)

### 5. 실행 스크립트
- `dev`: 원격 바인딩 포함 로컬 개발 (`wrangler dev --x-remote-bindings --config wrangler.local.json`)
- `dev:remote`: 원격 바인딩 개발 (`wrangler dev --x-remote-bindings`)
- `deploy`: 배포
- `check`: 타입체크 + 드라이런 배포
- `cf-typegen`: Cloudflare 타입 생성 (`worker-configuration.d.ts`)
- `secret:put`: `RESEND_API_KEY` 등록

### 6. 주요 라우팅 요약
- `GET /openapi.json`, `GET /swagger`: OpenAPI/Swagger UI
- `/api/auth`: Google 로그인/로그아웃/토큰갱신, 이메일 코드 로그인
- `/api/user`: 사용자 정보/프로필 이미지 처리 등
- `/api/payment`: 포인트 잔액/거래 내역
- `/api/saju-profiles`: 사주 프로필 CRUD
- `/api/ai`
  - `POST /analysis`: 통합 사주 분석(포인트 차감, 비동기 Job)
  - `GET /analysis/status`: 분석 Job 상태 조회
  - `POST /analysis/follow-up`: 기존 결과 기반 재질문(할인 과금)
  - `POST /saju-chat`: 대화형 RAG 시작/지속, `GET/DELETE /saju-chat` 목록/삭제
  - `POST /daily-fortune`: 무료 오늘의 운세(비인증)
  - `RAG`: 문서 추가/수정/삭제/조회, 메타스키마 조회
- `/api/celebrities` 및 `/api/admin/*`: 유명인/관리자 기능
- `/api/community/*`: 커뮤니티 사용자/관리자 기능
- `/api/R2/upload-url`: R2 업로드용 Pre-signed URL 생성

### 7. 데이터 모델(핵심)
- **User/Session**: Google/로컬 이메일 로그인, 세션 JWT 보관
- **SajuProfile**: 사용자 사주 기본정보
- **SajuAnalysis**: AI 분석 결과(타이틀/응답/차트/모델/포인트/옵션/시간 등)
- **Document**: RAG 지식 문서(텍스트/메타데이터)
- **ConversationHistory**: 대화형 RAG 메시지 로그
- **PointTransaction**: 포인트 증감/참조/분석ID
- **Celebrity/Comment/Like/ViewCount/Translation**: 유명인 도메인
- **Board/Post/Comment/Like/Tag**: 커뮤니티 도메인

### 8. Gemini 통합 상세
- **SDK/모델**: `@google/genai` 사용. 기본 `gemini-2.5-flash`, 고품질 옵션 시 `gemini-2.5-pro`
- **프롬프트 생성**: 서버에서 옵션 기반 시스템/유저 프롬프트 구성(`analysisSajuApi.ts`, `prompt/*`)
- **페이로드**: `buildGeminiPayload`에서 systemInstruction/contents/safety/generationConfig 생성
- **Durable Object 처리**: `SajuAnalysisWorker`
  - 엔드포인트: `/jobs/create`, `/jobs/status`, `/jobs/stream`, `/jobs/process`
  - 업스트림은 항상 스트리밍(`generateContentStream`)으로 호출해 CF 524 회피 시도
  - 클라이언트 스트리밍 시 SSE로 텍스트 청크 전송, 완료 후 `[DONE]`
  - 524/스트림 오류 시 백그라운드 전환(클라 공지)
  - 10분 타임아웃 스케줄링, 초과 시 실패 처리/환불
  - 후처리: `finalizeAndPersist`에서 결과 품질 검사, DB 업데이트, 포인트 거래에 `analysisId` 연결, 실패 시 `refundPoints`
- **대화형 RAG**: `SajuKnowledgeApi`
  - 검색: Cloudflare AI 임베딩(`@cf/baai/bge-base-en-v1.5`) + Vectorize topK, D1에서 본문 로드
  - 필요 시 Brave Search 보강(`BRAVE_API_KEY`)
  - Gemini로 답변 생성(역할 변환: assistant→model 등)
- **무료 오늘의 운세**: `dailyFortuneApi.ts`에서 Gemini 호출

### 9. 포인트/과금 정책
- `getAnalysisTypePoints`: 기본 과금(예: 연간운세 500, 종합운세 2000, 기타 1000)
- `usePoints` → 차감/거래 기록 저장 → 분석 Job 제출
- 재질문(follow-up): 기준가의 50% 과금, Pro 모델 상속 시 계수(1.5) 반영
- 실패/타임아웃 시 환불(`refundPoints`)

### 10. 파일 업로드(R2)
- `POST /api/R2/upload-url`로 Pre-signed URL 발급 후, 프론트에서 직접 PUT 업로드
- `R2_PUBLIC_URL` 기반으로 콘텐츠 내 이미지 추적/정리 로직 존재

### 11. RAG 파이프라인 요약
- 문서 저장(D1 `Document`), 임베딩 생성(Cloudflare AI), Vectorize에 upsert
- 쿼리 시 임베딩→Vectorize topK→D1 본문 조회→프롬프트 컨텍스트 구성→Gemini 호출

### 12. 마이그레이션/운영
- 스키마: `prisma/schema.prisma`
- SQL: `prisma/migrations/*.sql`, `prisma/migration.txt`에 수동 실행 예시
  - 예) `npx wrangler d1 execute destiny-new --remote --command "ALTER TABLE SajuAnalysis ADD COLUMN optionsJson TEXT;"`
- 개발/로컬 DB: `prisma/dev.db`
- 타입/배포 점검: `npm run check`

### 13. 보안/품질 노트(개선 권장)
- **관리자 판별**: 이메일 하드코드 존재 → DB `role` 기반만 사용
- **CORS**: 환경별 오리진 분기/`Vary: Origin` 적용 권장
- **경로 케이스**: `/api/R2` 등 대소문자 일관화(소문자 권장)
- **OpenAPI**: 실제 응답과 스키마 일치 강화, 공통 에러/보안 스키마 일관화
- **레이트리밋**: 이메일 인증 코드 요청에 레이트리밋/Turnstile 권장

### 14. 체크리스트(로컬 실행)
- Cloudflare 계정/바인딩 준비: D1, KV(`VIEW_CACHE_KV`, `AUTH_CODE_KV`), R2(`DESTINY_R2`), Vectorize, AI, DO
- 시크릿 등록: `RESEND_API_KEY`, `GOOGLE_GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, 필요 시 `BRAVE_API_KEY`
- `npm i` → `npm run cf-typegen`(옵션) → `npm run dev`

### 15. 부록: 참고 파일
- 구성: `wrangler.toml`, `wrangler.local.json`, `worker-configuration.d.ts`
- 엔트리/라우팅: `src/index.ts`, `src/api/routes.ts`
- Gemini/DO: `src/api/saju/ai/analysisSajuApi.ts`, `src/api/saju/ai/durable-objects/SajuAnalysisWorker.ts`, `src/api/saju/ai/utils.ts`
- RAG: `src/common/ragUtils.ts`, `src/api/saju/ai/RagApi.ts`, `src/api/saju/ai/chat.routes.ts`
- 인증: `src/api/user/auth/*`
- 포인트: `src/common/paymentUtils.ts`
- 스키마: `prisma/schema.prisma`