import { Context } from "hono";
import { PrismaClient } from "@prisma/client";

// JWT 페이로드 인터페이스
interface JWTPayload {
  userId: number;
  email: string;
  exp: number;
  iat: number;
}

// JWT 토큰 검증 (googleAuthApi.ts에서 가져옴)
async function verifyJWT(
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


// 푸시 구독 요청 본문 타입
interface PushSubscriptionBody {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    }
}

// 구독 해지 요청 본문 타입
interface UnsubscribeBody {
    endpoint: string;
}

export async function getVapidPublicKey(c: Context): Promise<Response> {
  const publicKey = c.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    console.error("VAPID_PUBLIC_KEY is not set in environment variables.");
    return c.json({ error: "VAPID public key is not configured" }, 500);
  }
  return c.json({ publicKey }, 200);
}

export async function subscribe(c: Context): Promise<Response> {
  if (!c.env.GOOGLE_CLIENT_SECRET) {
    return c.json({ error: "서버 설정이 누락되었습니다." }, 500);
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "인증 토큰이 필요합니다." }, 401);
  }
  const token = authHeader.substring(7);
  const payload = await verifyJWT(token, c.env.GOOGLE_CLIENT_SECRET);

  if (!payload) {
    return c.json({ error: "유효하지 않은 토큰입니다." }, 401);
  }

  const subscription = await c.req.json() as PushSubscriptionBody;
  if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return c.json({ error: "잘못된 푸시 구독 객체입니다." }, 400);
  }

  try {
    const prisma = new PrismaClient();
    
    // 기존 구독 확인
    const existing = await prisma.pushSubscription.findUnique({
      where: { endpoint: subscription.endpoint }
    });

    if (existing) {
        return c.json({ success: true, message: "이미 구독중입니다." }, 200);
    }

    // 새 구독 생성
    await prisma.pushSubscription.create({
      data: {
        userId: payload.userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth
      }
    });

    await prisma.$disconnect();
    return c.json({ success: true, message: "구독 성공" }, 201);
  } catch (e) {
    console.error("구독 정보 저장 실패:", e);
    return c.json({ error: "구독 정보를 저장하는데 실패했습니다." }, 500);
  }
}

export async function unsubscribe(c: Context): Promise<Response> {
  if (!c.env.GOOGLE_CLIENT_SECRET) {
    return c.json({ error: "서버 설정이 누락되었습니다." }, 500);
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "인증 토큰이 필요합니다." }, 401);
  }
  const token = authHeader.substring(7);
  const payload = await verifyJWT(token, c.env.GOOGLE_CLIENT_SECRET);

  if (!payload) {
    return c.json({ error: "유효하지 않은 토큰입니다." }, 401);
  }

  const { endpoint } = await c.req.json() as UnsubscribeBody;
  if (!endpoint) {
    return c.json({ error: "Endpoint가 필요합니다." }, 400);
  }

  try {
    const prisma = new PrismaClient();
    
    // 구독 삭제
    const result = await prisma.pushSubscription.deleteMany({
      where: {
        endpoint: endpoint,
        userId: payload.userId
      }
    });

    await prisma.$disconnect();

    if (result.count === 0) {
        return c.json({ success: false, message: "구독 정보를 찾을 수 없거나 해당 유저의 구독이 아닙니다." }, 404);
    }

    return c.json({ success: true, message: "구독이 성공적으로 해지되었습니다." }, 200);
  } catch (e) {
    console.error("구독 정보 삭제 실패:", e);
    return c.json({ error: "구독 정보 삭제에 실패했습니다." }, 500);
  }
} 