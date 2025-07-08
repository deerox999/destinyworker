import { corsHeaders } from "./common/utils";
import { createAppRouter } from "./common/routes";
import { generateSwaggerHTML } from "./html/swaggerUI";

// 애플리케이션 라우터 초기화
const appRouter = createAppRouter();

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    // CORS preflight 처리
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
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
        Object.entries(corsHeaders(origin)).forEach(([key, value]) => {
          if (!newHeaders.has(key)) { // 기존에 헤더가 없으면 추가
             newHeaders.set(key, value);
          }
        });

        // 라우터 핸들러에서 이미 설정한 Access-Control-Allow-Origin이 없는 경우에만 설정
        if (!newHeaders.has("Access-Control-Allow-Origin")) {
          const cors = corsHeaders(origin);
          if(cors["Access-Control-Allow-Origin"]) {
            newHeaders.set("Access-Control-Allow-Origin", cors["Access-Control-Allow-Origin"]);
          }
        }
        
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      }

      // 404 처리
      return new Response(JSON.stringify({ error: "엔드포인트를 찾을 수 없습니다." }), {
        status: 404,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" }
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
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" }
      });
    }
  },
} satisfies ExportedHandler<any>;
