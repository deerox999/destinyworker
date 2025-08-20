import { Context } from "hono";
import { createPrismaClient } from "../../common/prismaUtils";
import { getUserFromToken } from "../../common/utils";
import { deleteR2Object, deleteImagesFromR2 } from "../common/r2Api";

// 프로필 이름 유효성 검사
const validateUserName = (userName: string): boolean => {
  if (!userName || typeof userName !== "string") return false;
  const trimmed = userName.trim();
  return trimmed.length >= 1 && trimmed.length <= 50;
};

// R2 이미지 URL인지 확인
const isR2ImageUrl = (url: string, R2_PUBLIC_URL: string): boolean => {
  return url.startsWith(R2_PUBLIC_URL);
};

// R2 이미지 URL에서 객체 키 추출
const getObjectKeyFromUrl = (url: string, R2_PUBLIC_URL: string): string => {
  return url.replace(`${R2_PUBLIC_URL}/`, "");
};

// 프로필 수정
export async function updateUserProfile(c: Context): Promise<Response> {
  try {
    const user = await getUserFromToken(c);
    if (!user) return c.json({ error: "인증이 필요합니다." }, 401);

    const body = (await c.req.json()) as {
      userName?: string;
      picture?: string;
    };

    const dataToUpdate: { userName?: string; picture?: string } = {};

    if (body.userName !== undefined) {
      if (!validateUserName(body.userName)) {
        return c.json(
          {
            error: "프로필 이름은 1-50자 사이여야 합니다.",
          },
          400
        );
      }

      const trimmedUserName = body.userName.trim();

      // 사용자 이름 중복 체크
      const prisma = createPrismaClient(c.env.DB);
      const existingUserWithName = await prisma.user.findFirst({
        where: {
          userName: trimmedUserName,
          id: { not: user.id }, // 현재 사용자 제외
        },
        select: { id: true },
      });

      if (existingUserWithName) {
        await prisma.$disconnect();
        return c.json(
          {
            error: "이미 사용 중인 프로필 이름입니다.",
          },
          400
        );
      }

      dataToUpdate.userName = trimmedUserName;
    }

    const prisma = createPrismaClient(c.env.DB);

    // 사용자 존재 확인 및 현재 프로필 정보 가져오기
    const existingUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, picture: true },
    });

    if (!existingUser) {
      await prisma.$disconnect();
      return c.json({ error: "사용자를 찾을 수 없습니다." }, 404);
    }

    if (body.picture !== undefined) {
      if (typeof body.picture !== "string") {
        await prisma.$disconnect();
        return c.json({ error: "잘못된 프로필 사진 형식입니다." }, 400);
      }

      // 기존 이미지가 R2에 저장된 이미지인 경우 삭제
      if (
        existingUser.picture &&
        isR2ImageUrl(existingUser.picture, c.env.R2_PUBLIC_URL)
      ) {
        const objectKey = getObjectKeyFromUrl(
          existingUser.picture,
          c.env.R2_PUBLIC_URL
        );
        const deleteResult = await deleteR2Object(objectKey, c.env);
        if (!deleteResult) {
          console.error(`Failed to delete old profile image: ${objectKey}`);
        }
      }

      dataToUpdate.picture = body.picture;
    }

    if (Object.keys(dataToUpdate).length === 0) {
      await prisma.$disconnect();
      return c.json({ error: "수정할 정보가 없습니다." }, 400);
    }

    // 프로필 정보 업데이트
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: dataToUpdate,
    });

    await prisma.$disconnect();

    return c.json({
      success: true,
      message: "프로필이 성공적으로 수정되었습니다.",
      user: {
        userName: updatedUser.userName,
        picture: updatedUser.picture,
      },
    });
  } catch (error) {
    console.error("프로필 수정 실패:", error);
    return c.json(
      {
        error: "프로필 수정 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

// 개인정보 동의 업데이트
export async function updateConsent(c: Context): Promise<Response> {
  try {
    const userInfo = await getUserFromToken(c);
    if (!userInfo) return c.json({ error: "인증이 필요합니다." }, 401);

    const body = (await c.req.json()) as {
      privacyConsent?: boolean;
      privacyConsentVersion?: string;
      reportStorageConsent?: boolean;
      reportStorageConsentVersion?: string;
    };

    const prisma = createPrismaClient(c.env.DB);

    // 사용자 존재 확인
    const existingUser = await prisma.user.findUnique({
      where: { id: userInfo.id },
      select: { id: true },
    });

    if (!existingUser) {
      await prisma.$disconnect();
      return c.json({ error: "사용자를 찾을 수 없습니다." }, 404);
    }

    const now = new Date();
    const updateData: any = {};

    // 개인정보 동의 처리
    if (body.privacyConsent !== undefined) {
      updateData.privacyConsent = body.privacyConsent;
      updateData.privacyConsentVersion = body.privacyConsentVersion || "1.0";
      if (body.privacyConsent) {
        updateData.privacyConsentAt = now;
      }
    }

    // 리포트 저장 동의 처리
    if (body.reportStorageConsent !== undefined) {
      updateData.reportStorageConsent = body.reportStorageConsent;
      updateData.reportStorageConsentVersion =
        body.reportStorageConsentVersion || "1.0";
      if (body.reportStorageConsent) {
        updateData.reportStorageConsentAt = now;
      }
    }

    // 동의 상태 계산
    const privacyConsent =
      body.privacyConsent !== undefined
        ? body.privacyConsent
        : (
            await prisma.user.findUnique({
              where: { id: userInfo.id },
              select: { privacyConsent: true },
            })
          )?.privacyConsent;

    const reportStorageConsent =
      body.reportStorageConsent !== undefined
        ? body.reportStorageConsent
        : (
            await prisma.user.findUnique({
              where: { id: userInfo.id },
              select: { reportStorageConsent: true },
            })
          )?.reportStorageConsent;

    if (privacyConsent && reportStorageConsent) {
      updateData.consentStatus = "complete";
      updateData.lastConsentAt = now;
    } else if (privacyConsent || reportStorageConsent) {
      updateData.consentStatus = "partial";
      updateData.lastConsentAt = now;
    } else {
      updateData.consentStatus = "none";
    }

    // 사용자 정보 업데이트
    const updatedUser = await prisma.user.update({
      where: { id: userInfo.id },
      data: updateData,
      select: {
        privacyConsent: true,
        privacyConsentVersion: true,
        privacyConsentAt: true,
        reportStorageConsent: true,
        reportStorageConsentVersion: true,
        reportStorageConsentAt: true,
        lastConsentAt: true,
        consentStatus: true,
      },
    });

    await prisma.$disconnect();

    return c.json({
      success: true,
      message: "동의 정보가 성공적으로 업데이트되었습니다.",
      consent: updatedUser,
    });
  } catch (error) {
    console.error("동의 정보 업데이트 실패:", error);
    return c.json(
      {
        error: "동의 정보 업데이트 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

// 회원 탈퇴: 사용자와 관련된 모든 기록 삭제
export async function deleteAccount(c: Context): Promise<Response> {
  try {
    const user = await getUserFromToken(c);
    if (!user) return c.json({ error: "인증이 필요합니다." }, 401);

    const prisma = createPrismaClient(c.env.DB);

    // 세션 유효성 확인 (만료/삭제 여부 검증)
    const authHeader = c.req.header("Authorization");
    const token =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.substring(7)
        : null;
    if (!token) {
      await prisma.$disconnect();
      return c.json({ error: "인증 토큰이 필요합니다." }, 401);
    }

    // 프로필 이미지가 R2에 있으면 삭제를 위해 현재 사용자 조회
    const existingUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { picture: true },
    });

    // 사용자가 작성한 게시글/댓글에 포함된 R2 이미지 삭제
    try {
      const [userPosts, userComments] = await Promise.all([
        prisma.post.findMany({
          where: { authorId: user.id },
          select: { content: true },
        }),
        prisma.comment.findMany({
          where: { authorId: user.id },
          select: { content: true },
        }),
      ]);
      for (const p of userPosts) {
        if (p.content) {
          await deleteImagesFromR2(p.content, c.env);
        }
      }
      for (const cm of userComments) {
        if (cm.content) {
          await deleteImagesFromR2(cm.content, c.env);
        }
      }
    } catch (e) {
      console.error("R2 이미지 정리 중 오류:", e);
    }

    // 커뮤니티 데이터 정리 (외래키 onDelete가 없는 항목 수동 정리)
    // 1) 사용자가 작성한 게시글 삭제 (게시글 삭제 시 해당 게시글의 댓글/추천은 Cascade)
    await prisma.post.deleteMany({ where: { authorId: user.id } });

    // 2) 사용자가 작성한 댓글 삭제 (해당 댓글의 추천은 Cascade)
    await prisma.comment.deleteMany({ where: { authorId: user.id } });

    // 기타 데이터는 Prisma 스키마에서 onDelete: Cascade로 연결되어 있어
    // 사용자 삭제 시 함께 제거됩니다. (세션, 사주 프로필, 대화기록, 분석, 포인트, 로그 등)

    // 사용자 삭제
    await prisma.user.delete({ where: { id: user.id } });

    // 프로필 이미지 R2에서 삭제 (사용자 레코드 삭제 후에도 URL 정보는 위에서 확보함)
    if (
      existingUser?.picture &&
      c.env.R2_PUBLIC_URL &&
      existingUser.picture.startsWith(c.env.R2_PUBLIC_URL)
    ) {
      try {
        const objectKey = existingUser.picture.replace(
          `${c.env.R2_PUBLIC_URL}/`,
          ""
        );
        await deleteR2Object(objectKey, c.env);
      } catch (e) {
        console.error("Failed to delete profile image from R2:", e);
      }
    }

    await prisma.$disconnect();

    return c.json({
      success: true,
      message: "회원탈퇴가 완료되었습니다. 모든 기록이 삭제되었습니다.",
    });
  } catch (error) {
    console.error("회원탈퇴 실패:", error);
    return c.json(
      {
        error: "회원탈퇴 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}
