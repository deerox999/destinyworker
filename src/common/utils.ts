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

// JWT 토큰에서 사용자 정보 추출
export const getUserFromToken = async (
  request: Request
): Promise<{ id: number; email: string; role: string } | null> => {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  try {
    const token = authHeader.substring(7);
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
    );
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    
    return { id: payload.userId, email: payload.email, role: payload.role || "user" };
  } catch {
    return null;
  }
};

interface JWTPayload {
  userId: number;
  email: string;
  exp: number;
  iat: number;
}

// JWT 토큰 생성
export async function generateJWT(
  payload: Omit<JWTPayload, "exp" | "iat">,
  secret: string
): Promise<string> {
  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + 7 * 24 * 60 * 60, // 7일 후 만료
  };

  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  const payloadB64 = btoa(JSON.stringify(fullPayload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  const data = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return `${data}.${signatureB64}`;
}

// JWT 토큰 검증
export async function verifyJWT(
  token: string,
  secret: string
): Promise<JWTPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signature = Uint8Array.from(
      atob(signatureB64.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0)
    );
    const data = `${headerB64}.${payloadB64}`;

    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      encoder.encode(data)
    );
    if (!isValid) return null;

    const payload = JSON.parse(
      atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"))
    ) as JWTPayload;

    // 토큰 만료 확인
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch (error) {
    return null;
  }
}