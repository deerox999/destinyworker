import { Context } from "hono";
import { createPrismaClient } from "../../common/prismaUtils";
import { getUserFromToken } from "../../common/utils";

// 한글 -> 영어 필드 변환
const toDbFields = (data: any) => ({
  name: data.이름,
  year: data.년,
  month: data.월,
  day: data.일,
  hour: data.시간 === "" || data.시간 === null ? null : data.시간,
  minute: data.분 === "" || data.분 === null ? null : data.분,
  calendar: data.달력,
  gender: data.성별,
});

// 영어 -> 한글 필드 변환
const toKoreanFields = (profile: any) => ({
  id: profile.id,
  이름: profile.name,
  년: profile.year,
  월: profile.month,
  일: profile.day,
  시간: profile.hour,
  분: profile.minute,
  달력: profile.calendar,
  성별: profile.gender,
  createdAt: profile.createdAt,
  updatedAt: profile.updatedAt,
});

// 데이터 검증
const validateSajuData = (data: any): boolean => {
  const isHourValid =
    data.시간 === undefined ||
    data.시간 === null ||
    data.시간 === "" ||
    /^([01]\d|2[0-3])$/.test(data.시간);
  const isMinuteValid =
    data.분 === undefined ||
    data.분 === null ||
    data.분 === "" ||
    /^[0-5]\d$/.test(data.분);

  return (
    data?.이름?.trim() &&
    /^\d{4}$/.test(data.년) &&
    /^(0[1-9]|1[0-2])$/.test(data.월) &&
    /^(0[1-9]|[12]\d|3[01])$/.test(data.일) &&
    isHourValid &&
    isMinuteValid &&
    ["양력", "음력"].includes(data.달력) &&
    ["남자", "여자"].includes(data.성별)
  );
};

// 프로필 목록 조회
export async function getSajuProfiles(
  c: Context
): Promise<Response> {
  try {
    const user = await getUserFromToken(c);
    if (!user) return c.json({ error: "인증이 필요합니다." }, 401);

    const prisma = createPrismaClient(c.env.DB);
    const profiles = await prisma.sajuProfile.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    });
    await prisma.$disconnect();

    return c.json({
      success: true,
      profiles: profiles.map(toKoreanFields),
      count: profiles.length,
    });
  } catch (error) {
    console.error("사주 프로필 목록 조회 실패:", error);
    return c.json(
      {
        error: "조회 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

// 프로필 생성
export async function createSajuProfile(
  c: Context
): Promise<Response> {
  try {
    const user = await getUserFromToken(c);
    if (!user) return c.json({ error: "인증이 필요합니다." }, 401);

    const body = await c.req.json();
    if (!validateSajuData(body)) {
      return c.json({ error: "잘못된 데이터입니다." }, 400);
    }

    const prisma = createPrismaClient(c.env.DB);
    const profile = await prisma.sajuProfile.create({
      data: { userId: user.id, ...toDbFields(body) },
    });
    await prisma.$disconnect();

    return c.json(
      {
        success: true,
        id: profile.id,
        message: "생성 완료",
      },
      201
    );
  } catch (error) {
    console.error("사주 프로필 생성 실패:", error);
    return c.json(
      {
        error: "생성 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

// 프로필 수정
export async function updateSajuProfile(
  c: Context
): Promise<Response> {
  try {
    const user = await getUserFromToken(c);
    if (!user) return c.json({ error: "인증이 필요합니다." }, 401);

    const profileId = Number(c.req.param("id"));
    if (!profileId) return c.json({ error: "잘못된 ID입니다." }, 400);

    const body = await c.req.json();
    if (!validateSajuData(body)) {
      return c.json({ error: "잘못된 데이터입니다." }, 400);
    }

    const prisma = createPrismaClient(c.env.DB);

    // 소유권 확인
    const existing = await prisma.sajuProfile.findUnique({
      where: { id: profileId },
      select: { userId: true },
    });

    if (!existing) {
      await prisma.$disconnect();
      return c.json({ error: "프로필을 찾을 수 없습니다." }, 404);
    }

    if (existing.userId !== user.id) {
      await prisma.$disconnect();
      return c.json({ error: "권한이 없습니다." }, 403);
    }

    await prisma.sajuProfile.update({
      where: { id: profileId },
      data: toDbFields(body),
    });
    await prisma.$disconnect();

    return c.json({ success: true, message: "수정 완료" });
  } catch (error) {
    console.error("사주 프로필 수정 실패:", error);
    return c.json(
      {
        error: "수정 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

// 프로필 삭제
export async function deleteSajuProfile(
  c: Context
): Promise<Response> {
  try {
    const user = await getUserFromToken(c);
    if (!user) return c.json({ error: "인증이 필요합니다." }, 401);

    const profileId = Number(c.req.param("id"));
    if (!profileId) return c.json({ error: "잘못된 ID입니다." }, 400);

    const prisma = createPrismaClient(c.env.DB);

    // 소유권 확인
    const existing = await prisma.sajuProfile.findUnique({
      where: { id: profileId },
      select: { userId: true },
    });

    if (!existing) {
      await prisma.$disconnect();
      return c.json({ error: "프로필을 찾을 수 없습니다." }, 404);
    }

    if (existing.userId !== user.id) {
      await prisma.$disconnect();
      return c.json({ error: "권한이 없습니다." }, 403);
    }

    await prisma.sajuProfile.delete({ where: { id: profileId } });
    await prisma.$disconnect();

    return c.json({ success: true, message: "삭제 완료" });
  } catch (error) {
    console.error("사주 프로필 삭제 실패:", error);
    return c.json(
      {
        error: "삭제 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

// 특정 프로필 조회
export async function getSajuProfile(
  c: Context
): Promise<Response> {
  try {
    const user = await getUserFromToken(c);
    if (!user) return c.json({ error: "인증이 필요합니다." }, 401);

    const profileId = Number(c.req.param("id"));
    if (!profileId) return c.json({ error: "잘못된 ID입니다." }, 400);

    const prisma = createPrismaClient(c.env.DB);
    const profile = await prisma.sajuProfile.findUnique({
      where: { id: profileId },
    });
    await prisma.$disconnect();

    if (!profile)
      return c.json({ error: "프로필을 찾을 수 없습니다." }, 404);
    if (profile.userId !== user.id)
      return c.json({ error: "권한이 없습니다." }, 403);

    return c.json({
      success: true,
      profile: toKoreanFields(profile),
    });
  } catch (error) {
    console.error("사주 프로필 조회 실패:", error);
    return c.json(
      {
        error: "조회 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}
