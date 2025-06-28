import { openApiSpec } from "./openapi";
import { generateSwaggerHTML, generateApiListHTML } from "./html/swaggerUI";
import { databaseApiHandlers } from "./api/databaseApi";
import { googleAuthApiHandlers } from "./api/auth/googleAuthApi";
import { jsonResponse, htmlResponse, corsHeaders, route} from "./common/utils";

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight 처리
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    try {
      // 기본 라우팅 (문서 및 스펙)
      if (route(url, request, "/", "GET")) {
        return htmlResponse(generateApiListHTML());
      }

      if (route(url, request, "/docs", "GET")) {
        return htmlResponse(generateSwaggerHTML());
      }

      if (route(url, request, "/api/openapi.json", "GET")) {
        return jsonResponse(openApiSpec);
      }

      // D1 데이터베이스 API 라우팅
      if (route(url, request, "/api/comments", "GET")) {
        return await databaseApiHandlers.getComments(request, env);
      }

      // Google OAuth 로그인 API 라우팅
      if (route(url, request, "/api/auth/google/login", "POST")) {
        return await googleAuthApiHandlers.googleLogin(request, env);
      }

      if (route(url, request, "/api/auth/logout", "POST")) {
        return await googleAuthApiHandlers.logout(request, env);
      }

      if (route(url, request, "/api/auth/me", "GET")) {
        return await googleAuthApiHandlers.getUserInfo(request, env);
      }

      if (route(url, request, "/api/auth/refresh", "POST")) {
        return await googleAuthApiHandlers.refreshToken(request, env);
      }

      // 404 처리
      return jsonResponse({ error: "엔드포인트를 찾을 수 없습니다." }, 404);

    } catch (error) {
      console.error("API Error:", error);
      return jsonResponse({ 
        error: "서버 내부 오류가 발생했습니다.",
        message: error instanceof Error ? error.message : "Unknown error"
      }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
