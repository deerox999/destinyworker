# Worker + D1 Database

[API 추가 방법]
1. API 핸들러 구현 (...Api.ts 참고)
2. 라우트 설정 (routes.ts 참고)

[신규 테이블 추가 및 업데이트 방법]
로컬 sqlite는 사용 안함, d1이랑 직접 연결하여 사용 중
1. 신규 테이블 선언 (schema.prisma 참고)
2. [자동 마이그레이션] npm run db:migrate             (migrate-d1.js 참고)
2. [원격만 적용, 사용O] npm run db:migrate:remote  
2. [로컬만 적용, 사용X] npm run db:migrate:local

# Destiny Worker

Cloudflare's native serverless SQL database.

## 구글 로그인 문제 해결 가이드

### 환경 설정
1. `wrangler.json`에서 다음 환경 변수들이 설정되어 있는지 확인:
   - `GOOGLE_CLIENT_ID`: 구글 OAuth 클라이언트 ID
   - `JWT_SECRET`: JWT 토큰 서명을 위한 비밀키 (최소 32자)

### 데이터베이스 마이그레이션
```bash
# 로컬 개발용
npm run db:migrate:local

# 원격 배포용
npm run db:migrate:remote
```

### 앱에서 구글 로그인 사용 시 주의사항
1. **토큰 형식**: `id_token` 또는 `access_token` 모두 지원
2. **API 엔드포인트**: `POST /api/auth/google/login`
3. **요청 형식**:
   ```json
   {
     "token": "구글_OAuth_토큰"
   }
   ```

### 디버깅
Cloudflare Worker 로그를 확인하여 구체적인 오류 원인을 파악할 수 있습니다:
```bash
wrangler tail --format=pretty
```