import { OpenAPIHono } from "@hono/zod-openapi";
import { createBoardRouter } from "./board.routes";
import { createPostRouter } from "./post.routes";
import { createCommentRouter } from "./comment.routes";
import { createTagRouter } from "./tag.routes";

export function createCommunityRouter(): OpenAPIHono {
  const app = new OpenAPIHono();

  // 게시판 관련 라우트
  app.route("/boards", createBoardRouter());

  // 게시글 관련 라우트
  app.route("/posts", createPostRouter());

  // 댓글 관련 라우트
  app.route("/comments", createCommentRouter());

  // 태그 관련 라우트
  app.route("/tags", createTagRouter());

  // GET    /api/community/boards                    # 게시판 목록
  // GET    /api/community/boards/:id/categories     # 게시판별 카테고리
  // GET    /api/community/boards/:boardId/posts     # 게시글 목록
  // POST   /api/community/boards/:boardId/posts     # 게시글 작성
  // GET    /api/community/posts/:id                 # 게시글 상세
  // PUT    /api/community/posts/:id                 # 게시글 수정
  // DELETE /api/community/posts/:id                 # 게시글 삭제
  // GET    /api/community/posts/:postId/comments    # 댓글 목록
  // POST   /api/community/posts/:postId/comments    # 댓글 작성
  // PUT    /api/community/comments/:id              # 댓글 수정
  // DELETE /api/community/comments/:id              # 댓글 삭제
  // GET    /api/community/tags                      # 태그 목록
  // POST   /api/community/tags                      # 태그 생성
  // DELETE /api/community/tags/:id                  # 태그 삭제
  return app;
}
