import { Context } from "hono";
import { createPrismaClient } from "../../../common/prismaUtils";
import { getUserFromToken } from "../../../common/utils";

// 빈 문자열을 null로 변환하여 DB 저장 호환성 유지
const normalizeOptionalTime = (value: unknown) => (value === "" ? null : value);

// 데이터 검증 (camelCase)
const validateSajuData = (data: any): boolean => {
  const isHourValid =
    data.hour === undefined ||
    data.hour === null ||
    data.hour === "" ||
    /^([01]\d|2[0-3])$/.test(data.hour);
  const isMinuteValid =
    data.minute === undefined ||
    data.minute === null ||
    data.minute === "" ||
    /^[0-5]\d$/.test(data.minute);

  return (
    data?.name?.trim() &&
    /^\d{4}$/.test(data.year) &&
    /^(0[1-9]|1[0-2])$/.test(data.month) &&
    /^(0[1-9]|[12]\d|3[01])$/.test(data.day) &&
    isHourValid &&
    isMinuteValid &&
    ["양력", "음력"].includes(data.calendar) &&
    ["남자", "여자"].includes(data.gender) &&
    (data.country === undefined || typeof data.country === 'string') &&
    (data.city === undefined || typeof data.city === 'string') &&
    (data.calculationMethod === undefined || typeof data.calculationMethod === 'string')
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
      profiles,
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
      data: {
        userId: user.id,
        name: body.name,
        year: body.year,
        month: body.month,
        day: body.day,
        hour: normalizeOptionalTime(body.hour) as string | null | undefined,
        minute: normalizeOptionalTime(body.minute) as string | null | undefined,
        calendar: body.calendar,
        gender: body.gender,
        country: body.country,
        city: body.city,
        calculationMethod: body.calculationMethod,
        context: body.context ?? null,
      },
    });
    await prisma.$disconnect();

    return c.json(
      {
        success: true,
        id: profile.id,
        profile,
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
      data: {
        name: body.name,
        year: body.year,
        month: body.month,
        day: body.day,
        hour: normalizeOptionalTime(body.hour) as string | null | undefined,
        minute: normalizeOptionalTime(body.minute) as string | null | undefined,
        calendar: body.calendar,
        gender: body.gender,
        country: body.country,
        city: body.city,
        calculationMethod: body.calculationMethod,
        context: body.context ?? null,
      },
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

// 프로필 다중 삭제
export async function deleteSajuProfiles(
  c: Context
): Promise<Response> {
  try {
    const user = await getUserFromToken(c);
    if (!user) return c.json({ error: "인증이 필요합니다." }, 401);

    const body = await c.req.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return c.json({ error: "삭제할 프로필 ID 배열이 필요합니다." }, 400);
    }

    if (!ids.every(id => typeof id === 'number' && Number.isInteger(id) && id > 0)) {
      return c.json({ error: "잘못된 ID 형식입니다." }, 400);
    }

    const prisma = createPrismaClient(c.env.DB);

    // 사용자가 소유한 프로필만 조회
    const userProfiles = await prisma.sajuProfile.findMany({
      where: {
        id: { in: ids },
        userId: user.id
      },
      select: { id: true }
    });

    const userProfileIds = userProfiles.map(profile => profile.id);
    const failedIds = ids.filter(id => !userProfileIds.includes(id));

    if (userProfileIds.length === 0) {
      await prisma.$disconnect();
      return c.json({ 
        error: "삭제할 수 있는 프로필이 없습니다.",
        failedIds 
      }, 400);
    }

    // 프로필 삭제
    await prisma.sajuProfile.deleteMany({
      where: {
        id: { in: userProfileIds }
      }
    });

    await prisma.$disconnect();

    return c.json({
      success: true,
      message: "삭제 완료",
      deletedCount: userProfileIds.length,
      failedIds: failedIds.length > 0 ? failedIds : undefined
    });
  } catch (error) {
    console.error("사주 프로필 다중 삭제 실패:", error);
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
      profile,
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
