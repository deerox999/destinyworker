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

[커뮤니티 기능]
사주 사이트에 맞는 커뮤니티 기능이 구현되어 있습니다.

## 커뮤니티 공간
- **버그 제보**: 서비스 버그를 제보하는 공간
- **사주 이야기**: 사주와 운세에 대한 이야기를 나누는 공간
- **기능/개선 요청**: 새로운 기능 요청 및 개선 제안 공간

## API 엔드포인트
- `GET /api/community/boards` - 공간 목록 조회
- `GET /api/community/boards/{id}/categories` - 공간별 카테고리 조회
- `GET /api/community/posts` - 게시글 목록 조회 (필터링, 정렬, 페이지네이션)
- `GET /api/community/posts/{id}` - 게시글 상세 조회
- `POST /api/community/posts` - 게시글 작성
- `PUT /api/community/posts/{id}` - 게시글 수정
- `DELETE /api/community/posts/{id}` - 게시글 삭제
- `POST /api/community/posts/{id}/like` - 게시글 추천/취소
- `GET /api/community/posts/{id}/comments` - 게시글 댓글 목록
- `POST /api/community/comments` - 댓글 작성
- `PUT /api/community/comments/{id}` - 댓글 수정
- `DELETE /api/community/comments/{id}` - 댓글 삭제
- `POST /api/community/comments/{id}/like` - 댓글 추천/취소
- `GET /api/community/tags` - 태그 목록 조회
- `GET /api/community/tags/popular` - 인기 태그 조회

## 기본 데이터 추가
```bash
npm run db:seed:community
```