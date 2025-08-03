import { generateJWT, verifyJWT } from "../../../common/utils";
import { createPrismaClient } from "../../../common/prismaUtils";
import { Context } from "hono";

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
  prisma: any,
  googleUserInfo: GoogleUserInfo
): Promise<any> {
  try {
    // 기존 사용자 찾기 (이메일 우선)
    let user = await prisma.user.findUnique({
      where: { email: googleUserInfo.email },
    });

    if (user) {
      // 기존 사용자 정보 업데이트 (googleId가 없으면 추가, 이름 업데이트)
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: user.googleId ?? googleUserInfo.sub,
          name: googleUserInfo.name,
          picture: googleUserInfo.picture,
        },
      });
    } else {
      // 새 사용자 생성
      user = await prisma.user.create({
        data: {
          googleId: googleUserInfo.sub,
          email: googleUserInfo.email,
          name: googleUserInfo.name,
          picture: googleUserInfo.picture,
          point: 3000,
        },
      });
    }

    return user;
  } catch (error) {
    console.error("Database error:", error);
    return null;
  }
}

// 세션 저장
async function saveSession(
  prisma: any,
  userId: number,
  jwtToken: string,
  expiresAt: Date
): Promise<boolean> {
  try {
    await prisma.session.create({
      data: {
        userId: userId,
        jwtToken: jwtToken,
        expiresAt: expiresAt,
      }
    });
    return true;
  } catch (error) {
    console.error("Session save error:", error);
    return false;
  }
}

// 만료된 세션 정리
async function cleanupExpiredSessions(prisma: any): Promise<void> {
  try {
    const now = new Date();
    await prisma.session.deleteMany({
      where: {
        expiresAt: {
          lt: now
        }
      }
    });
  } catch (error) {
    console.error("Session cleanup error:", error);
  }
}

// 세션 삭제
async function deleteSession(prisma: any, jwtToken: string): Promise<boolean> {
  try {
    const result = await prisma.session.deleteMany({
      where: { jwtToken: jwtToken }
    });
    return result.count > 0;
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

    const prisma = createPrismaClient(c.env.DB);

    // 사용자 조회 또는 생성
    const user = await findOrCreateUser(prisma, googleUserInfo);
    if (!user) {
      await prisma.$disconnect();
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
    await saveSession(prisma, user.id, jwtToken, expiresAt);

    // 만료된 세션 정리
    await cleanupExpiredSessions(prisma);

    // 로그인 기록 추가
    try {
      await prisma.loginHistory.create({
        data: {
          userId: user.id,
          action: 'login'
        }
      });
    } catch (e) {
      console.error("Login history save error:", e);
      // 이 에러는 로그인 자체를 실패시키지는 않음
    }

    await prisma.$disconnect();

    return c.json({
      success: true,
      token: jwtToken,
      user: user,
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
      const prisma = createPrismaClient(c.env.DB);
      await deleteSession(prisma, token);
      await prisma.$disconnect();
      return c.json({ error: "유효하지 않은 토큰입니다." }, 401);
    }

    const prisma = createPrismaClient(c.env.DB);

    // 세션 삭제 시도 (성공 여부와 관계없이 진행)
    await deleteSession(prisma, token);

    // 로그아웃 기록 추가
    try {
      await prisma.loginHistory.create({
        data: {
          userId: payload.userId,
          action: 'logout'
        }
      });
    } catch (e) {
      console.error("Logout history save error:", e);
    }

    await prisma.$disconnect();

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

    const prisma = createPrismaClient(c.env.DB);

    // 세션 확인
    const now = new Date();
    const session = await prisma.session.findFirst({
      where: {
        jwtToken: token,
        expiresAt: {
          gt: now
        }
      }
    });

    if (!session) {
      await prisma.$disconnect();
      return c.json({ error: "만료된 세션입니다." }, 401);
    }

    // 사용자 정보 조회
    const user = await prisma.user.findUnique({
      where: { id: payload.userId }
    });

    if (!user) {
      await prisma.$disconnect();
      return c.json({ error: "사용자를 찾을 수 없습니다." }, 404);
    }

    await prisma.$disconnect();
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

    const prisma = createPrismaClient(c.env.DB);

    // 기존 세션 삭제
    await deleteSession(prisma, oldToken);

    // 새 JWT 토큰 생성
    const newJwtToken = await generateJWT(
      { userId: payload.userId, email: payload.email, role: payload.role || "user" },
      c.env.GOOGLE_CLIENT_SECRET
    );

    // 새 세션 저장
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await saveSession(prisma, payload.userId, newJwtToken, expiresAt);

    await prisma.$disconnect();

    return c.json({
      success: true,
      token: newJwtToken,
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    return c.json({ error: "토큰 갱신 중 오류가 발생했습니다." }, 500);
  }
}
