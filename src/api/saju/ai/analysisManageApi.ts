import { Context } from "hono";
import { buildPaginationMeta, parsePagination } from "../../../common/paginationUtils";
import { createPrismaClient } from "../../../common/prismaUtils";
import { getUserFromToken, toUTC, toJSON } from "../../../common/utils";

// UTC 변환은 공통 유틸 사용

/**
 * 사용자의 사주 분석 결과 목록을 조회하는 API
 */
export async function getSajuAnalysisList(c: Context): Promise<Response> {
  const user = await getUserFromToken(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  try {
    const { page, take, skip } = parsePagination(c, { defaultLimit: 10, maxLimit: 100 });
    const { searchParams } = new URL(c.req.url);
    const analysisType = searchParams.get("type"); // 'individual', 'compatibility', 또는 null (전체)
    const isFavorite = searchParams.get("favorite"); // 'true', 'false', 또는 null (전체)

    // Prisma 클라이언트 생성
    const prisma = createPrismaClient(c.env.DB);

    // 필터 조건 구성
    const where: any = {
      userId: user.id,
    };

    if (analysisType) {
      where.type = analysisType;
    }

    if (isFavorite === "true") {
      where.isFavorite = true;
    } else if (isFavorite === "false") {
      where.isFavorite = false;
    }

    // 분석 결과 조회
    const [analyses, total] = await Promise.all([
      prisma.sajuAnalysis.findMany({
        where,
        select: {
          id: true,
          analysisType: true,
          type: true,
          title: true,
          aiResponse: true,
          chartJson: true,
          modelUsed: true,
          pointsSpent: true,
          isFavorite: true,
          createdAt: true,
          analysisStartedAt: true,
          analysisCompletedAt: true,
          i18n: true,
          timezone: true,
          // optionsJson은 Prisma 타입 생성 상태에 따라 누락될 수 있어 any 캐스팅으로 안전 처리
          ...( { optionsJson: true } as any ),
        },
        orderBy: [{ isFavorite: "desc" }, { createdAt: "desc" }],
        take,
        skip,
      }),
      prisma.sajuAnalysis.count({ where }),
    ]);

    // UTC 변환 적용
    const processedAnalyses = analyses.map((analysis: any) => ({
      id: analysis.id,
      analysisType: analysis.analysisType,
      type: analysis.type,
      title: analysis.title,
      aiResponse: analysis.aiResponse,
      chartJson: (() => { try { return analysis.chartJson ? JSON.parse(analysis.chartJson) : null; } catch { return null; } })(),
      modelUsed: analysis.modelUsed,
      pointsSpent: analysis.pointsSpent,
      isFavorite: analysis.isFavorite,
      createdAt: toUTC(analysis.createdAt),
      analysisStartedAt: toUTC(analysis.analysisStartedAt),
      analysisCompletedAt: toUTC(analysis.analysisCompletedAt),
      i18n: analysis.i18n || undefined,
      timezone: analysis.timezone || undefined,
      // 재질문 여부 식별: 타이틀에 '재질문' 포함
      isFollowUp: typeof analysis.title === 'string' ? analysis.title.includes('재질문') : false,
      // 최초 요청 options 원본(JSON 문자열)과 파싱된 객체 제공
      optionsJson: analysis.optionsJson || null,
      options: (() => { try { return analysis.optionsJson ? JSON.parse(analysis.optionsJson) : null; } catch { return null; } })(),
    }));

    await prisma.$disconnect();

    return c.json({
      analyses: processedAnalyses,
      pagination: buildPaginationMeta(total, page, take),
    }, 200);
  } catch (error) {
    console.error("사주 분석 목록 조회 오류:", error);
    return c.json(
      {
        error: "사주 분석 목록을 조회하는 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * 특정 사주 분석 결과를 조회하는 API
 */
export async function getSajuAnalysisDetail(c: Context): Promise<Response> {
  const user = await getUserFromToken(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  try {
    const analysisId = c.req.param("id");
    if (!analysisId) {
      return c.json({ error: "분석 ID가 필요합니다." }, 400);
    }

    const prisma = createPrismaClient(c.env.DB);

    const analysis = await prisma.sajuAnalysis.findFirst({
      where: {
        id: parseInt(analysisId),
        userId: user.id,
      },
      select: {
        id: true,
        analysisType: true,
        type: true,
        title: true,
        sajuData: true,
        aiResponse: true,
        chartJson: true,
        modelUsed: true,
        pointsSpent: true,
        isFavorite: true,
        i18n: true,
        timezone: true,
        usageMetadata: true,
        analysisStartedAt: true,
        analysisCompletedAt: true,
        // optionsJson은 Prisma 타입 생성 상태에 따라 누락될 수 있어 any 캐스팅으로 안전 처리
        ...( { optionsJson: true } as any ),
      },
    });

    await prisma.$disconnect();

    if (!analysis) {
      return c.json({ error: "분석 결과를 찾을 수 없습니다." }, 404);
    }

    // 사주 데이터를 JSON으로 파싱
    let sajuData = null;
    try {
      if (analysis.sajuData && typeof analysis.sajuData === 'string' && (analysis.sajuData as string).trim() !== '') {
        sajuData = JSON.parse(analysis.sajuData);
      }
    } catch (e) {
      console.error("사주 데이터 파싱 오류:", e);
      console.error("원본 sajuData:", analysis.sajuData);
    }

    return c.json(
      {
        id: analysis.id,
        analysisType: analysis.analysisType,
        type: analysis.type,
        title: analysis.title,
        aiResponse: analysis.aiResponse,
        chartJson: (() => { try { return analysis.chartJson ? JSON.parse(analysis.chartJson) : null; } catch { return null; } })(),
        modelUsed: analysis.modelUsed,
        pointsSpent: analysis.pointsSpent,
        isFavorite: analysis.isFavorite,
        analysisStartedAt: toUTC(analysis.analysisStartedAt),
        analysisCompletedAt: toUTC(analysis.analysisCompletedAt),
        sajuData: sajuData,
        i18n: analysis.i18n,
        timezone: analysis.timezone,
        usageMetadata: toJSON(analysis.usageMetadata),
        isFollowUp: typeof analysis.title === 'string' && (analysis.title as string).includes('재질문'),
        optionsJson: (analysis as any).optionsJson || null,
        options: (() => { try { return (analysis as any).optionsJson ? JSON.parse((analysis as any).optionsJson) : null; } catch { return null; } })(),
      },
      200
    );
  } catch (error) {
    console.error("사주 분석 상세 조회 오류:", error);
    return c.json(
      {
        error: "사주 분석 결과를 조회하는 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * 사주 분석 결과의 즐겨찾기 상태를 토글하는 API
 */
export async function toggleSajuAnalysisFavorite(
  c: Context
): Promise<Response> {
  const user = await getUserFromToken(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  try {
    const analysisId = c.req.param("id");
    if (!analysisId) {
      return c.json({ error: "분석 ID가 필요합니다." }, 400);
    }

    const prisma = createPrismaClient(c.env.DB);

    // 현재 즐겨찾기 상태 확인
    const current = await prisma.sajuAnalysis.findFirst({
      where: {
        id: parseInt(analysisId),
        userId: user.id,
      },
      select: {
        isFavorite: true,
      },
    });

    if (!current) {
      await prisma.$disconnect();
      return c.json({ error: "분석 결과를 찾을 수 없습니다." }, 404);
    }

    const newFavoriteState = !current.isFavorite;

    // 즐겨찾기 상태 업데이트
    await prisma.sajuAnalysis.update({
      where: {
        id: parseInt(analysisId),
      },
      data: {
        isFavorite: newFavoriteState,
        updatedAt: new Date(),
      },
    });

    await prisma.$disconnect();

    return c.json(
      {
        success: true,
        isFavorite: newFavoriteState,
        message: newFavoriteState ? "즐겨찾기에 추가되었습니다." : "즐겨찾기에서 제거되었습니다.",
      },
      200
    );
  } catch (error) {
    console.error("즐겨찾기 토글 오류:", error);
    return c.json(
      {
        error: "즐겨찾기 상태를 변경하는 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * 사주 분석 결과의 제목을 수정하는 API
 */
export async function updateSajuAnalysisTitle(c: Context): Promise<Response> {
  const user = await getUserFromToken(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  try {
    const analysisId = c.req.param("id");
    if (!analysisId) {
      return c.json({ error: "분석 ID가 필요합니다." }, 400);
    }

    const body = await c.req.json();
    const { title } = body;

    if (!title || typeof title !== "string") {
      return c.json({ error: "제목이 필요합니다." }, 400);
    }

    if (title.trim().length === 0) {
      return c.json({ error: "제목은 비어있을 수 없습니다." }, 400);
    }

    if (title.length > 100) {
      return c.json({ error: "제목은 100자를 초과할 수 없습니다." }, 400);
    }

    const prisma = createPrismaClient(c.env.DB);

    // 제목 업데이트
    const result = await prisma.sajuAnalysis.updateMany({
      where: {
        id: parseInt(analysisId),
        userId: user.id,
      },
      data: {
        title: title.trim(),
        updatedAt: new Date(),
      },
    });

    await prisma.$disconnect();

    if (result.count === 0) {
      return c.json({ error: "분석 결과를 찾을 수 없습니다." }, 404);
    }

    return c.json(
      {
        success: true,
        title: title.trim(),
        message: "제목이 성공적으로 수정되었습니다.",
      },
      200
    );
  } catch (error) {
    console.error("제목 수정 오류:", error);
    return c.json(
      {
        error: "제목을 수정하는 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * 사주 분석 결과를 다중 삭제하는 API
 */
export async function deleteSajuAnalysis(c: Context): Promise<Response> {
  const user = await getUserFromToken(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  try {
    const body = await c.req.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return c.json({ error: "삭제할 분석 결과 ID 배열이 필요합니다." }, 400);
    }

    if (!ids.every(id => typeof id === 'number' && Number.isInteger(id) && id > 0)) {
      return c.json({ error: "잘못된 ID 형식입니다." }, 400);
    }

    const prisma = createPrismaClient(c.env.DB);

    // 사용자가 소유한 분석 결과만 조회
    const userAnalyses = await prisma.sajuAnalysis.findMany({
      where: {
        id: { in: ids },
        userId: user.id
      },
      select: { id: true }
    });

    const userAnalysisIds = userAnalyses.map(analysis => analysis.id);
    const failedIds = ids.filter(id => !userAnalysisIds.includes(id));

    if (userAnalysisIds.length === 0) {
      await prisma.$disconnect();
      return c.json({ 
        error: "삭제할 수 있는 분석 결과가 없습니다.",
        failedIds 
      }, 400);
    }

    // 분석 결과 삭제
    const result = await prisma.sajuAnalysis.deleteMany({
      where: {
        id: { in: userAnalysisIds },
        userId: user.id,
      },
    });

    await prisma.$disconnect();

    return c.json({
      success: true,
      message: "분석 결과가 성공적으로 삭제되었습니다.",
      deletedCount: result.count,
      failedIds: failedIds.length > 0 ? failedIds : undefined
    }, 200);
  } catch (error) {
    console.error("분석 결과 다중 삭제 오류:", error);
    return c.json(
      {
        error: "분석 결과를 삭제하는 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}
