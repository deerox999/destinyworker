import { Resend } from 'resend';
import { Context } from "hono";
import { createPrismaClient } from "../../../common/prismaUtils";
import { generateJWT } from "../../../common/utils";

async function sendAuthCodeByEmail(c: Context, email: string, code: string): Promise<boolean> {
  try {
    const resendApiKey = c.env.RESEND_API_KEY || 're_AHMdfbmP_24W9BSLXtCJe5DPSR3Z99HRX';
    const resend = new Resend(resendApiKey);
    
    const emailContent = `
    <div style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
      <div style="background-color: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2c3e50; margin: 0; font-size: 28px; font-weight: 600;">유람</h1>
          <p style="color: #7f8c8d; margin: 10px 0 0 0; font-size: 16px;">인증 코드가 도착했습니다</p>
        </div>
        
        <div style="background-color: #ecf0f1; border-radius: 8px; padding: 20px; margin: 30px 0; text-align: center;">
          <p style="color: #2c3e50; margin: 0 0 15px 0; font-size: 14px; font-weight: 500;">아래 인증 코드를 입력해주세요</p>
          <div style="background-color: white; border: 2px solid #3498db; border-radius: 6px; padding: 15px; display: inline-block; min-width: 120px;">
            <span style="font-size: 32px; font-weight: bold; color: #2c3e50; letter-spacing: 8px;">${code}</span>
          </div>
        </div>
        
        <div style="text-align: center; margin-top: 30px;">
          <p style="color: #7f8c8d; margin: 0; font-size: 14px;">이 코드는 10분 동안 유효합니다</p>
          <p style="color: #95a5a6; margin: 10px 0 0 0; font-size: 12px;">본인이 요청하지 않은 경우 무시하셔도 됩니다</p>
        </div>
      </div>
    </div>`;
    
    const result = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: email,
      subject: '[유람] 인증 코드가 도착했습니다',
      html: emailContent
    });
    
    console.log(`Authentication code sent to ${email}`, result);
    return true;
  } catch (error) {
    console.error("Failed to send email:", {
      error: error instanceof Error ? error.message : String(error),
      email: email,
      stack: error instanceof Error ? error.stack : undefined
    });
    return false;
  }
}

// 인증 코드 생성 (4자리 숫자)
function generateAuthCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// 이메일 인증 코드 요청
export async function requestEmailAuthCode(c: Context): Promise<Response> {
  if (!c.env.DB) {
    return c.json({ error: "데이터베이스가 설정되지 않았습니다." }, 500);
  }

  try {
    const { email } = (await c.req.json()) as { email?: string };

    if (!email) {
      return c.json({ error: "이메일이 필요합니다." }, 400);
    }

    const authCode = generateAuthCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10분 후 만료

    // AUTH_CODE_KV에 인증 코드 저장 (TTL: 10분)
    const key = `auth_code:${email}`;
    const value = JSON.stringify({
      code: authCode,
      expiresAt: expiresAt.toISOString(),
      isVerified: false
    });
    
    await c.env.AUTH_CODE_KV.put(key, value, { expirationTtl: 600 }); // 10분 TTL

    // 이메일 전송
    const emailSent = await sendAuthCodeByEmail(c, email, authCode);
    if (!emailSent) {
        return c.json(
          {
            error: "인증 코드 이메일 전송에 실패했습니다.",
            emailSent: emailSent,
            authCode: authCode,
          },
          500
        );
    }

    return c.json({ success: true, message: "인증 코드가 이메일로 전송되었습니다." });
  } catch (error) {
    console.error("Request auth code error:", error);
    return c.json({ error: "인증 코드 요청 중 오류가 발생했습니다." }, 500);
  }
}

// 이메일 코드 검증 및 로그인
export async function verifyEmailCodeAndLogin(c: Context): Promise<Response> {
  if (!c.env.DB) {
    return c.json({ error: "서버 설정이 누락되었습니다." }, 500);
  }

  try {
    const { email, code } = (await c.req.json()) as { email?: string; code?: string };

    if (!email || !code) {
      return c.json({ error: "이메일과 인증 코드가 필요합니다." }, 400);
    }

    // AUTH_CODE_KV에서 인증 코드 조회
    const key = `auth_code:${email}`;
    const storedData = await c.env.AUTH_CODE_KV.get(key);
    
    if (!storedData) {
      return c.json({ error: "인증 코드가 만료되었거나 존재하지 않습니다." }, 401);
    }

    const authData = JSON.parse(storedData);
    
    if (authData.code !== code) {
      return c.json({ error: "인증 코드가 올바르지 않습니다." }, 401);
    }

    if (new Date() > new Date(authData.expiresAt)) {
      // 만료된 코드 삭제
      await c.env.AUTH_CODE_KV.delete(key);
      return c.json({ error: "인증 코드가 만료되었습니다." }, 401);
    }

    const prisma = createPrismaClient(c.env.DB);

    // 사용자 조회 또는 생성
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: email,
          name: email.split('@')[0], // 초기 이름은 이메일 앞부분으로 설정
          point: 3000,
        },
      });
    }

    // JWT 토큰 생성
    const jwtToken = await generateJWT(
      { userId: user.id, email: user.email, role: user.role },
      c.env.GOOGLE_CLIENT_SECRET
    );

    // 세션 저장
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.session.create({
        data: {
            userId: user.id,
            jwtToken: jwtToken,
            expiresAt: expiresAt,
        }
    });

    // 인증 코드 삭제
    await c.env.AUTH_CODE_KV.delete(key);

    await prisma.$disconnect();

    return c.json({
      success: true,
      token: jwtToken,
      user: user,
    });
  } catch (error) {
    console.error("Login error:", error);
    return c.json({ error: "로그인 중 오류가 발생했습니다." }, 500);
  }
}
