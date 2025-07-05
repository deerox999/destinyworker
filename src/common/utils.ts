import { createAppRouter } from "./routes";
import { generateOpenApiFromRouter } from "./autoOpenApi";

// CORS 헤더 추가 함수
export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

// JSON 응답 생성 함수
export function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

// HTML 응답 생성 함수
export function htmlResponse(html: string, status = 200) {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html",
      ...corsHeaders(),
    },
  });
}

// OpenAPI 스펙 생성 함수
export function generateOpenApiSpec(requestUrl: string) {
  const url = new URL(requestUrl);
  const tagsQuery = url.searchParams.get("tags");
  const filterTags = tagsQuery ? tagsQuery.split(",") : [];

  // 라우터 기반으로 OpenAPI 스펙 자동 생성
  const appRouter = createAppRouter();
  return generateOpenApiFromRouter(
    appRouter,
    {
      title: "Destiny API",
      version: "1.0.0",
      description: "사주 서비스를 위한 백엔드 API",
    },
    filterTags
  );
}