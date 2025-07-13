import { corsHeaders, htmlResponse, jsonResponse } from "./common/utils";
import { createAppRouter } from "./api/routes";
import { generateSwaggerHTML } from "./common/swagger/html/swaggerUI";

export default {
  async fetch(
    request: Request,
    env: any,
    ctx: ExecutionContext
  ): Promise<Response> {
    const appRouter = createAppRouter(env);
    const url = new URL(request.url);

    try {
      // API 라우팅 처리
      const response = await appRouter.handle(request, env);
      if (response) {
        // 모든 응답에 CORS 헤더 추가
        const newHeaders = new Headers(response.headers);
        const cors = corsHeaders(request);

        Object.entries(cors).forEach(([key, value]) => {
          if (!newHeaders.has(key)) {
            newHeaders.set(key, value);
          }
        });

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      }

      // 404 처리
      return jsonResponse(
        { error: "엔드포인트를 찾을 수 없습니다." },
        404,
        request
      );
    } catch (error) {
      console.error("Global Error:", error);
      return jsonResponse(
        {
          error: "서버 내부 오류가 발생했습니다.",
          message: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        500,
        request
      );
    }
  },
} satisfies ExportedHandler<any>;
