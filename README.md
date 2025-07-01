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