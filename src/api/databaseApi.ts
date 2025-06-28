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
  },

  // JSON 데이터 저장
  async saveJson(request: Request, env: any): Promise<Response> {
    if (!env.DB) {
      return jsonResponse({ error: "데이터베이스가 설정되지 않았습니다." }, 500);
    }

    try {
      const body = await request.json() as { userId?: string; data?: any };
      const { userId, data } = body;

      if (!userId) {
        return jsonResponse({ error: "userId가 필요합니다." }, 400);
      }

      if (!data) {
        return jsonResponse({ error: "저장할 데이터가 필요합니다." }, 400);
      }

      // JSON 데이터를 문자열로 변환하여 저장
      const jsonString = JSON.stringify(data);
      
      const stmt = env.DB.prepare(`
        INSERT INTO json_storage (user_id, json_data, updated_at) 
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `);
      
      const result = await stmt.bind(userId, jsonString).run();
      
      return jsonResponse({ 
        success: true, 
        id: result.meta.last_row_id,
        message: "JSON 데이터가 성공적으로 저장되었습니다."
      });
    } catch (error) {
      console.error("JSON 저장 오류:", error);
      return jsonResponse({ 
        error: "JSON 데이터를 저장할 수 없습니다.",
        message: error instanceof Error ? error.message : "Unknown error"
      }, 500);
    }
  },

  // JSON 데이터 조회
  async getJson(request: Request, env: any, userId: string): Promise<Response> {
    if (!env.DB) {
      return jsonResponse({ error: "데이터베이스가 설정되지 않았습니다." }, 500);
    }

    try {
      if (!userId) {
        return jsonResponse({ error: "userId가 필요합니다." }, 400);
      }

      const stmt = env.DB.prepare(`
        SELECT id, json_data, created_at, updated_at 
        FROM json_storage 
        WHERE user_id = ? 
        ORDER BY updated_at DESC
      `);
      
      const { results } = await stmt.bind(userId).all();
      
      if (!results || results.length === 0) {
        return jsonResponse({ 
          error: "해당 사용자의 JSON 데이터를 찾을 수 없습니다." 
        }, 404);
      }

      // JSON 문자열을 다시 객체로 파싱하여 반환
      const jsonData = results.map((row: any) => ({
        id: row.id,
        data: JSON.parse(row.json_data),
        created_at: row.created_at,
        updated_at: row.updated_at
      }));

      return jsonResponse({
        userId,
        records: jsonData,
        count: jsonData.length
      });
    } catch (error) {
      console.error("JSON 조회 오류:", error);
      return jsonResponse({ 
        error: "JSON 데이터를 조회할 수 없습니다.",
        message: error instanceof Error ? error.message : "Unknown error"
      }, 500);
    }
  }
}; 