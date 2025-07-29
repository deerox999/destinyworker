import { Context } from "hono";
import { getUserFromToken } from "../../common/utils";

/**
 * 사용자의 사주 분석 결과 목록을 조회하는 API
 */
export async function getSajuAnalysisList(c: Context): Promise<Response> {
  const user = await getUserFromToken(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  try {
    const { searchParams } = new URL(c.req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const analysisType = searchParams.get("type"); // 'individual', 'compatibility', 또는 null (전체)
    const isFavorite = searchParams.get("favorite"); // 'true', 'false', 또는 null (전체)

    const offset = (page - 1) * limit;

    // 기본 쿼리
    let query = `
      SELECT 
        id, analysis_type, type, title, 
        ai_response, points_spent, is_favorite, 
        created_at, analysis_started_at, analysis_completed_at
      FROM saju_analyses
      WHERE user_id = ?
    `;
    const params: any[] = [user.id];

    // 필터 조건 추가 (type 필드 사용)
    if (analysisType) {
      query += ` AND type = ?`;
      params.push(analysisType);
    }

    if (isFavorite === "true") {
      query += ` AND is_favorite = 1`;
    } else if (isFavorite === "false") {
      query += ` AND is_favorite = 0`;
    }

    // 정렬 및 페이징 (즐겨찾기 우선, 그 다음 최신순)
    query += ` ORDER BY is_favorite DESC, created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    // 총 개수 조회
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM saju_analyses 
      WHERE user_id = ?
    `;
    const countParams: any[] = [user.id];

    if (analysisType) {
      countQuery += ` AND type = ?`;
      countParams.push(analysisType);
    }

    if (isFavorite === "true") {
      countQuery += ` AND is_favorite = 1`;
    } else if (isFavorite === "false") {
      countQuery += ` AND is_favorite = 0`;
    }

    const [analyses, totalCount] = await Promise.all([
      c.env.DB.prepare(query)
        .bind(...params)
        .all(),
      c.env.DB.prepare(countQuery)
        .bind(...countParams)
        .first(),
    ]);

    const total = totalCount?.total || 0;
    const totalPages = Math.ceil(total / limit);

    // SQLite boolean 값을 JavaScript boolean으로 변환
    const processedAnalyses = (analyses.results || []).map((analysis: any) => ({
      ...analysis,
      is_favorite: Boolean(analysis.is_favorite),
    }));

    return c.json(
      {
        analyses: processedAnalyses,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      200
    );
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

    const analysis = await c.env.DB.prepare(
      `
      SELECT 
        id, analysis_type, type, title, sajuData, ai_response, points_spent, 
        is_favorite, i18n, timezone, analysis_started_at, analysis_completed_at
      FROM saju_analyses 
      WHERE id = ? AND user_id = ?
    `
    )
      .bind(analysisId, user.id)
      .first();

    if (!analysis) {
      return c.json({ error: "분석 결과를 찾을 수 없습니다." }, 404);
    }

    // 사주 데이터를 JSON으로 파싱
    let sajuData = null;
    try {
      sajuData = JSON.parse(analysis.sajuData);
    } catch (e) {
      console.error("사주 데이터 파싱 오류:", e);
    }

    return c.json(
      {
        id: analysis.id,
        analysis_type: analysis.analysis_type,
        type: analysis.type,
        title: analysis.title,
        user_prompt: analysis.user_prompt,
        system_prompt: analysis.system_prompt,
        ai_response: analysis.ai_response,
        model_used: analysis.model_used,
        points_spent: analysis.points_spent,
        is_favorite: Boolean(analysis.is_favorite),
        analysis_started_at: analysis.analysis_started_at,
        analysis_completed_at: analysis.analysis_completed_at,
        saju_data: sajuData,
        i18n: analysis.i18n,
        timezone: analysis.timezone,
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

    // 현재 즐겨찾기 상태 확인
    const current = await c.env.DB.prepare(
      `
      SELECT is_favorite FROM saju_analyses 
      WHERE id = ? AND user_id = ?
    `
    )
      .bind(analysisId, user.id)
      .first();

    if (!current) {
      return c.json({ error: "분석 결과를 찾을 수 없습니다." }, 404);
    }

    // SQLite boolean 값을 JavaScript boolean으로 변환
    const currentFavoriteState = Boolean(current.is_favorite);

    // 즐겨찾기 상태 토글
    const newFavoriteState = !currentFavoriteState;

    await c.env.DB.prepare(
      `
      UPDATE saju_analyses 
      SET is_favorite = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `
    )
      .bind(newFavoriteState ? 1 : 0, analysisId, user.id)
      .run();

    return c.json(
      {
        success: true,
        is_favorite: newFavoriteState,
        message: newFavoriteState
          ? "즐겨찾기에 추가되었습니다."
          : "즐겨찾기에서 제거되었습니다.",
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

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return c.json({ error: "유효한 제목이 필요합니다." }, 400);
    }

    if (title.length > 100) {
      return c.json({ error: "제목은 100자를 초과할 수 없습니다." }, 400);
    }

    const result = await c.env.DB.prepare(
      `
      UPDATE saju_analyses 
      SET title = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `
    )
      .bind(title.trim(), analysisId, user.id)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ error: "분석 결과를 찾을 수 없습니다." }, 404);
    }

    return c.json(
      {
        success: true,
        title: title.trim(),
        message: "제목이 수정되었습니다.",
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
 * 사주 분석 결과를 삭제하는 API
 */
export async function deleteSajuAnalysis(c: Context): Promise<Response> {
  const user = await getUserFromToken(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  try {
    const analysisId = c.req.param("id");
    if (!analysisId) {
      return c.json({ error: "분석 ID가 필요합니다." }, 400);
    }

    const result = await c.env.DB.prepare(
      `
      DELETE FROM saju_analyses 
      WHERE id = ? AND user_id = ?
    `
    )
      .bind(analysisId, user.id)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ error: "분석 결과를 찾을 수 없습니다." }, 404);
    }

    return c.json(
      {
        success: true,
        message: "분석 결과가 삭제되었습니다.",
      },
      200
    );
  } catch (error) {
    console.error("분석 결과 삭제 오류:", error);
    return c.json(
      {
        error: "분석 결과를 삭제하는 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}
