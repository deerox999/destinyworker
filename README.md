# Destiny Worker

Cloudflare Workers + D1 Database를 사용한 사주 명리 서비스

## 주요 기능

- 사주 분석 및 운세 제공
- 유명인물 사주 정보
- 커뮤니티 게시판
- AI 기반 대화형 사주 상담
- 푸시 알림 서비스

## 기술 스택

- **Backend**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **ORM**: Prisma
- **Storage**: Cloudflare R2 (이미지 저장)
- **AI**: Cloudflare AI, Google Gemini
- **Framework**: Hono

## 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 데이터베이스 마이그레이션
npm run db:migrate:remote

# 커뮤니티 초기 데이터 생성
npm run db:seed:community
```

## 환경 변수 설정

`.dev.vars` 파일에 다음 환경 변수들을 설정하세요:

```env
# Database
DATABASE_URL="file:./dev.db"

# R2 Storage
R2_ACCOUNT_ID="your_account_id"
R2_ACCESS_KEY_ID="your_access_key_id"
R2_SECRET_ACCESS_KEY="your_secret_access_key"
R2_BUCKET_NAME="your_bucket_name"
R2_PUBLIC_URL="https://your-public-domain.com"

# AI Services
GOOGLE_API_KEY="your_google_api_key"
```

## API 문서

개발 서버 실행 후 다음 URL에서 API 문서를 확인할 수 있습니다:
- Swagger UI: http://localhost:9393/docs
- OpenAPI JSON: http://localhost:9393/openapi.json

## 커뮤니티 기능

### 이미지 처리 시스템

이미지는 별도로 R2에 업로드한 후 URL을 받아서 게시글/댓글에 첨부하는 방식으로 처리합니다:

#### 이미지 업로드 프로세스

1. **이미지 업로드**: 사용자가 이미지를 선택하면 R2에 직접 업로드
2. **URL 반환**: 업로드 완료 후 이미지 URL을 받음
3. **게시글 작성**: 이미지 URL을 포함한 게시글 내용을 작성
4. **데이터베이스 저장**: 이미지 URL이 포함된 내용을 D1에 저장

#### 게시글 수정/삭제 시 이미지 정리

- **게시글 수정**: 기존 이미지를 R2에서 삭제 (비동기 처리)
- **게시글 삭제**: 포함된 모든 이미지를 R2에서 삭제 (비동기 처리)
- **댓글 수정/삭제**: 동일한 이미지 정리 로직 적용

#### 공통 R2 유틸리티

이미지 관리 로직은 `src/api/user/r2Api.ts`에 공통화되어 있습니다:

- `getUploadUrl()`: 서명된 업로드 URL 생성
- `deleteImagesFromR2()`: R2에서 이미지 파일들을 삭제
- `createR2Client()`: R2 클라이언트 생성
- `deleteR2Object()`: 단일 R2 객체 삭제

#### 장점

- **성능 최적화**: Base64 변환 과정 없이 직접 업로드
- **메모리 효율성**: 대용량 이미지도 안정적으로 처리
- **사용자 경험**: 업로드 진행률 표시 가능
- **에러 처리**: 업로드 실패 시 명확한 피드백 제공

이 방식으로 Cloudflare D1의 `SQLITE_TOOBIG` 오류를 방지하고, R2 스토리지 공간을 효율적으로 관리할 수 있습니다.

#### 예시

```javascript
// QuillEditor에서 base64 이미지가 포함된 게시글 작성
const response = await fetch('/api/community/user/posts', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  },
  body: JSON.stringify({
    title: '이미지가 포함된 게시글',
    content: `
      <p>이미지가 포함된 게시글입니다.</p>
      <p><img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD..." alt="테스트 이미지"></p>
    `,
    boardId: 1,
    categoryId: 1,
    isAnonymous: false
  })
});
```

#### 지원되는 이미지 형식

- JPEG (.jpg, .jpeg)
- PNG (.png)
- GIF (.gif)
- WebP (.webp)

## 데이터베이스 스키마

주요 테이블:
- `users`: 사용자 정보
- `posts`: 게시글
- `comments`: 댓글
- `celebrities`: 유명인물 정보
- `saju_profiles`: 사주 프로필

## 배포

```bash
# 프로덕션 배포
npm run deploy
```

## 라이선스

MIT License