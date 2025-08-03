import { EmailMessage } from "cloudflare:email";
import { Context } from "hono";
import { createPrismaClient } from "../../../common/prismaUtils";
import { generateJWT } from "../../../common/utils";

async function sendAuthCodeByEmail(c: Context, email: string, code: string): Promise<boolean> {
  try {
    const emailContent = `From: Destiny Worker <noreply@youram.me>
    To: ${email}
    Subject: [Destiny Worker] 인증 코드가 도착했습니다.
    Content-Type: text/html; charset=UTF-8
    
    <div style="font-family: sans-serif; text-align: center; padding: 20px;">
      <h2>인증 코드 안내</h2>
      <p>Destiny Worker에 로그인하려면 아래 인증 코드를 입력해주세요.</p>
      <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px; margin: 20px 0; padding: 10px; background-color: #f0f0f0; border-radius: 5px;">
        ${code}
      </p>
      <p>이 코드는 10분 동안 유효합니다.</p>
    </div>`;
    
    const message = new EmailMessage(
      "noreply@youram.me",
      email,
      emailContent
    );
    
    await c.env.EMAIL_SENDER.send(message);
    console.log(`Authentication code sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Failed to send email:", error);
    return false;
  }
}

// 인증 코드 생성 (6자리 숫자)
function generateAuthCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
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

    const prisma = createPrismaClient(c.env.DB);
    const authCode = generateAuthCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10분 후 만료

    // 기존 코드가 있으면 업데이트, 없으면 새로 생성
    await prisma.emailAuthCode.upsert({
      where: { email },
      update: {
        code: authCode,
        expiresAt: expiresAt,
        isVerified: false,
      },
      create: {
        email,
        code: authCode,
        expiresAt: expiresAt,
      },
    });

    // 이메일 전송 (실제 구현 필요)
    const emailSent = await sendAuthCodeByEmail(c, email, authCode);
    if (!emailSent) {
        await prisma.$disconnect();
        return c.json(
          {
            error: "인증 코드 이메일 전송에 실패했습니다.",
            emailSent: emailSent,
            MAIL_SENDER: c.env.EMAIL_SENDER,
          },
          500
        );
    }

    await prisma.$disconnect();

    return c.json({ success: true, message: "인증 코드가 이메일로 전송되었습니다." });
  } catch (error) {
    console.error("Request auth code error:", error);
    return c.json({ error: "인증 코드 요청 중 오류가 발생했습니다." }, 500);
  }
}

// 이메일 코드 검증 및 로그인
export async function verifyEmailCodeAndLogin(c: Context): Promise<Response> {
  if (!c.env.DB || !c.env.GOOGLE_CLIENT_SECRET) {
    return c.json({ error: "서버 설정이 누락되었습니다." }, 500);
  }

  try {
    const { email, code } = (await c.req.json()) as { email?: string; code?: string };

    if (!email || !code) {
      return c.json({ error: "이메일과 인증 코드가 필요합니다." }, 400);
    }

    const prisma = createPrismaClient(c.env.DB);

    // 인증 코드 확인
    const emailAuth = await prisma.emailAuthCode.findUnique({
      where: { email },
    });

    if (!emailAuth || emailAuth.code !== code) {
      await prisma.$disconnect();
      return c.json({ error: "인증 코드가 올바르지 않습니다." }, 401);
    }

    if (new Date() > emailAuth.expiresAt) {
      await prisma.$disconnect();
      return c.json({ error: "인증 코드가 만료되었습니다." }, 401);
    }

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
    await prisma.emailAuthCode.delete({ where: { email } });

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
