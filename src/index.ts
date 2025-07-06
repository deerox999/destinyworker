import { corsHeaders } from "./common/utils";
import { createAppRouter } from "./common/routes";
import { generateSwaggerHTML } from "./html/swaggerUI";

// 애플리케이션 라우터 초기화
const appRouter = createAppRouter();

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight 처리
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // 루트 또는 /docs 경로에 대한 Swagger UI 제공
    if (url.pathname === "/" || url.pathname === "/docs") {
      return new Response(generateSwaggerHTML(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    try {
      // API 라우팅 처리
      const response = await appRouter.handle(request, env);
      if (response) {
        // 모든 응답에 CORS 헤더 추가
        const newHeaders = new Headers(response.headers);
        Object.entries(corsHeaders()).forEach(([key, value]) => {
          newHeaders.set(key, value);
        });
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      }

      // 404 처리
      return new Response(JSON.stringify({ error: "엔드포인트를 찾을 수 없습니다." }), {
        status: 404,
        headers: { ...corsHeaders(), "Content-Type": "application/json" }
      });

    } catch (error) {
      console.error("Global Error:", error);
      const errorResponse = {
        error: "서버 내부 오류가 발생했습니다.",
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 500,
        headers: { ...corsHeaders(), "Content-Type": "application/json" }
      });
    }
  },
} satisfies ExportedHandler<any>;
