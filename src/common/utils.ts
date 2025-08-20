import { Context } from "hono";
import { createPrismaClient } from "./prismaUtils";

interface JWTPayload {
  userId: number;
  email: string;
  role?: string; // Add role property
  exp: number;
  iat: number;
}

// 언어 설정 함수
export const getLanguageName = (language: string): string => {
  const languageMap: Record<string, string> = {
    ko: "한국어",
    en: "영어",
    zh: "중국어",
    ja: "일본어",
    vi: "베트남어",
  };
  return languageMap[language] || "한국어";
};

export const supportedLanguages = ["ko", "en", "ja", "zh", "vi"] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export function requireLanguageParam(c: Context): SupportedLanguage {
  const language = c.req.query("language");
  if (
    !language ||
    !supportedLanguages.includes(language as SupportedLanguage)
  ) {
    throw new Error("INVALID_LANGUAGE");
  }
  return language as SupportedLanguage;
}

// JWT 토큰에서 사용자 정보 추출
export const getUserFromToken = async (
  c: Context
): Promise<{ id: number; email: string; role: string } | null> => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  try {
    const token = authHeader.substring(7);
    // 1단계: GOOGLE_CLIENT_SECRET로 서명 검증
    const payload = await verifyJWT(token, c.env.GOOGLE_CLIENT_SECRET);
    if (!payload) return null;

    return {
      id: payload.userId,
      email: payload.email,
      role: payload.role || "user",
    };
  } catch {
    return null;
  }
};

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
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
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

// 날짜를 UTC 문자열로 변환
export const toUTC = (
  date: Date | string | null | undefined
): string | null => {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString();
};

// Prisma 핸들러 감싸기 (연결 생성/종료 보장)
export async function withPrisma<T>(
  db: D1Database,
  handler: (prisma: any) => Promise<T>
): Promise<T> {
  const prisma = createPrismaClient(db);
  try {
    return await handler(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

export const toJSON = (value: any) => {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      const trimmed = value.trim();
      if (!trimmed) return null;
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (typeof value === "object") return value;
  return null;
};
