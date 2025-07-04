// JSON 응답 생성 함수
function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

// 사용자 인터페이스
interface User {
  id: number;
  google_id: string;
  email: string;
  name: string;
  picture?: string;
  created_at: string;
  updated_at: string;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  name: string;
  picture: string;
  email_verified: boolean;
}

interface JWTPayload {
  userId: number;
  email: string;
  exp: number;
  iat: number;
}

// JWT 토큰 생성
async function generateJWT(
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

// Google OAuth 토큰 검증
async function verifyGoogleToken(
  token: string,
  clientId?: string
): Promise<GoogleUserInfo | null> {
  try {
    // tokeninfo 엔드포인트 시도 (id_token)
    let response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${token}`
    );
    
    // 실패시 userinfo 엔드포인트 시도 (access_token)
    if (!response.ok) {
      response = await fetch(
        `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${token}`
      );
    }
    
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as any;

    // 필수 필드 확인
    if (!data.sub && !data.id) {
      return null;
    }

    if (!data.email) {
      return null;
    }

    // 클라이언트 ID 검증
    if (clientId && data.aud && data.aud !== clientId) {
      console.error("클라이언트 ID 불일치");
      return null;
    }

    // 이메일 인증 확인
    const emailVerified = data.email_verified === true || 
                         data.email_verified === "true" || 
                         data.verified_email === true ||
                         data.verified_email === "true";

    return {
      sub: data.sub || data.id,
      email: data.email,
      name: data.name || data.given_name + " " + data.family_name || data.email,
      picture: data.picture,
      email_verified: emailVerified
    };
  } catch (error) {
    console.error("Google token verification failed:", error);
    return null;
  }
}

// 사용자 조회 또는 생성
async function findOrCreateUser(
  db: any,
  googleUserInfo: GoogleUserInfo
): Promise<User | null> {
  try {
    // 기존 사용자 찾기
    let stmt = db.prepare(
      "SELECT * FROM users WHERE google_id = ? OR email = ?"
    );
    let result = await stmt
      .bind(googleUserInfo.sub, googleUserInfo.email)
      .first();

    if (result) {
      // 기존 사용자 정보 업데이트
      stmt = db.prepare(`
        UPDATE users 
        SET name = ?, picture = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `);
      await stmt
        .bind(googleUserInfo.name, googleUserInfo.picture, result.id)
        .run();

      return result as User;
    } else {
      // 새 사용자 생성
      stmt = db.prepare(`
        INSERT INTO users (google_id, email, name, picture) 
        VALUES (?, ?, ?, ?)
      `);
      const insertResult = await stmt
        .bind(
          googleUserInfo.sub,
          googleUserInfo.email,
          googleUserInfo.name,
          googleUserInfo.picture
        )
        .run();

      // 생성된 사용자 조회
      stmt = db.prepare("SELECT * FROM users WHERE id = ?");
      result = await stmt.bind(insertResult.meta.last_row_id).first();

      return result as User;
    }
  } catch (error) {
    console.error("Database error:", error);
    return null;
  }
}

// 세션 저장
async function saveSession(
  db: any,
  userId: number,
  jwtToken: string,
  expiresAt: Date
): Promise<boolean> {
  try {
    const stmt = db.prepare(`
      INSERT INTO sessions (user_id, jwt_token, expires_at) 
      VALUES (?, ?, ?)
    `);
    await stmt.bind(userId, jwtToken, expiresAt.toISOString()).run();
    return true;
  } catch (error) {
    console.error("Session save error:", error);
    return false;
  }
}

// 만료된 세션 정리
async function cleanupExpiredSessions(db: any): Promise<void> {
  try {
    const stmt = db.prepare(
      "DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP"
    );
    await stmt.run();
  } catch (error) {
    console.error("Session cleanup error:", error);
  }
}

// 세션 삭제
async function deleteSession(db: any, jwtToken: string): Promise<boolean> {
  try {
    const stmt = db.prepare("DELETE FROM sessions WHERE jwt_token = ?");
    const result = await stmt.bind(jwtToken).run();
    return result.changes > 0;
  } catch (error) {
    console.error("Session delete error:", error);
    return false;
  }
}

// Google OAuth API 핸들러들
export const googleAuthApiHandlers = {
  // Google 로그인
  async googleLogin(request: Request, env: any): Promise<Response> {
    if (!env.DB) {
      return jsonResponse(
        { error: "데이터베이스가 설정되지 않았습니다." },
        500
      );
    }

    if (!env.GOOGLE_CLIENT_ID || !env.JWT_SECRET) {
      return jsonResponse({ error: "OAuth 설정이 누락되었습니다." }, 500);
    }

    try {
      const body = (await request.json()) as { token?: string };
      const { token } = body;

      if (!token) {
        return jsonResponse({ error: "Google 토큰이 필요합니다." }, 400);
      }

      // Google 토큰 검증
      const googleUserInfo = await verifyGoogleToken(token, env.GOOGLE_CLIENT_ID);
      if (!googleUserInfo) {
        return jsonResponse({ error: "유효하지 않은 Google 토큰입니다." }, 401);
      }

      // 사용자 조회 또는 생성
      const user = await findOrCreateUser(env.DB, googleUserInfo);
      if (!user) {
        return jsonResponse(
          { error: "사용자 처리 중 오류가 발생했습니다." },
          500
        );
      }

      // JWT 토큰 생성
      const jwtToken = await generateJWT(
        { userId: user.id, email: user.email },
        env.JWT_SECRET
      );

      // 세션 저장
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await saveSession(env.DB, user.id, jwtToken, expiresAt);

      // 만료된 세션 정리
      await cleanupExpiredSessions(env.DB);

      // 로그인 기록 추가
      try {
        const stmt = env.DB.prepare(`
          INSERT INTO login_histories (user_id, action) 
          VALUES (?, 'login')
        `);
        await stmt.bind(user.id).run();
      } catch(e) {
        console.error("Login history save error:", e);
        // 이 에러는 로그인 자체를 실패시키지는 않음
      }

      return jsonResponse({
        success: true,
        token: jwtToken,
        user: user,
      });
    } catch (error) {
      console.error("Login error:", error);
      return jsonResponse(
        { error: "로그인 처리 중 오류가 발생했습니다." },
        500
      );
    }
  },

  // 로그아웃
  async logout(request: Request, env: any): Promise<Response> {
    if (!env.DB || !env.JWT_SECRET) {
      return jsonResponse(
        { error: "데이터베이스가 설정되지 않았거나 JWT 시크릿이 없습니다." },
        500
      );
    }

    try {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return jsonResponse({ error: "인증 토큰이 필요합니다." }, 401);
      }

      const token = authHeader.substring(7);

      // 토큰에서 사용자 정보 추출
      const payload = await verifyJWT(token, env.JWT_SECRET);
      if (!payload) {
        // 토큰이 유효하지 않아도 세션은 삭제 시도
        await deleteSession(env.DB, token);
        return jsonResponse({ error: "유효하지 않은 토큰입니다." }, 401);
      }
      
      const deleted = await deleteSession(env.DB, token);

      if (deleted) {
        // 로그아웃 기록 추가
        try {
          const stmt = env.DB.prepare(`
            INSERT INTO login_histories (user_id, action) 
            VALUES (?, 'logout')
          `);
          await stmt.bind(payload.userId).run();
        } catch (e) {
          console.error("Logout history save error:", e);
        }
        return jsonResponse({ success: true, message: "로그아웃되었습니다." });
      } else {
        return jsonResponse({ error: "유효하지 않은 세션입니다." }, 401);
      }
    } catch (error) {
      console.error("Logout error:", error);
      return jsonResponse(
        { error: "로그아웃 처리 중 오류가 발생했습니다." },
        500
      );
    }
  },

  // 사용자 정보 조회
  async getUserInfo(request: Request, env: any): Promise<Response> {
    if (!env.DB || !env.JWT_SECRET) {
      return jsonResponse({ error: "서버 설정이 누락되었습니다." }, 500);
    }

    try {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return jsonResponse({ error: "인증 토큰이 필요합니다." }, 401);
      }

      const token = authHeader.substring(7);
      const payload = await verifyJWT(token, env.JWT_SECRET);

      if (!payload) {
        return jsonResponse({ error: "유효하지 않은 토큰입니다." }, 401);
      }

      // 세션 확인
      const sessionStmt = env.DB.prepare(
        "SELECT * FROM sessions WHERE jwt_token = ? AND expires_at > CURRENT_TIMESTAMP"
      );
      const session = await sessionStmt.bind(token).first();

      if (!session) {
        return jsonResponse({ error: "만료된 세션입니다." }, 401);
      }

      // 사용자 정보 조회
      const userStmt = env.DB.prepare(
        "SELECT id, email, name, picture, created_at FROM users WHERE id = ?"
      );
      const user = await userStmt.bind(payload.userId).first();

      if (!user) {
        return jsonResponse({ error: "사용자를 찾을 수 없습니다." }, 404);
      }

      return jsonResponse({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture,
          created_at: user.created_at,
        },
      });
    } catch (error) {
      console.error("Get user info error:", error);
      return jsonResponse(
        { error: "사용자 정보 조회 중 오류가 발생했습니다." },
        500
      );
    }
  },

  // 토큰 갱신
  async refreshToken(request: Request, env: any): Promise<Response> {
    if (!env.DB || !env.JWT_SECRET) {
      return jsonResponse({ error: "서버 설정이 누락되었습니다." }, 500);
    }

    try {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return jsonResponse({ error: "인증 토큰이 필요합니다." }, 401);
      }

      const oldToken = authHeader.substring(7);
      const payload = await verifyJWT(oldToken, env.JWT_SECRET);

      if (!payload) {
        return jsonResponse({ error: "유효하지 않은 토큰입니다." }, 401);
      }

      // 기존 세션 삭제
      await deleteSession(env.DB, oldToken);

      // 새 JWT 토큰 생성
      const newJwtToken = await generateJWT(
        { userId: payload.userId, email: payload.email },
        env.JWT_SECRET
      );

      // 새 세션 저장
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await saveSession(env.DB, payload.userId, newJwtToken, expiresAt);

      return jsonResponse({
        success: true,
        token: newJwtToken,
      });
    } catch (error) {
      console.error("Token refresh error:", error);
      return jsonResponse({ error: "토큰 갱신 중 오류가 발생했습니다." }, 500);
    }
  },
};
