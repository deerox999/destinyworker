import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";
import { jsonResponse, getUserIdFromToken } from "../../common/utils";

const createPrismaClient = (db: D1Database) => {
  const adapter = new PrismaD1(db);
  return new PrismaClient({
    adapter,
    log: ["error"], // 에러만 로깅
  });
};

// 프로필 이름 유효성 검사
const validateUserName = (userName: string): boolean => {
  if (!userName || typeof userName !== "string") return false;
  const trimmed = userName.trim();
  return trimmed.length >= 1 && trimmed.length <= 50;
};

// 사용자 정보 조회
export async function getUserProfile(
  request: Request,
  env: any
): Promise<Response> {
  try {
    const userId = await getUserIdFromToken(request);
    if (!userId) return jsonResponse({ error: "인증이 필요합니다." }, 401);

    const prisma = createPrismaClient(env.DB);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        userName: true,
        picture: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    await prisma.$disconnect();

    if (!user) {
      return jsonResponse({ error: "사용자를 찾을 수 없습니다." }, 404);
    }

    return jsonResponse({
      success: true,
      user: {
        id: user.id,
        이메일: user.email,
        이름: user.name,
        프로필이름: user.userName,
        프로필사진: user.picture,
        가입일: user.createdAt,
        수정일: user.updatedAt,
      },
    });
  } catch (error) {
    return jsonResponse(
      {
        error: "사용자 정보 조회 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

// 프로필 수정
export async function updateUserProfile(
  request: Request,
  env: any
): Promise<Response> {
  try {
    const userId = await getUserIdFromToken(request);
    if (!userId) return jsonResponse({ error: "인증이 필요합니다." }, 401);

    const body = (await request.json()) as {
      userName?: string;
      picture?: string;
    };

    const dataToUpdate: { userName?: string; picture?: string } = {};

    if (body.userName !== undefined) {
      if (!validateUserName(body.userName)) {
        return jsonResponse(
          {
            error: "프로필 이름은 1-50자 사이여야 합니다.",
          },
          400
        );
      }
      dataToUpdate.userName = body.userName.trim();
    }

    if (body.picture !== undefined) {
      if (typeof body.picture !== "string") {
        return jsonResponse(
          { error: "잘못된 프로필 사진 형식입니다." },
          400
        );
      }
      dataToUpdate.picture = body.picture;
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return jsonResponse({ error: "수정할 정보가 없습니다." }, 400);
    }

    const prisma = createPrismaClient(env.DB);

    // 사용자 존재 확인
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!existingUser) {
      await prisma.$disconnect();
      return jsonResponse({ error: "사용자를 찾을 수 없습니다." }, 404);
    }

    // 프로필 정보 업데이트
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: dataToUpdate,
    });

    await prisma.$disconnect();

    return jsonResponse({
      success: true,
      message: "프로필이 성공적으로 수정되었습니다.",
      user: {
        프로필이름: updatedUser.userName,
        프로필사진: updatedUser.picture,
      },
    });
  } catch (error) {
    return jsonResponse(
      {
        error: "프로필 수정 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}
