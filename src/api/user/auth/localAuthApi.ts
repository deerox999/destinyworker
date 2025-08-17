import { Resend } from "resend";
import { Context } from "hono";
import { createPrismaClient } from "../../../common/prismaUtils";
import { generateJWT } from "../../../common/utils";

// 언어별 이메일 문구 정의
const contents = {
  ko: {
    serviceName: "유람",
    subject: "[유람] 인증 코드가 도착했습니다",
    title: "인증 코드가 도착했습니다",
    description: "아래 인증 코드를 입력해주세요",
    expiresText: "이 코드는 10분 동안 유효합니다",
    ignoreText: "본인이 요청하지 않은 경우 무시하셔도 됩니다",
  },
  en: {
    serviceName: "Yuram",
    subject: "[Yuram] Authentication code has arrived",
    title: "Authentication code has arrived",
    description: "Please enter the authentication code below",
    expiresText: "This code is valid for 10 minutes",
    ignoreText: "You can ignore this if you didn't request it",
  },
  zh: {
    serviceName: "遊覽",
    subject: "[遊覽] 验证码已到达",
    title: "验证码已到达",
    description: "请输入下面的验证码",
    expiresText: "此代码有效期为10分钟",
    ignoreText: "如果您没有请求，可以忽略此邮件",
  },
  ja: {
    serviceName: "遊覽",
    subject: "[遊覧] 認証コードが届きました",
    title: "認証コードが届きました",
    description: "下の認証コードを入力してください",
    expiresText: "このコードは10分間有効です",
    ignoreText: "ご本人がリクエストしていない場合は無視してください",
  },
  vi: {
    serviceName: "Yuram",
    subject: "[Yuram] Mã xác thực đã đến",
    title: "Mã xác thực đã đến",
    description: "Vui lòng nhập mã xác thực bên dưới",
    expiresText: "Mã này có hiệu lực trong 10 phút",
    ignoreText: "Bạn có thể bỏ qua nếu không yêu cầu",
  },
};

async function sendAuthCodeByEmail(
  c: Context,
  email: string,
  code: string,
  language: string = "ko"
): Promise<boolean> {
  try {
    const resendApiKey = c.env.RESEND_API_KEY;
    const resend = new Resend(resendApiKey);

    // 언어별 문구 가져오기 (기본값: 한국어)
    const content = contents[language as keyof typeof contents] || contents.ko;

    const emailContent = `
    <div style="font-family: 'Helvetica Neue', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; background-color: #f9f9f9; margin: 0 auto; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e0e0e0;">
        <div style="background-color: #D946EF; padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">${content.serviceName}</h1>
        </div>
        <div style="padding: 32px 40px; color: #333333;">
          <h2 style="font-size: 22px; font-weight: 600; margin: 0 0 16px 0; color: #1a202c;">${content.title}</h2>
          <div style="background-color: #fae8ff; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
            <p style="margin: 0 0 12px 0; font-size: 14px; color: #5a215c;">
              ${content.description}
            </p>
            <div style="display: inline-block; background-color: #ffffff; border: 1px dashed #d946ef; border-radius: 8px; padding: 12px 24px;">
              <span style="font-size: 36px; font-weight: bold; color: #86198f; letter-spacing: 12px; font-family: 'Courier New', monospace;">${code}</span>
            </div>
            <p style="margin: 16px 0 0 0; font-size: 14px; color: #64748b;">
              ${content.expiresText}
            </p>
          </div>
          <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #4a5568;">
            ${content.ignoreText}
          </p>
          <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #4a5568;">
            ${content.serviceName}
          </p>
        </div>
        
        <div style="text-align: center; padding: 24px 40px; background-color: #f8fafc; border-top: 1px solid #e0e0e0;">
          <p style="color: #94a3b8; margin: 0; font-size: 12px;">
            © ${new Date().getFullYear()} ${content.serviceName}. All Rights Reserved.
          </p>
        </div>
      </div>
    </div>`;

    await resend.emails.send({
      from: "noreply@youram.me",
      to: email,
      subject: content.subject,
      html: emailContent,
    });
    return true;
  } catch (error) {
    console.error("Failed to send email:", {
      error: error instanceof Error ? error.message : String(error),
      email: email,
      language: language,
      stack: error instanceof Error ? error.stack : undefined,
    });
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
    const { email, language = "ko" } = (await c.req.json()) as {
      email?: string;
      language?: string;
    };

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
      isVerified: false,
    });

    await c.env.AUTH_CODE_KV.put(key, value, { expirationTtl: 600 }); // 10분 TTL

    // 이메일 전송 (언어 파라미터 포함)
    const emailSent = await sendAuthCodeByEmail(c, email, authCode, language);
    if (!emailSent) {
      return c.json(
        {
          error: "인증 코드 이메일 전송에 실패했습니다.",
          emailSent: emailSent,
          authCode: authCode,
          language: language,
        },
        500
      );
    }

    return c.json({
      success: true,
      message: "인증 코드가 이메일로 전송되었습니다.",
    });
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
    const { email, code } = (await c.req.json()) as {
      email?: string;
      code?: string;
    };

    if (!email || !code) {
      return c.json({ error: "이메일과 인증 코드가 필요합니다." }, 400);
    }

    // AUTH_CODE_KV에서 인증 코드 조회
    const key = `auth_code:${email}`;
    const storedData = await c.env.AUTH_CODE_KV.get(key);

    if (!storedData) {
      return c.json(
        { error: "인증 코드가 만료되었거나 존재하지 않습니다." },
        401
      );
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
          name: email.split("@")[0], // 초기 이름은 이메일 앞부분으로 설정
          googleId: "", // 임시로 빈 문자열 설정 (데이터베이스 NOT NULL 제약조건 때문)
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
      },
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
