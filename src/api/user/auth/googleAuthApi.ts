import { generateJWT, verifyJWT } from "../../../common/utils";
import { Context } from "hono";

// 사용자 인터페이스
interface User {
  id: number;
  google_id: string;
  email: string;
  name: string;
  userName?: string;
  picture?: string;
  role: string;
  point: number;
  privacy_consent: boolean;
  privacy_consent_version: string;
  privacy_consent_at?: string;
  report_storage_consent: boolean;
  report_storage_consent_version: string;
  report_storage_consent_at?: string;
  last_consent_at?: string;
  consent_status: string;
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
    const emailVerified =
      data.email_verified === true ||
      data.email_verified === "true" ||
      data.verified_email === true ||
      data.verified_email === "true";

    return {
      sub: data.sub || data.id,
      email: data.email,
      name: data.name || data.given_name + " " + data.family_name || data.email,
      picture: data.picture,
      email_verified: emailVerified,
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
      // 기존 사용자 정보 업데이트 (이름만)
      stmt = db.prepare(`
        UPDATE users 
        SET name = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `);
      await stmt.bind(googleUserInfo.name, result.id).run();

      // 최신 유저 정보를 다시 조회하여 반환
      const updatedUserStmt = db.prepare("SELECT * FROM users WHERE id = ?");
      const updatedUser = await updatedUserStmt.bind(result.id).first();

      return updatedUser as User;
    } else {
      // 새 사용자 생성 (기본 포인트 3000 지급)
      stmt = db.prepare(`
        INSERT INTO users (google_id, email, name, picture, point, updated_at) 
        VALUES (?, ?, ?, ?, 3000, CURRENT_TIMESTAMP)
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

// Google 로그인
export async function googleLogin(
  c: Context
): Promise<Response> {
  if (!c.env.DB) {
    return c.json({ error: "데이터베이스가 설정되지 않았습니다." }, 500);
  }

  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) {
    console.log(c.env)
    return c.json({ error: "OAuth 설정이 누락되었습니다." }, 500);
  }

  try {
    const body = (await c.req.json()) as { token?: string };
    const { token } = body;

    if (!token) {
      return c.json({ error: "Google 토큰이 필요합니다." }, 400);
    }

    // Google 토큰 검증
    const googleUserInfo = await verifyGoogleToken(token, c.env.GOOGLE_CLIENT_ID);
    if (!googleUserInfo) {
      return c.json({ error: "유효하지 않은 Google 토큰입니다." }, 401);
    }

    // 사용자 조회 또는 생성
    const user = await findOrCreateUser(c.env.DB, googleUserInfo);
    if (!user) {
      return c.json(
        { error: "사용자 처리 중 오류가 발생했습니다." },
        500
      );
    }

    // JWT 토큰 생성
    const jwtToken = await generateJWT(
      { userId: user.id, email: user.email, role: user.role },
      c.env.GOOGLE_CLIENT_SECRET
    );

    // 세션 저장
    const limitDate = 7 * 24 * 60 * 60 * 1000
    const expiresAt = new Date(Date.now() + limitDate);
    await saveSession(c.env.DB, user.id, jwtToken, expiresAt);

    // 만료된 세션 정리
    await cleanupExpiredSessions(c.env.DB);

    // 로그인 기록 추가
    try {
      const stmt = c.env.DB.prepare(`
        INSERT INTO login_histories (user_id, action) 
        VALUES (?, 'login')
      `);
      await stmt.bind(user.id).run();
    } catch (e) {
      console.error("Login history save error:", e);
      // 이 에러는 로그인 자체를 실패시키지는 않음
    }

    return c.json({
      success: true,
      token: jwtToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        userName: user.userName,
        picture: user.picture,
        role: user.role,
        point: user.point,
        privacyConsent: user.privacy_consent || false,
        privacyConsentVersion: user.privacy_consent_version || "1.0",
        privacyConsentAt: user.privacy_consent_at || null,
        reportStorageConsent: user.report_storage_consent || false,
        reportStorageConsentVersion: user.report_storage_consent_version || "1.0",
        reportStorageConsentAt: user.report_storage_consent_at || null,
        lastConsentAt: user.last_consent_at || null,
        consentStatus: user.consent_status || "none",
        created_at: user.created_at,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return c.json({ error: "로그인 처리 중 오류가 발생했습니다." }, 500);
  }
}

// 로그아웃
export async function logout(c: Context): Promise<Response> {
  if (!c.env.DB || !c.env.GOOGLE_CLIENT_SECRET) {
    return c.json(
      { error: "데이터베이스가 설정되지 않았거나 JWT 시크릿이 없습니다." },
      500
    );
  }

  try {
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "인증 토큰이 필요합니다." }, 401);
    }

    const token = authHeader.substring(7);

    // 토큰에서 사용자 정보 추출
    const payload = await verifyJWT(token, c.env.GOOGLE_CLIENT_SECRET);
    if (!payload) {
      // 토큰이 유효하지 않아도 세션은 삭제 시도
      await deleteSession(c.env.DB, token);
      return c.json({ error: "유효하지 않은 토큰입니다." }, 401);
    }

    // 세션 삭제 시도 (성공 여부와 관계없이 진행)
    await deleteSession(c.env.DB, token);

    // 로그아웃 기록 추가
    try {
      const stmt = c.env.DB.prepare(`
        INSERT INTO login_histories (user_id, action) 
        VALUES (?, 'logout')
      `);
      await stmt.bind(payload.userId).run();
    } catch (e) {
      console.error("Logout history save error:", e);
    }

    return c.json({ success: true, message: "로그아웃되었습니다." });
  } catch (error) {
    console.error("Logout error:", error);
    return c.json(
      { error: "로그아웃 처리 중 오류가 발생했습니다." },
      500
    );
  }
}

// 사용자 정보 조회
export async function getUserInfo(
  c: Context
): Promise<Response> {
  if (!c.env.DB || !c.env.GOOGLE_CLIENT_SECRET) {
    return c.json({ error: "서버 설정이 누락되었습니다." }, 500);
  }

  try {
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "인증 토큰이 필요합니다." }, 401);
    }

    const token = authHeader.substring(7);
    const payload = await verifyJWT(token, c.env.GOOGLE_CLIENT_SECRET);

    if (!payload) {
      return c.json({ error: "유효하지 않은 토큰입니다." }, 401);
    }

    // 세션 확인
    const sessionStmt = c.env.DB.prepare(
      "SELECT * FROM sessions WHERE jwt_token = ? AND expires_at > CURRENT_TIMESTAMP"
    );
    const session = await sessionStmt.bind(token).first();

    if (!session) {
      return c.json({ error: "만료된 세션입니다." }, 401);
    }

    // 사용자 정보 조회
    const userStmt = c.env.DB.prepare("SELECT * FROM users WHERE id = ?");
    const user = await userStmt.bind(payload.userId).first();
    if (!user) {
      return c.json({ error: "사용자를 찾을 수 없습니다." }, 404);
    }
    return c.json({ user: user });
  } catch (error) {
    console.error("Get user info error:", error);
    return c.json(
      { error: "사용자 정보 조회 중 오류가 발생했습니다." },
      500
    );
  }
}

// 토큰 갱신
export async function refreshToken(
  c: Context
): Promise<Response> {
  if (!c.env.DB || !c.env.GOOGLE_CLIENT_SECRET) {
    return c.json({ error: "서버 설정이 누락되었습니다." }, 500);
  }

  try {
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "인증 토큰이 필요합니다." }, 401);
    }

    const oldToken = authHeader.substring(7);
    const payload = await verifyJWT(oldToken, c.env.GOOGLE_CLIENT_SECRET);

    if (!payload) {
      return c.json({ error: "유효하지 않은 토큰입니다." }, 401);
    }

    // 기존 세션 삭제
    await deleteSession(c.env.DB, oldToken);

    // 새 JWT 토큰 생성
    const newJwtToken = await generateJWT(
      { userId: payload.userId, email: payload.email, role: payload.role || "user" },
      c.env.GOOGLE_CLIENT_SECRET
    );

    // 새 세션 저장
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await saveSession(c.env.DB, payload.userId, newJwtToken, expiresAt);

    return c.json({
      success: true,
      token: newJwtToken,
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    return c.json({ error: "토큰 갱신 중 오류가 발생했습니다." }, 500);
  }
}
