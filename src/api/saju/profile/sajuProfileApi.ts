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
      orderBy: [
        { groupName: "asc" },
        { sortOrder: "asc" },
        { updatedAt: "desc" },
      ],
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

// 프로필 목록 일괄 업데이트(그룹/정렬 동시 처리)
export async function updateSajuProfilesBulk(
  c: Context
): Promise<Response> {
  try {
    const user = await getUserFromToken(c);
    if (!user) return c.json({ error: "인증이 필요합니다." }, 401);

    const body = await c.req.json();
    const { items, autoSort } = body as {
      items?: Array<{
        id: number;
        // 기본 정보
        name?: string;
        year?: string;
        month?: string;
        day?: string;
        hour?: string | null;
        minute?: string | null;
        calendar?: string;
        gender?: string;
        country?: string | null;
        city?: string | null;
        calculationMethod?: string | null;
        context?: string | null;
        // 그룹/정렬
        groupName?: string | null;
        sortOrder?: number | null;
      }>;
      autoSort?: boolean;
    };

    if (!Array.isArray(items) || items.length === 0) {
      return c.json({ error: "업데이트할 항목이 필요합니다." }, 400);
    }

    // 최소 유효성 검사
    const sanitized = items.filter(
      (x) => x && typeof x.id === 'number' && Number.isInteger(x.id) && x.id > 0
    );
    if (sanitized.length === 0) {
      return c.json({ error: "잘못된 데이터 형식입니다." }, 400);
    }

    const ids = sanitized.map((x) => x.id);
    const prisma = createPrismaClient(c.env.DB);

    // 소유한 프로필 조회 + 기존 그룹/정렬 정보 필요
    const ownProfiles = await prisma.sajuProfile.findMany({
      where: { id: { in: ids }, userId: user.id },
      select: { id: true, groupName: true, sortOrder: true },
    });
    const ownIds = new Set(ownProfiles.map((p) => p.id));
    const failedIds: number[] = ids.filter((id) => !ownIds.has(id));

    // 기존 상태 맵
    const existingById = new Map<number, { groupName: string | null; sortOrder: number }>();
    for (const p of ownProfiles) {
      existingById.set(p.id, { groupName: p.groupName ?? null, sortOrder: p.sortOrder ?? 0 });
    }

    // 유효 그룹 계산(입력값 우선, 없으면 기존값)
    type EffectiveItem = {
      id: number;
      // 업데이트 데이터(필드별로 선택 적용)
      data: Record<string, unknown>;
      // 그룹/정렬 계산용
      groupName: string | null;
      sortOrder?: number | null;
      // 원본 입력에 포함되었는지 여부(보낸 필드만 변경 보장)
      provided: {
        groupName: boolean;
        sortOrder: boolean;
      }
    };
    const effectiveItems: EffectiveItem[] = sanitized
      .filter(({ id }) => ownIds.has(id))
      .map((item) => {
        const existing = existingById.get(item.id);
        const effectiveGroup = item.groupName !== undefined ? (item.groupName ?? null) : (existing?.groupName ?? null);

        // 필드별 유효성 검사 및 정규화
        const updateData: Record<string, unknown> = {};

        if (item.name !== undefined) {
          if (!item.name || !item.name.trim()) throw new Error("이름 형식이 올바르지 않습니다.");
          updateData.name = item.name;
        }
        if (item.year !== undefined) {
          if (!/^\d{4}$/.test(item.year)) throw new Error("년도 형식이 올바르지 않습니다.");
          updateData.year = item.year;
        }
        if (item.month !== undefined) {
          if (!/^(0[1-9]|1[0-2])$/.test(item.month)) throw new Error("월 형식이 올바르지 않습니다.");
          updateData.month = item.month;
        }
        if (item.day !== undefined) {
          if (!/^(0[1-9]|[12]\d|3[01])$/.test(item.day)) throw new Error("일 형식이 올바르지 않습니다.");
          updateData.day = item.day;
        }
        if (item.hour !== undefined) {
          const v = normalizeOptionalTime(item.hour) as string | null;
          if (v !== null && !/^([01]\d|2[0-3])$/.test(v)) throw new Error("시간 형식이 올바르지 않습니다.");
          updateData.hour = v;
        }
        if (item.minute !== undefined) {
          const v = normalizeOptionalTime(item.minute) as string | null;
          if (v !== null && !/^[0-5]\d$/.test(v)) throw new Error("분 형식이 올바르지 않습니다.");
          updateData.minute = v;
        }
        if (item.calendar !== undefined) {
          if (!["양력", "음력"].includes(item.calendar)) throw new Error("달력 형식이 올바르지 않습니다.");
          updateData.calendar = item.calendar;
        }
        if (item.gender !== undefined) {
          if (!["남자", "여자"].includes(item.gender)) throw new Error("성별 형식이 올바르지 않습니다.");
          updateData.gender = item.gender;
        }
        if (item.country !== undefined) {
          if (!(item.country === null || typeof item.country === 'string')) throw new Error("국가 형식이 올바르지 않습니다.");
          updateData.country = item.country;
        }
        if (item.city !== undefined) {
          if (!(item.city === null || typeof item.city === 'string')) throw new Error("도시 형식이 올바르지 않습니다.");
          updateData.city = item.city;
        }
        if (item.calculationMethod !== undefined) {
          if (!(item.calculationMethod === null || typeof item.calculationMethod === 'string')) throw new Error("계산 방법 형식이 올바르지 않습니다.");
          updateData.calculationMethod = item.calculationMethod;
        }
        if (item.context !== undefined) {
          if (!(item.context === null || typeof item.context === 'string')) throw new Error("맥락 형식이 올바르지 않습니다.");
          updateData.context = item.context;
        }

        const groupProvided = item.groupName !== undefined;
        if (groupProvided) {
          if (!(item.groupName === null || typeof item.groupName === 'string')) throw new Error("그룹명 형식이 올바르지 않습니다.");
          // groupName은 실제 업데이트 시에만 포함(보낸 경우에만)
          updateData.groupName = item.groupName;
        }

        const sortProvided = item.sortOrder !== undefined && item.sortOrder !== null;
        // sortOrder는 아래에서 자동 보정 또는 직접 반영
        return { id: item.id, data: updateData, groupName: effectiveGroup, sortOrder: item.sortOrder, provided: { groupName: groupProvided, sortOrder: sortProvided } };
      });

    // 그룹별 현재 최대값+1 로 자동 부여(기본 true)
    if (autoSort !== false) {
      // 현재 DB에서 자동 부여가 필요한 그룹들의 최대 sortOrder 조회
      const groupsNeedingAuto = Array.from(new Set(
        effectiveItems
          .filter(i => i.provided.groupName && (i.sortOrder === undefined || i.sortOrder === null))
          .map(i => i.groupName ?? null)
      ));
      const maxByGroup = new Map<string | null, number>();
      for (const g of groupsNeedingAuto) {
        const maxItem = await prisma.sajuProfile.findFirst({
          where: { userId: user.id, groupName: g },
          orderBy: { sortOrder: 'desc' },
          select: { sortOrder: true },
        });
        maxByGroup.set(g, (maxItem?.sortOrder ?? -1) + 1);
      }

      for (const item of effectiveItems) {
        // sortOrder 미지정이면서 groupName을 보낸 경우에만 자동 부여
        if ((item.sortOrder === undefined || item.sortOrder === null) && item.provided.groupName) {
          const key = item.groupName ?? null;
          const next = maxByGroup.get(key) ?? 0;
          item.sortOrder = next;
          maxByGroup.set(key, next + 1);
        }
      }
    } else {
      // 요청 배열 순번 기준 0부터 자동 부여
      const groupToNextOrder = new Map<string | null, number>();
      for (const item of effectiveItems) {
        // sortOrder 미지정이면서 groupName을 보낸 경우에만 자동 부여
        if ((item.sortOrder === undefined || item.sortOrder === null) && item.provided.groupName) {
          const key = item.groupName ?? null;
          const next = groupToNextOrder.get(key) ?? 0;
          item.sortOrder = next;
          groupToNextOrder.set(key, next + 1);
        }
      }
    }

    // 순차 업데이트
    let updatedCount = 0;
    for (const { id, data, groupName, sortOrder, provided } of effectiveItems) {
      // 업데이트 데이터 구성: 보낸 필드만 업데이트
      const updateData: Record<string, unknown> = { ...data };
      if (provided.groupName) {
        updateData.groupName = groupName;
      }
      if (provided.sortOrder || (provided.groupName && (sortOrder !== undefined && sortOrder !== null))) {
        updateData.sortOrder = sortOrder as number;
      }
      if (Object.keys(updateData).length === 0) {
        // 변경할 필드가 없다면 skip
        continue;
      }
      await prisma.sajuProfile.update({
        where: { id },
        data: updateData,
      });
      updatedCount += 1;
    }

    await prisma.$disconnect();

    return c.json({
      success: true,
      message: "프로필 목록이 업데이트되었습니다.",
      updatedCount,
      failedIds: failedIds.length > 0 ? failedIds : undefined,
    });
  } catch (error) {
    console.error("사주 프로필 일괄 업데이트 실패:", error);
    return c.json(
      {
        error: "수정 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}