import { jsonResponse } from "../../../common/utils";

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

export async function getVapidPublicKey(request: Request, env: any): Promise<Response> {
  const publicKey = env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    console.error("VAPID_PUBLIC_KEY is not set in environment variables.");
    return jsonResponse({ error: "VAPID public key is not configured" }, 500, request);
  }
  return jsonResponse({ publicKey }, 200, request);
}

export async function subscribe(request: Request, env: any): Promise<Response> {
  if (!env.DB || !env.JWT_SECRET) {
    return jsonResponse({ error: "서버 설정이 누락되었습니다." }, 500, request);
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "인증 토큰이 필요합니다." }, 401, request);
  }
  const token = authHeader.substring(7);
  const payload = await verifyJWT(token, env.JWT_SECRET);

  if (!payload) {
    return jsonResponse({ error: "유효하지 않은 토큰입니다." }, 401, request);
  }

  const subscription = await request.json() as PushSubscriptionBody;
  if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return jsonResponse({ error: "잘못된 푸시 구독 객체입니다." }, 400, request);
  }

  const db = env.DB;
  try {
    let stmt = db.prepare("SELECT endpoint FROM push_subscriptions WHERE endpoint = ?");
    const existing = await stmt.bind(subscription.endpoint).first();

    if (existing) {
        return jsonResponse({ success: true, message: "이미 구독중입니다." }, 200, request);
    }

    stmt = db.prepare(`
        INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) 
        VALUES (?, ?, ?, ?)
    `);
    await stmt.bind(payload.userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth).run();

    return jsonResponse({ success: true, message: "구독 성공" }, 201, request);
  } catch (e) {
    console.error("구독 정보 저장 실패:", e);
    return jsonResponse({ error: "구독 정보를 저장하는데 실패했습니다." }, 500, request);
  }
}

export async function unsubscribe(request: Request, env: any): Promise<Response> {
  if (!env.DB || !env.JWT_SECRET) {
    return jsonResponse({ error: "서버 설정이 누락되었습니다." }, 500, request);
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "인증 토큰이 필요합니다." }, 401, request);
  }
  const token = authHeader.substring(7);
  const payload = await verifyJWT(token, env.JWT_SECRET);

  if (!payload) {
    return jsonResponse({ error: "유효하지 않은 토큰입니다." }, 401, request);
  }

  const { endpoint } = await request.json() as UnsubscribeBody;
  if (!endpoint) {
    return jsonResponse({ error: "Endpoint가 필요합니다." }, 400, request);
  }

  const db = env.DB;
  try {
    const stmt = db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?");
    const info = await stmt.bind(endpoint, payload.userId).run();

    if (info.meta.changes === 0) {
        return jsonResponse({ success: false, message: "구독 정보를 찾을 수 없거나 해당 유저의 구독이 아닙니다." }, 404, request);
    }

    return jsonResponse({ success: true, message: "구독이 성공적으로 해지되었습니다." }, 200, request);
  } catch (e) {
    console.error("구독 정보 삭제 실패:", e);
    return jsonResponse({ error: "구독 정보 삭제에 실패했습니다." }, 500, request);
  }
} 