# Gemini Project Analysis: destinyworker

## 1. Project Overview

- **Name:** `destinyworker`
- **Description:** Cloudflare Workers 기반의 서버리스 애플리케이션입니다. 한국의 사주(Saju) 또는 운세 서비스를 제공합니다.
- **Platform:** Cloudflare Workers

## 2. Technology Stack

- **Language:** TypeScript
- **Framework:** Hono (엣지 환경을 위한 웹 프레임워크)
- **Database:** Cloudflare D1 (SQLite 기반)
- **ORM:** Prisma
- **Cloud Services:**
  - **Compute:** Cloudflare Workers
  - **Database:** Cloudflare D1
  - **Key-Value Store:** Cloudflare KV (뷰 캐싱용 `VIEW_CACHE_KV`)
  - **Object Storage:** Cloudflare R2 (파일 저장용 `DESTINY_R2`)
  - **AI:** Cloudflare AI (`AI` 바인딩)
  - **Vector Database:** Cloudflare Vectorize (RAG용 `VECTORIZE_INDEX`)
- **Authentication:** Google OAuth
- **API Documentation:** Swagger (OpenAPI)

## 3. Project Structure

- `src/index.ts`: Cloudflare Worker의 진입점. Hono를 사용하여 라우트를 초기화하고 전역 미들웨어를 적용합니다.
- `src/api/`: 모든 API 라우트 정의가 포함되어 있습니다. `admin`, `ai`, `celebrity`, `saju`, `user` 등 도메인별로 구조화되어 있습니다.
- `src/common/`: 유틸리티 함수(`utils.ts`, `prismaUtils.ts`), 공유 클래스 및 Swagger 설정이 포함되어 있습니다.
- `prisma/schema.prisma`: 데이터베이스 스키마를 정의합니다. 사용자, 사주 프로필, 유명인, AI 대화, 문서 등 애플리케이션의 핵심 데이터 모델을 파악할 수 있습니다.
- `scripts/migrate-d1.js`: Cloudflare D1 데이터베이스 마이그레이션을 처리하는 사용자 정의 스크립트입니다.
- `wrangler.json`: Cloudflare Worker의 설정 파일. D1, KV, R2, AI, Vectorize 등 서비스 바인딩을 정의합니다.
- `package.json`: 프로젝트의 의존성과 스크립트를 정의합니다.

## 4. Key `npm` Scripts

- `dev`: `wrangler dev --remote --port 9393`
  - 원격 Cloudflare 서비스에 연결된 로컬 개발 서버를 시작합니다.
- `deploy`: `wrangler deploy`
  - 애플리케이션을 Cloudflare에 배포합니다.
- `db:migrate:remote`: `node scripts/migrate-d1.js --remote`
  - 원격 D1 데이터베이스에 대해 마이그레이션을 실행합니다.
- `db:migrate:force`: `node scripts/migrate-d1.js --force`
  - 데이터 손실을 유발할 수 있는 강제 마이그레이션을 실행합니다. 주의가 필요합니다.
- `check`: `tsc && wrangler deploy --dry-run`
  - 코드를 타입 체크하고 배포를 시뮬레이션합니다.
- `generate:swagger`: `swagger-typescript-api ...`
  - OpenAPI 명세로부터 TypeScript API 클라이언트를 생성합니다.

## 5. Core Functionality

- **사용자 인증:** Google 계정을 통한 회원가입 및 로그인을 지원합니다.
- **사주(Saju):** 사용자는 자신의 생년월일시를 기반으로 사주 프로필을 생성하고 관리할 수 있습니다.
- **유명인 사주:** 유명인의 사주 정보를 제공하고, 사용자는 프로필을 보고 댓글을 달 수 있습니다.
- **AI 챗봇:** 사주에 대해 질문할 수 있는 AI 챗봇 기능이 있습니다. RAG(Retrieval-Augmented Generation) 기술을 사용하여 `Document` 테이블의 지식 베이스를 기반으로 답변을 생성합니다.
- **파일 저장:** Cloudflare R2를 사용하여 프로필 이미지와 같은 파일을 저장합니다.
- **푸시 알림:** 사용자에게 웹 푸시 알림을 보낼 수 있습니다.

## 6. Database Migration

- 데이터베이스 스키마 변경은 `prisma/schema.prisma` 파일을 수정한 후, `npm run db:migrate:remote` 또는 `npm run db:migrate:force` 스크립트를 실행하여 D1 데이터베이스에 적용합니다.
- `remote` 옵션은 테이블을 추가하거나 update할 때 사용합니다.
- `force` 옵션은 기존 데이터를 삭제할 수 있으므로 프로덕션 환경에서는 신중하게 사용해야 합니다.
