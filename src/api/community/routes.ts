import { OpenAPIHono } from "@hono/zod-openapi";
import { createUserCommunityRouter } from "./user.routes";
import { createAdminCommunityRouter } from "./admin.routes";

export function createCommunityRouter(): OpenAPIHono {
  const app = new OpenAPIHono();
  
  // 사용자용 커뮤니티 API 라우트
  app.route("/user", createUserCommunityRouter());

  // 관리자용 커뮤니티 API 라우트
  app.route("/admin", createAdminCommunityRouter());

  // ===== 커뮤니티 API 전체 구조 =====
  //
  // 📁 사용자용 API (/api/community/user/)
  // ┌─────────────────────────────────────────────────────────────────┐
  // │ 커뮤니티 메인                                                    │
  // │ GET    /user/                    # 커뮤니티 전체 데이터         │
  // │                                                                 │
  // │ 게시판                                                          │
  // │ GET    /user/boards              # 게시판 목록                  │
  // │ GET    /user/boards/{boardId}    # 특정 게시판 데이터           │
  // │                                                                 │
  // │ 게시글                                                          │
  // │ GET    /user/posts               # 게시글 목록 (태그 검색 포함)  │
  // │ GET    /user/posts/{id}          # 게시글 상세 (태그 포함)      │
  // │ POST   /user/posts               # 게시글 작성 (태그 포함)      │
  // │ PUT    /user/posts/{id}          # 게시글 수정 (태그 포함)      │
  // │ DELETE /user/posts/{id}          # 게시글 삭제 (비밀번호 확인)   │
  // │ POST   /user/posts/{id}/like     # 게시글 추천/취소             │
  // │                                                                 │
  // │ 댓글                                                            │
  // │ GET    /user/posts/{id}/comments # 게시글 댓글 목록             │
  // │ POST   /user/posts/{postId}/comments # 댓글 작성               │
  // │ PUT    /user/comments/{id}       # 댓글 수정                   │
  // │ DELETE /user/comments/{id}       # 댓글 삭제                   │
  // │ POST   /user/comments/{id}/like  # 댓글 추천/취소              │
  // └─────────────────────────────────────────────────────────────────┘
  //
  // 📁 관리자용 API (/api/community/admin/)
  // ┌─────────────────────────────────────────────────────────────────┐
  // │ 게시판 관리                                                      │
  // │ GET    /admin/boards             # 게시판 목록 (전체)           │
  // │ POST   /admin/boards             # 게시판 생성                  │
  // │ PUT    /admin/boards/{boardId}   # 게시판 수정                  │
  // │ DELETE /admin/boards/{boardId}   # 게시판 삭제 (비활성화)       │
  // │                                                                 │
  // │ 카테고리 관리                                                    │
  // │ GET    /admin/boards/{boardId}/categories # 카테고리 목록       │
  // │ POST   /admin/boards/{boardId}/categories # 카테고리 생성       │
  // │ PUT    /admin/categories/{categoryId}     # 카테고리 수정       │
  // │ DELETE /admin/categories/{categoryId}     # 카테고리 삭제       │
  // └─────────────────────────────────────────────────────────────────┘
  //
  // 🔑 주요 특징
  // • 사용자/관리자 API 완전 분리
  // • 태그는 게시글에 종속적 (별도 API 없음)
  // • 삭제는 물리적 삭제가 아닌 비활성화
  // • 익명 게시글/댓글은 비밀번호 확인
  // • 권한 기반 접근 제어 (본인/관리자/익명)

  return app;
} 