// JSON 응답 생성 함수
function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

// D1 데이터베이스 API 핸들러들
export const databaseApiHandlers = {
  // 댓글 목록 조회
  async getComments(request: Request, env: any): Promise<Response> {
    if (!env.DB) {
      return jsonResponse({ error: "데이터베이스가 설정되지 않았습니다." }, 500);
    }

    try {
      const stmt = env.DB.prepare("SELECT * FROM comments LIMIT 10");
      const { results } = await stmt.all();
      return jsonResponse(results);
    } catch (error) {
      return jsonResponse({ error: "댓글을 조회할 수 없습니다." }, 500);
    }
  }
}; 