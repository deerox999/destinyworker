## Gemini Project Analysis: destinyworker

> **최종 업데이트 일자**: 2026-10-17

### 1. 개요
- **이름**: `destinyworker`
- **설명**: Cloudflare Workers 기반 글로벌(다국어) 사주/운세/꿈해몽 서비스 백엔드. AI(Gemini) 기반 사주/궁합 분석, 대화형 RAG, 꿈해몽 생성, 사주 칼럼 자동 생성, 커뮤니티, 유명인 사주, 포인트/구독/나이스페이(Nicepay) 결제, 파일 업로드(R2), API 로깅 등을 제공합니다.
- **플랫폼**: Cloudflare Workers (D1, KV, R2, Vectorize, Durable Objects, Cloudflare AI, Secrets Store, Cron Triggers)
- **문서**: `GET /openapi.json`, `GET /swagger`

### 2. 기술 스택
- **언어**: TypeScript (`5.8.x`)
- **프레임워크**: Hono (`^4.8.4`) + `@hono/zod-openapi` + `zod` (`^4.0.5`)
- **DB**: Cloudflare D1 (Prisma `^6.14.0` + `@prisma/adapter-d1`, WASM 엔진)
- **스토리지**: Cloudflare R2 (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`)
- **KV**: Cloudflare KV (뷰 캐시, 이메일 인증코드)
- **벡터DB**: Cloudflare Vectorize (RAG 인덱스 `saju-index`)
- **AI**: Google Gemini SDK (`@google/genai`), Cloudflare AI (임베딩)
- **Durable Objects**:
  - `SajuAnalysisWorker`: 장시간 AI 사주 분석 비동기/스트리밍 처리 및 타임아웃/환불 관리
  - `ColumnWorker`: AI 사주 칼럼 비동기 생성 및 유사도/분량 검증
- **스케줄러**: Cloudflare Cron Triggers (`33 12 * * *` UTC 기준 매일 사주 칼럼 1건 자동 생성)

### 3. 환경/바인딩 구성
- **설정 파일**: `wrangler.toml` (운영), `wrangler.local.json` (로컬 개발, 포트 `9393`)
- **리소스 제한**: `cpu_ms = 30000` (30초), `memory_mb = 128` (128MB)
- **D1**: `DB` (운영: `destiny`, 로컬: `destiny-local`)
- **KV**: `VIEW_CACHE_KV` (조회수/뷰 캐시), `AUTH_CODE_KV` (이메일 인증 코드)
- **R2**: `DESTINY_R2` (`R2_BUCKET_NAME = "destiny"`, `R2_PUBLIC_URL = "https://r2.youram.me"`)
- **Vectorize**: `VECTORIZE_INDEX` (`index_name: "saju-index"`)
- **AI**: `AI` (Cloudflare AI 바인딩)
- **Durable Objects**:
  - `SAJU_ANALYSIS_WORKER` (`SajuAnalysisWorker`)
  - `COLUMN_WORKER` (`ColumnWorker`)
- **Secrets Store (`secrets_store_secrets`)**:
  - OAuth/인증: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (JWT 서명키 겸용)
  - Gemini AI: `GOOGLE_GEMINI_API_KEY`, `GOOGLE_GEMINI_FREE_APIKEY` (무료 운세/칼럼 생성 등)
  - 결제(Nicepay): `NICE_CLIENT_KEY`, `NICE_SECRET_KEY`
  - 이메일/검색: `RESEND_API_KEY`, `BRAVE_API_KEY`
  - 외부 마스터 API: `MASTER_API_ACCESSKEY`, `MASTER_API_SECRET_ACCESSKEY`, `MASTER_API_AUTHID`
- **기타**: `ENVIRONMENT` (`development` / `production`), `observability.enabled = true`

### 4. 프로젝트 구조(요지)
- `src/index.ts`: 앱 엔트리. CORS 설정, 전역 에러/404 핸들링, 라우트 마운트, Durable Objects(`SajuAnalysisWorker`, `ColumnWorker`) 및 `scheduled`(Cron) 핸들러 export
- `src/api/routes.ts`: 메인 라우터 및 OpenAPI/Swagger 설정, `bearerAuth` + `verifyJWT` 인증 미들웨어, 전역 에러 DB 로깅(`logApi`)
- `src/api/saju/ai/*`: 사주/궁합 분석(`analysisSajuApi.ts`), 재질문(`followupApi.ts`), 분석 내역 관리(`analysisManageApi.ts`), 대화형 RAG(`SajuKnowledgeApi.ts`, `RagApi.ts`), 무료 오늘의 운세(`dailyFortuneApi.ts`), 프롬프트(`prompt/*`), DO(`durable-objects/SajuAnalysisWorker.ts`)
- `src/api/saju/profile/*`: 사용자 사주 프로필 CRUD (`saju.routes.ts`, `sajuProfileApi.ts`)
- `src/api/user/*`: 인증(`auth/googleAuthApi.ts`, `auth/localAuthApi.ts`), 유저 정보/동의/탈퇴(`userApi.ts`), 포인트/구독/나이스페이 결제(`payment/paymentApi.ts`)
- `src/api/celebrity/*` & `src/api/admin/celebrity/*`: 유명인 사주 조회 및 관리자 CRUD/배치 생성
- `src/api/community/*`: 다국어 커뮤니티(게시판/카테고리/게시글/댓글/추천/태그) 사용자 및 관리자 API, AI 칼럼 생성(`adminColumnApi.ts`, `columnUtils.ts`, `durable-objects/ColumnWorker.ts`)
- `src/api/dream/*`: 관리자용 AI 꿈해몽 다국어 생성 및 번역 저장 (`dream.routes.ts`, `dreamApi.ts`)
- `src/api/admin/*`: 관리자 대시보드 통계, 유저/포인트 관리, AI 토큰 사용량 통계(`adminApi.ts`), 추천 상품 관리(`recommendation/*`), API 호출/에러 히스토리(`history.routes.ts`, `historyApi.ts`)
- `src/api/common/*`: R2 업로드 URL 발급(`r2.routes.ts`, `r2Api.ts`), 전체 사이트맵 조회(`sitemapApi.ts`)
- `src/common/*`: Prisma 클라이언트/관리자 판별(`prismaUtils.ts`), 포인트/구독/결제 유틸(`paymentUtils.ts`), JWT/시크릿/다국어 유틸(`utils.ts`), RAG 유틸(`ragUtils.ts`), API 로거(`historyLogger.ts`), 공통 스키마(`schemas.ts`)
- `prisma/schema.prisma`: D1 SQLite 전체 데이터 모델 정의

### 5. 실행 스크립트 (`package.json`)
- `dev`: 로컬 설정 기반 개발 서버 실행 (`wrangler dev --config wrangler.local.json`, 포트 `9393`)
- `prod`: 기본 설정 기반 개발 서버 실행 (`wrangler dev`)
- `deploy`: 프로덕션 배포 (`wrangler deploy`)
- `check`: TypeScript 타입체크 + 배포 드라이런 (`tsc && wrangler deploy --dry-run`)
- `cf-typegen`: Cloudflare 바인딩 타입 생성 (`wrangler types`)
- `postinstall`: Prisma 클라이언트 생성 (`npx prisma generate`)
- `seed:local` / `seed:prod`: 원격 DB의 유명인(`Celebrity`, `CelebrityTranslation`) 데이터를 덤프하여 시드 SQL 생성 후 로컬/원격 D1에 적재

### 6. 주요 라우팅 요약
- `GET /openapi.json`, `GET /swagger`: OpenAPI 3.0 스펙 및 Swagger UI
- `/api/auth`: Google OAuth 로그인, 로그아웃, 내 정보(`/me`), 토큰 갱신, 이메일 인증코드 요청/검증 로그인
- `/api/user`: 프로필(닉네임/사진) 수정, 개인정보/리포트 저장 동의 업데이트, 회원 탈퇴
- `/api/payment`:
  - `GET /points`, `POST /complete`: 포인트 조회 및 증감 처리
  - `POST /orders/initiate`, `GET /orders`: 결제 주문 생성 및 내역 조회
  - `POST /nice/approve`, `POST /nice/cancel`: 나이스페이 결제 승인 및 취소/환불
  - `POST /subscribe`, `POST /subscribe/refund`: 월 단위(30일) 구독 구매 및 잔여 기간 환불
- `/api/saju-profiles`: 사주 프로필 CRUD (혈액형, MBTI, 별자리, 손금, 관상, 풍수, 그룹/정렬 포함)
- `/api/ai`:
  - `POST /analysis`: 통합 사주/궁합 분석 요청 (포인트 차감, 비동기 DO Job)
  - `GET /analysis/status`: 분석 Job 상태 조회 및 결과 반환
  - `POST /analysis/follow-up`: 기존 분석 리포트 기반 재질문 (할인 과금)
  - `GET /analyses`, `GET/DELETE /analyses/{id}`, `PATCH /analyses/{id}/title`, `PATCH /analyses/{id}/favorite`: 분석 결과 목록/상세/삭제/제목수정/즐겨찾기
  - `POST /saju-chat`, `GET/DELETE /saju-chat`: 대화형 RAG 채팅 및 대화 목록/삭제
  - `POST /daily-fortune`: 무료 오늘의 운세 (비인증, 출석 포인트 보상 연동)
  - `RAG`: 지식 문서 추가/수정/삭제/조회 및 메타데이터 스키마 조회
- `/api/celebrities` & `/api/admin/celebrities`: 유명인 목록/검색 조회 및 관리자용 단건/대량(batch) 등록·수정·삭제
- `/api/admin`: 유저 목록/수정, 유저별 프로필·포인트·분석내역 조회, 포인트 수동 지급/차감, 모델별·유저별 AI 토큰 사용량 및 대시보드 통계
- `/api/admin/recommendations`: 추천 상품(`Recommendation`) CRUD
- `/api/community`:
  - `/user/*`: 다국어 게시판/카테고리/게시글/댓글 CRUD 및 추천(Like)
  - `/admin/*`: 게시판/카테고리 다국어 관리, AI 사주 칼럼 미리보기(`/columns/dry-run`), 비동기 생성(`/columns/generate`), 상태 조회(`/columns/generate/status`)
- `/api/dream`: `POST /dream/generate` (관리자 전용 다국어 꿈해몽 생성 및 유사도 검증 후 저장)
- `/api/history`: `POST /logs`, `GET /logs`, `GET /logs/errors`, `GET /stats` (API 호출/에러 로그 기록 및 일별·상태별·URL별 통계)
- `/api/sitemap`: `GET /full` (유명인 및 커뮤니티 게시글 전체 사이트맵 데이터)
- `/api/R2`: Pre-signed 업로드 URL 발급 및 R2 객체 관리

### 7. 데이터 모델(핵심)
- **User**: Google/이메일 사용자 정보, 역할(`user`/`admin`), 포인트(`point`, 기본 300), 구독 만료일(`subscriptionUntil`), 개인정보 및 리포트 저장 동의 상태
- **ApiLog**: HTTP 메서드, URL, 상태코드, 소요시간(`durationMs`), 요청자/파라미터 스냅샷, IP, User-Agent, 에러 노트
- **SajuProfile**: 출생 일시/달력/성별/국가/도시, 맥락(`context`), 혈액형/MBTI/별자리, 손금(`palmistry`)/관상(`physiognomy`)/풍수(`geomancy`), 그룹명 및 정렬순서
- **SajuAnalysis**: 분석 유형(`analysisType`, `type`), 제목, 사주 데이터, 프롬프트, AI 응답, 차트(`chartJson`), 사용 모델, 소모 포인트, 즐겨찾기, 언어(`i18n`), 타임존, 소요 시간, 토큰 메타데이터(`usageMetadata`), 옵션 원본(`optionsJson`)
- **PointTransaction & Payment**: 포인트 증감 내역(`DEBIT`/`CREDIT`, `reference`, `analysisId`) 및 나이스페이 결제 원장(`orderId`, `tid`, `amount`, `status`, `rawData`)
- **Celebrity & CelebrityTranslation**: 유명인 출생정보/조회수 및 언어별 이름/직업/설명/AI 분석 결과(`aiResponse`)
- **Recommendation**: 추천 운세/궁합 상품 메타데이터, 배너/갤러리 이미지, 질문 목록 JSON
- **Document & ConversationHistory**: RAG 지식 문서(텍스트/메타데이터) 및 대화형 채팅 히스토리
- **Board / BoardCategory / Post / Comment / PostLike / CommentLike / Tag / PostTag**: 다국어(`ko`, `en`, `ja`, `zh`, `vi`) 기반 커뮤니티 도메인
- **Dream & DreamTranslation**: 꿈해몽 기본 엔티티(길흉 `auspiciousness`, 항목별 점수 `scores`, 중복 방지키 `duplicateKey`) 및 언어별 번역(제목, 마크다운 본문, 키워드, 유의어, 출처)

### 8. Gemini 통합 상세
- **SDK/모델 (`SERVER_MODEL_CONFIG`)**:
  - `@google/genai` 사용
  - 기본 모델: `gemini-3.8-flash`
  - 고품질(`highQuality`) 옵션 모델: `gemini-2.5-pro`
- **프롬프트 생성**: 서버에서 옵션(분석관점, 이해도레벨, 분석요소, 어조 등) 기반 시스템/유저 프롬프트 안전 생성 (`analysisSajuApi.ts`, `prompt/*`)
- **Durable Object (`SajuAnalysisWorker`)**:
  - 엔드포인트: `/jobs/create`, `/jobs/status`, `/jobs/stream`, `/jobs/process`
  - Cloudflare 524 타임아웃(100초) 회피를 위해 논스트리밍 요청도 업스트림(Gemini)은 항상 스트리밍(`generateContentStream`)으로 호출하여 초기 바이트를 빠르게 수신
  - 524/스트림 오류 시 백그라운드 처리 전환 및 폴링 유도, 10분 타임아웃 초과 시 자동 실패 처리 및 포인트 환불(`refundPoints`)
  - 완료 시 품질 검사(미달 시 1회 재시도), DB 저장, 포인트 거래에 `analysisId` 연결, 필요 시 유명인 번역(`celebrityTranslation`) 자동 반영
- **Durable Object (`ColumnWorker`)**:
  - 무료 API 키(`GOOGLE_GEMINI_FREE_APIKEY`)를 사용해 난이도(`초급`/`중급`/`고급`) 및 언어별 사주 칼럼 HTML 생성
  - 분량 검증(`validateHtml`) 및 기존 게시글과의 코사인/자카드 유사도 검사(`computeMaxSimilarity < 0.85`) 통과 시 커뮤니티 게시글로 자동 등록
- **대화형 RAG (`SajuKnowledgeApi`)**:
  - Cloudflare AI 임베딩(`@cf/baai/bge-base-en-v1.5`) + Vectorize `topK` 검색 후 D1에서 본문 로드, 필요 시 Brave Search 보강

### 9. 포인트/구독/과금 정책 (`paymentUtils.ts`)
- **구독 정책**: 월 구독료 `900P` (30일 단위, 최대 12개월 연장 가능, 잔여 30일 단위 환불 지원)
- **사주 분석 기본가**:
  - 연간운세: `150P`
  - 종합운세: `500P`
  - 궁합사주(`compatibility`): `600P`
  - 기타 일반 분석: `300P`
- **모델 및 재질문 가중치**:
  - 기본 모델(`flash`): `1.0x`
  - 고품질 모델(`pro`): 구독자 `1.2x`, 비구독자 `1.5x`
  - 재질문(`follow-up`): 기준가의 `0.5x` (50% 할인, Pro 모델 상속 시 가중치 반영)
- **출석 및 커뮤니티 보상**:
  - 오늘의 운세 출석: `10P`
  - 순수 텍스트 게시글 작성: `30P`, 댓글 작성: `5P`, 게시글 추천 보상: `10P`, 댓글 추천 보상: `5P`
- **차감 및 환불**: `usePoints`로 선차감 후 Job 제출, 실패/타임아웃 시 `refundPoints`로 자동 환불 (중복 환불 방지 가드 적용)

### 10. 파일 업로드(R2)
- `POST /api/R2/upload-url`로 Pre-signed URL 발급 후 프론트엔드에서 직접 PUT 업로드
- `R2_PUBLIC_URL` (`https://r2.youram.me`) 기반으로 게시글/프로필/추천상품 내 이미지 URL 제공 및 미사용 이미지 정리 지원

### 11. 마이그레이션/운영
- 스키마: `prisma/schema.prisma`
- SQL 마이그레이션: `prisma/migrations/*.sql`, `prisma/migration.txt`에 수동 실행 예시 기록
  - 예) `npx wrangler d1 execute destiny --remote --command "..."`
- 로컬 개발 DB: `prisma/dev.db` 및 D1 로컬 바인딩(`destiny-local`)
- 배포 전 점검: `npm run check` (`tsc && wrangler deploy --dry-run`)

### 12. 보안/품질 노트(개선 권장)
- **관리자 판별**: `src/common/prismaUtils.ts`의 `isAdmin`에 특정 이메일(`deerox999@gmail.com`) 하드코드가 병행 중 → DB `role === "admin"` 단일 기준으로 일원화 권장
- **라우트 보호**: `/api/community/admin/*` 및 `/api/history/logs` 등 일부 라우트에 인증/관리자 미들웨어 적용 여부 점검 권장
- **경로 케이스**: `/api/R2`, `/api/dream/dream/generate` 등 일부 경로 네이밍/대소문자 일관화 권장
- **레이트리밋**: 이메일 인증 코드 요청 등에 Cloudflare Rate Limiting 또는 Turnstile 적용 권장

### 13. 체크리스트(로컬 실행)
1. Cloudflare 바인딩 준비: D1(`destiny-local`), KV(`VIEW_CACHE_KV`, `AUTH_CODE_KV`), R2(`DESTINY_R2`), Vectorize(`saju-index`), AI, Durable Objects
2. Secrets Store 또는 `.dev.vars` 시크릿 확인: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_GEMINI_API_KEY`, `GOOGLE_GEMINI_FREE_APIKEY`, `NICE_CLIENT_KEY`, `NICE_SECRET_KEY`, `RESEND_API_KEY`, `BRAVE_API_KEY` 등
3. `npm i` (자동으로 `prisma generate` 실행) → `npm run cf-typegen` (선택) → `npm run dev` (포트 `9393`)