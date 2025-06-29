import { corsHeaders } from "./common/utils";
import { createAppRouter } from "./common/routes";

// 애플리케이션 라우터 초기화
const appRouter = createAppRouter();

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    // CORS preflight 처리
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    try {
      // 모든 라우팅을 라우터에 위임 - 단 1줄로 완벽하게!
      const response = await appRouter.handle(request, env);
      if (response) return response;

      // 404 처리
      return new Response(JSON.stringify({ error: "엔드포인트를 찾을 수 없습니다." }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });

    } catch (error) {
      console.error("Global Error:", error);
      return new Response(JSON.stringify({ 
        error: "서버 내부 오류가 발생했습니다.",
        message: error instanceof Error ? error.message : "Unknown error"
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  },
} satisfies ExportedHandler<Env>;
