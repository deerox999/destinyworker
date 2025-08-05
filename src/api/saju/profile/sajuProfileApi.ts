import { Context } from "hono";
import { createPrismaClient } from "../../../common/prismaUtils";
import { getUserFromToken } from "../../../common/utils";

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
  country: data.국가,
  city: data.도시,
  calculationMethod: data.계산방법,
  context: data.맥락정보 || null,
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
  국가: profile.country,
  도시: profile.city,
  계산방법: profile.calculationMethod,
  맥락정보: profile.context,
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
    ["남자", "여자"].includes(data.성별) &&
    // 선택적 필드들은 존재할 경우에만 검증
    (data.국가 === undefined || typeof data.국가 === 'string') &&
    (data.도시 === undefined || typeof data.도시 === 'string') &&
    (data.계산방법 === undefined || typeof data.계산방법 === 'string')
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
        profile: toKoreanFields(profile),
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
