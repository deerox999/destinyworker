# Worker + D1 Database

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/d1-template)

![Worker + D1 Template Preview](https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/cb7cb0a9-6102-4822-633c-b76b7bb25900/public)

<!-- dash-content-start -->

D1 is Cloudflare's native serverless SQL database ([docs](https://developers.cloudflare.com/d1/)). This project demonstrates using a Worker with a D1 binding to execute a SQL statement. A simple frontend displays the result of this query:

```SQL
SELECT * FROM comments LIMIT 3;
```

The D1 database is initialized with a `comments` table and this data:

```SQL
INSERT INTO comments (author, content)
VALUES
    ('Kristian', 'Congrats!'),
    ('Serena', 'Great job!'),
    ('Max', 'Keep up the good work!')
;
```

> [!IMPORTANT]
> When using C3 to create this project, select "no" when it asks if you want to deploy. You need to follow this project's [setup steps](https://github.com/cloudflare/templates/tree/main/d1-template#setup-steps) before deploying.

<!-- dash-content-end -->

## Getting Started

Outside of this repo, you can start a new project with this template using [C3](https://developers.cloudflare.com/pages/get-started/c3/) (the `create-cloudflare` CLI):

```
npm create cloudflare@latest -- --template=cloudflare/templates/d1-template
```

A live public deployment of this template is available at [https://d1-template.templates.workers.dev](https://d1-template.templates.workers.dev)

## Setup Steps

1. Install the project dependencies with a package manager of your choice:
   ```bash
   npm install
   ```
2. Create a [D1 database](https://developers.cloudflare.com/d1/get-started/) with the name "d1-template-database":
   ```bash
   npx wrangler d1 create d1-template-database
   ```
   ...and update the `database_id` field in `wrangler.json` with the new database ID.
3. Run the following db migration to initialize the database (notice the `migrations` directory in this project):
   ```bash
   npx wrangler d1 migrations apply --remote d1-template-database
   ```
4. Deploy the project!
   ```bash
   npx wrangler deploy
   ```

## ✅ Prisma ORM 마이그레이션 완료

이 프로젝트의 모든 데이터베이스 API가 **Prisma ORM**으로 마이그레이션되었습니다!

### 🚀 Prisma의 장점

- **타입 안전성**: TypeScript와 완벽한 통합으로 컴파일 타임에 오류 방지
- **자동완성**: IDE에서 강력한 자동완성 및 IntelliSense 지원
- **간편한 쿼리**: 복잡한 SQL 대신 직관적인 JavaScript/TypeScript 메서드 사용
- **관계 관리**: 테이블 간 관계를 쉽게 정의하고 조인 쿼리 자동 생성
- **마이그레이션**: 스키마 변경사항을 체계적으로 관리

### 📁 파일 구조

```
src/
├── api/
│   ├── databaseApi.ts           # Prisma ORM 기반 데이터베이스 API
│   ├── auth/
│   │   └── googleAuthApi.ts     # Google OAuth 인증 API
│   └── routes/
│       ├── databaseRoutes.ts    # 데이터베이스 라우트 등록
│       └── authRoutes.ts        # 인증 라우트 등록
├── common/
│   ├── router.ts                # 라우터 엔진 🚀
│   ├── routes.ts                # 메인 라우터 설정
│   ├── staticRoutes.ts          # 정적 페이지 라우트 🆕
│   └── utils.ts                 # 공통 유틸리티
├── html/                        # Swagger UI 및 HTML 생성
└── index.ts                     # 초간소화된 진입점 ✨
prisma/
└── schema.prisma                # Prisma 스키마 정의 (상세 주석 포함)
migrations_backup/               # 기존 SQL 마이그레이션 백업
```

### 🔧 Prisma 설정

1. **Prisma Client 생성**:
   ```bash
   npm run db:generate
   ```

2. **스키마를 데이터베이스에 푸시**:
   ```bash
   npm run db:push
   ```

### 🌐 API 엔드포인트 (기존 URL 유지)

모든 API가 기존 URL을 유지하면서 내부적으로 Prisma ORM을 사용합니다:

- `GET /api/comments` - 댓글 조회 (Prisma 기반)
- `POST /api/json` - JSON 데이터 저장 (Prisma 기반)
- `GET /api/json/{userId}` - JSON 데이터 조회 (Prisma 기반)
- `POST /api/auth/google/login` - Google OAuth 로그인
- `POST /api/auth/logout` - 로그아웃
- `GET /api/auth/me` - 사용자 정보 조회
- `POST /api/auth/refresh` - 토큰 갱신

### 📊 마이그레이션 전후 비교

#### 기존 SQL 방식:
```typescript
const stmt = env.DB.prepare("SELECT * FROM comments LIMIT 10");
const { results } = await stmt.all();
```

#### Prisma ORM 방식 (현재):
```typescript
const comments = await prisma.comment.findMany({
  take: 10,
  orderBy: { id: 'desc' }
});
```

### 🛠 Prisma 명령어

- `npm run db:generate` - Prisma Client 생성
- `npm run db:push` - 스키마를 DB에 푸시
- `npm run db:studio` - Prisma Studio로 데이터 관리
- `npm run db:seed` - 데이터베이스 시드

### 📝 스키마 수정

`prisma/schema.prisma` 파일을 수정한 후:

```bash
npx prisma db push          # 변경사항을 DB에 적용
npx prisma generate         # 새로운 타입 생성
```

### 🔧 새로운 API 추가하기

새로운 라우터 시스템 덕분에 API 추가가 매우 간단해졌습니다:

1. **API 핸들러 작성** (예: `src/api/myApi.ts`)
2. **라우트 등록 파일 생성** (예: `src/api/routes/myRoutes.ts`)
3. **메인 라우터에 등록** (`src/routes.ts`에 한 줄 추가)

#### 예시: 새로운 API 추가

```typescript
// 1. src/api/routes/myRoutes.ts
import { Router } from '../../common/router';
import { myApiHandlers } from '../myApi';

export function registerMyRoutes(router: Router) {
  router.get('/api/my-endpoint', myApiHandlers.getData);
  router.post('/api/my-endpoint', myApiHandlers.createData);
  router.get('/api/my-endpoint/:id', myApiHandlers.getDataById);
}

// 2. src/common/routes.ts에 추가
import { registerMyRoutes } from '../api/routes/myRoutes';

export function createAppRouter(): Router {
  const router = new Router();
  
  registerStaticRoutes(router);     // 정적 페이지
  registerDatabaseRoutes(router);   // 데이터베이스 API
  registerAuthRoutes(router);       // 인증 API
  registerMyRoutes(router);         // ← 이 한 줄만 추가!
  
  return router;
}
```

### 📊 코드 구조 비교

#### 이전 (index.ts에 모든 라우팅):
```typescript
// 70+ 줄의 복잡한 라우팅 로직
if (route(url, request, "/", "GET")) {
  return htmlResponse(generateApiListHTML());
}
if (route(url, request, "/docs", "GET")) {
  return htmlResponse(generateSwaggerHTML());
}
if (route(url, request, "/api/openapi.json", "GET")) {
  return jsonResponse(openApiSpec);
}
if (route(url, request, "/api/comments", "GET")) {
  return await databaseApiHandlers.getComments(request, env);
}
// ... 수많은 if문들
```

#### 현재 (초간소화된 라우터 시스템):
```typescript
// 단 1줄로 모든 라우팅 처리! 🎯
const response = await appRouter.handle(request, env);
if (response) return response;
```

**index.ts 라인 수 변화:**
- **이전**: ~80줄 (복잡한 라우팅 로직)
- **현재**: ~40줄 (50% 코드 감소!) ✨

### 🎯 주요 개선사항

#### 🔧 Prisma ORM 마이그레이션
1. **타입 안전성** - 모든 데이터베이스 쿼리가 TypeScript로 타입 체크됩니다
2. **자동 완성** - IDE에서 필드명과 메서드를 자동으로 제안합니다
3. **에러 방지** - 잘못된 쿼리나 필드명을 컴파일 타임에 감지합니다
4. **성능 최적화** - Prisma가 자동으로 최적화된 쿼리를 생성합니다

#### 🚀 라우터 시스템 도입
1. **확장성** - 새로운 API 추가가 간단하고 체계적입니다
2. **모듈화** - 각 기능별로 라우트가 분리되어 관리됩니다
3. **유지보수성** - index.ts가 깔끔해져서 코드 가독성이 향상되었습니다
4. **파라미터 처리** - URL 파라미터를 자동으로 파싱하고 전달합니다
5. **에러 핸들링** - 각 라우트별 에러를 체계적으로 처리합니다

#### 📐 아키텍처 개선
- **단일 책임 원칙** - 각 파일이 명확한 역할을 담당합니다
- **관심사 분리** - 라우팅, 비즈니스 로직, 데이터 액세스가 분리되었습니다
- **코드 재사용성** - 공통 기능들이 모듈화되어 재사용 가능합니다

> **참고**: 기존 SQL 마이그레이션 파일들은 `migrations_backup/` 폴더에 백업되어 있습니다.
