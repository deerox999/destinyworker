import { corsHeaders, htmlResponse, jsonResponse } from "./common/utils";
import { createAppRouter } from "./common/routes";
import { generateSwaggerHTML } from "./html/swaggerUI";

// 애플리케이션 라우터 초기화
const appRouter = createAppRouter();

export default {
  async fetch(
    request: Request,
    env: any,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight 처리
    if (request.method === "OPTIONS") {
      return jsonResponse(null, 204, request);
    }

    // 루트 또는 /docs 경로에 대한 Swagger UI 제공
    if (url.pathname === "/" || url.pathname === "/docs") {
      return htmlResponse(generateSwaggerHTML(), 200, request);
    }

    try {
      // API 라우팅 처리
      const response = await appRouter.handle(request, env);
      if (response) {
        // 모든 응답에 CORS 헤더 추가
        const newHeaders = new Headers(response.headers);
        Object.entries(corsHeaders(request)).forEach(([key, value]) => {
          if (!newHeaders.has(key)) {
            // 기존에 헤더가 없으면 추가
            newHeaders.set(key, value);
          }
        });

        // 라우터 핸들러에서 이미 설정한 Access-Control-Allow-Origin이 없는 경우에만 설정
        if (!newHeaders.has("Access-Control-Allow-Origin")) {
          const cors = corsHeaders(request);
          if (cors["Access-Control-Allow-Origin"]) {
            newHeaders.set(
              "Access-Control-Allow-Origin",
              cors["Access-Control-Allow-Origin"]
            );
          }
        }

        return jsonResponse(response.body, response.status, request);
      }

      // 404 처리
      return jsonResponse({ error: "엔드포인트를 찾을 수 없습니다." }, 404, request);
    } catch (error) {
      console.error("Global Error:", error);
      return jsonResponse({
        error: "서버 내부 오류가 발생했습니다.",
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      }, 500, request);
    }
  },
} satisfies ExportedHandler<any>;
