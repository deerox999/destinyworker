import { createAppRouter } from "../api/routes";
import { generateOpenApiFromRouter } from "./swagger/autoOpenApi";

const allowedOrigins = [
  "http://localhost:9999",
  "https://localhost:9999",
  "http://localhost:9393",
  "https://localhost:9393",
  "http://127.0.0.1:9999",
  "https://127.0.0.1:9999",
  "http://127.0.0.1:9393",
  "https://127.0.0.1:9393",
  "https://youram.me",
  "https://destiny-91f.pages.dev",
];

// CORS 헤더 추가 함수
export function corsHeaders(request?: Request) {
  const origin = request?.headers.get("Origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin"; // 동적으로 Origin을 설정할 때 캐싱 문제를 방지하기 위해 추가
  } else {
    // 허용되지 않은 오리진의 경우, 첫 번째 오리진을 기본값으로 설정하거나 혹은 아예 설정하지 않을 수 있습니다.
    // 여기서는 가장 보수적인 방법으로, 허용된 목록에 없을 경우 헤더를 아예 설정하지 않도록 처리합니다.
    // 또는, 특정 기본값을 설정할 수 있습니다. 예: headers["Access-Control-Allow-Origin"] = 'https://youram.me';
  }

  return headers;
}

// JSON 응답 생성 함수
export function jsonResponse(
  data: any,
  status = 200,
  request?: Request,
  headers?: Record<string, string>
) {
  const isNullBodyStatus = status === 204 || status === 205 || status === 304;

  const responseHeaders: Record<string, string> = {
    ...corsHeaders(request),
    ...headers,
  };

  if (!isNullBodyStatus) {
    responseHeaders["Content-Type"] = "application/json";
  }

  return new Response(isNullBodyStatus ? null : JSON.stringify(data), {
    status,
    headers: responseHeaders,
  });
}

// HTML 응답 생성 함수
export function htmlResponse(html: string, status = 200, request?: Request) {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html",
      ...corsHeaders(request),
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

// JWT 토큰에서 사용자 ID 추출
export const getUserIdFromToken = async (
  request: Request
): Promise<number | null> => {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  try {
    const token = authHeader.substring(7);
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
    );
    return payload.exp > Math.floor(Date.now() / 1000) ? payload.userId : null;
  } catch {
    return null;
  }
};
