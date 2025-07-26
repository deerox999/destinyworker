import { Context } from "hono";
import { paginate } from "../../common/paginationUtils";
import { createPrismaClient, isAdmin } from "../../common/prismaUtils";
import { addPoints, deductPoints, getUserPoints, getPointTransactions } from "../../common/paymentUtils";

// 영어 -> 한글 필드 변환 (사주 프로필용)
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

// 가입한 유저 목록 조회
export async function getUsers(c: Context): Promise<any> {
  try {
    // 관리자 권한 체크
    if (!(await isAdmin(c))) {
      return c.json({ error: "관리자 권한이 필요합니다." }, 403);
    }

    const prisma = createPrismaClient(c.env.DB);

    // URL 파라미터에서 페이지네이션 정보 추출
    const page = parseInt(c.req.query("page") || "1");
    const limit = parseInt(c.req.query("limit") || "20");
    const search = c.req.query("search") || "";

    const skip = (page - 1) * limit;

    // 검색 조건 구성
    const whereCondition = search
      ? {
          OR: [{ name: { contains: search } }, { email: { contains: search } }],
        }
      : {};

    // 사용자 목록 조회
    const [users, totalCount] = await Promise.all([
      prisma.user.findMany({
        where: whereCondition,
        select: {
          id: true,
          email: true,
          name: true,
          picture: true,
          role: true,
          point: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              sajuProfiles: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.user.count({ where: whereCondition }),
    ]);

    await prisma.$disconnect();

    return c.json({
      success: true,
      users: users.map((user: any) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        role: user.role,
        point: user.point,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        profileCount: user._count.sajuProfiles,
      })),
      pagination: {
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        pageSize: limit,
      },
    });
  } catch (error) {
    return c.json(
      {
        error: "사용자 목록 조회 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

// 특정 유저의 프로필 조회
export async function getUserProfiles(
  c: Context
): Promise<Response> {
  try {
    // 관리자 권한 체크
    if (!(await isAdmin(c))) {
      return c.json({ error: "관리자 권한이 필요합니다." }, 403);
    }

    const userId = Number(c.req.param("userId"));
    if (!userId) {
      return c.json({ error: "잘못된 사용자 ID입니다." }, 400);
    }

    const prisma = createPrismaClient(c.env.DB);

    // 사용자 존재 여부 확인 (포인트 포함)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        picture: true,
        role: true,
        point: true,
        createdAt: true,
      },
    });

    if (!user) {
      await prisma.$disconnect();
      return c.json({ error: "사용자를 찾을 수 없습니다." }, 404);
    }

    // 해당 사용자의 사주 프로필 조회
    const profiles = await prisma.sajuProfile.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });

    await prisma.$disconnect();

    return c.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        role: user.role,
        point: user.point,
        createdAt: user.createdAt,
      },
      profiles: profiles.map(toKoreanFields),
      count: profiles.length,
    });
  } catch (error) {
    return c.json(
      {
        error: "프로필 조회 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

// 전체 통계 정보 조회
export async function getAdminStats(
  c: Context
): Promise<Response> {
  try {
    // 관리자 권한 체크
    if (!(await isAdmin(c))) {
      return c.json({ error: "관리자 권한이 필요합니다." }, 403);
    }

    const prisma = createPrismaClient(c.env.DB);

    // 전체 통계 조회
    const [totalUsers, totalProfiles, adminUsers] = await Promise.all([
      prisma.user.count(),
      prisma.sajuProfile.count(),
      prisma.user.count({ where: { role: "admin" } }),
    ]);

    await prisma.$disconnect();

    return c.json({
      success: true,
      stats: {
        totalUsers,
        totalProfiles,
        adminUsers,
        averageProfilesPerUser:
          totalUsers > 0 ? (totalProfiles / totalUsers).toFixed(2) : 0,
      },
    });
  } catch (error) {
    return c.json(
      {
        error: "통계 조회 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

// 로그인/로그아웃 기록 조회
export async function getLoginHistory(
  c: Context
): Promise<Response> {
  try {
    if (!(await isAdmin(c))) {
      return c.json({ error: "관리자 권한이 필요합니다." }, 403);
    }

    const prisma = createPrismaClient(c.env.DB);

    const page = parseInt(c.req.query("page") || "1");
    const limit = parseInt(c.req.query("limit") || "20");
    const search = c.req.query("search") || "";
    const action = c.req.query("action") || ""; // 'login' or 'logout'

    const skip = (page - 1) * limit;

    const whereCondition: any = {};
    if (search) {
      whereCondition.user = {
        OR: [{ name: { contains: search } }, { email: { contains: search } }],
      };
    }
    if (action === "login" || action === "logout") {
      whereCondition.action = action;
    }

    const [history, totalCount] = await Promise.all([
      prisma.loginHistory.findMany({
        where: whereCondition,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              picture: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.loginHistory.count({ where: whereCondition }),
    ]);

    await prisma.$disconnect();

    return c.json({
      success: true,
      history: history.map((h: any) => ({
        id: h.id,
        action: h.action,
        createdAt: h.createdAt,
        user: h.user,
      })),
      pagination: {
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        pageSize: limit,
      },
    });
  } catch (error) {
    return c.json(
      {
        error: "로그인 기록 조회 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * 모델별 AI 사용량 통계를 조회합니다.
 */
export async function getAiUsageStatsByModel(
  c: Context
): Promise<any> {
  if (!(await isAdmin(c))) {
    return c.json({ error: "관리자 권한이 필요합니다." }, 403);
  }

  const prisma = createPrismaClient(c.env.DB);
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const sort = c.req.query("sort") || "total_tokens";
  const allowedSortColumns = [
    "model",
    "total_tokens",
    "total_calls",
    "unique_users",
  ];
  const sortColumn = allowedSortColumns.includes(sort) ? sort : "total_tokens";
  const order =
    c.req.query("order")?.toLowerCase() === "asc" ? "ASC" : "DESC";
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  const offset = (page - 1) * limit;

  try {
    const whereClauses: string[] = [];
    const bindings: any[] = [];
    if (startDate) {
      whereClauses.push("created_at >= ?");
      bindings.push(new Date(startDate).toISOString());
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      whereClauses.push("created_at <= ?");
      bindings.push(end.toISOString());
    }
    const whereClause =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const dataQuery = `
      SELECT
        model,
        SUM(total_tokens) as total_tokens,
        COUNT(id) as total_calls,
        COUNT(DISTINCT user_id) as unique_users
      FROM ai_usage_logs
      ${whereClause}
      GROUP BY model
      ORDER BY ${sortColumn} ${order}
      LIMIT ? OFFSET ?;
    `;
    const dataBindings = [...bindings, limit, offset];

    const countQuery = `
      SELECT COUNT(*) as totalItems FROM (
        SELECT 1 FROM ai_usage_logs ${whereClause} GROUP BY model
      )
    `;

    const [stats, countResult] = (await Promise.all([
      prisma.$queryRawUnsafe(dataQuery, ...dataBindings),
      prisma.$queryRawUnsafe(countQuery, ...bindings),
    ])) as [any[], any[]];

    const totalItems =
      countResult.length > 0 ? Number(countResult[0].totalItems) : 0;

    const formattedStats = stats.map((row: any) => ({
      model: row.model,
      total_tokens: Number(row.total_tokens),
      total_calls: Number(row.total_calls),
      unique_users: Number(row.unique_users),
    }));

    return c.json({
      success: true,
      stats: formattedStats,
      pagination: {
        totalItems: totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
        pageSize: limit,
      },
    });
  } catch (error) {
    console.error("Error fetching AI usage stats by model:", error);
    return c.json(
      {
        error: "모델별 AI 사용량 통계 조회 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * 사용자별 AI 사용량 통계를 조회합니다.
 */
export async function getAiUsageStatsByUser(
  c: Context
): Promise<any> {
  if (!(await isAdmin(c))) {
    return c.json({ error: "관리자 권한이 필요합니다." }, 403);
  }

  const prisma = createPrismaClient(c.env.DB);
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const sort = c.req.query("sort") || "total_tokens";
  const allowedSortColumns = ["total_tokens", "total_calls"];
  const sortColumn = allowedSortColumns.includes(sort) ? sort : "total_tokens";
  const order =
    c.req.query("order")?.toLowerCase() === "asc" ? "ASC" : "DESC";
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  const offset = (page - 1) * limit;

  try {
    const whereClauses: string[] = [];
    const bindings: any[] = [];
    if (startDate) {
      whereClauses.push("l.created_at >= ?");
      bindings.push(new Date(startDate).toISOString());
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      whereClauses.push("l.created_at <= ?");
      bindings.push(end.toISOString());
    }
    const whereClause =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    // 1. Get total count of users
    const countQuery = `SELECT COUNT(DISTINCT user_id) as totalItems FROM ai_usage_logs as l ${whereClause}`;
    const countResult = (await prisma.$queryRawUnsafe(
      countQuery,
      ...bindings
    )) as any[];
    const totalItems =
      countResult.length > 0 ? Number(countResult[0].totalItems) : 0;

    if (totalItems === 0) {
      return c.json({
        success: true,
        stats: [],
        pagination: {
          totalItems: 0,
          totalPages: 0,
          currentPage: page,
          pageSize: limit,
        },
      });
    }

    // 2. Get a paginated list of user IDs, sorted by their total usage
    const userIdsQuery = `
      SELECT
        user_id,
        SUM(total_tokens) as total_tokens,
        COUNT(id) as total_calls
      FROM ai_usage_logs as l
      ${whereClause}
      GROUP BY user_id
      ORDER BY ${sortColumn} ${order}
      LIMIT ? OFFSET ?
    `;
    const paginatedUserStats = (await prisma.$queryRawUnsafe(
      userIdsQuery,
      ...bindings,
      limit,
      offset
    )) as any[];
    const userIds = paginatedUserStats.map((u) => u.user_id);

    if (userIds.length === 0) {
      return c.json({
        success: true,
        stats: [],
        pagination: {
          totalItems,
          totalPages: Math.ceil(totalItems / limit),
          currentPage: page,
          pageSize: limit,
        },
      });
    }

    // 3. Get model-specific usage for those users
    const userIdsPlaceholder = userIds.map(() => "?").join(",");
    const detailedWhereClauses = [...whereClauses];
    detailedWhereClauses.push(`l.user_id IN (${userIdsPlaceholder})`);
    const detailedBindings = [...bindings, ...userIds];
    const detailedWhereClause = `WHERE ${detailedWhereClauses.join(" AND ")}`;

    const detailedUsageQuery = `
      SELECT
        u.id as user_id,
        u.name as user_name,
        u.email as user_email,
        l.model,
        SUM(l.total_tokens) as total_tokens,
        COUNT(l.id) as total_calls
      FROM ai_usage_logs as l
      JOIN users as u ON l.user_id = u.id
      ${detailedWhereClause}
      GROUP BY u.id, u.name, u.email, l.model
      ORDER BY u.id, total_tokens DESC;
    `;
    const detailedUsage = (await prisma.$queryRawUnsafe(
      detailedUsageQuery,
      ...detailedBindings
    )) as any[];

    // 4. Reconstruct the response
    const userStatsMap = new Map();
    for (const row of detailedUsage) {
      const userId = row.user_id;
      if (!userStatsMap.has(userId)) {
        userStatsMap.set(userId, {
          user: { id: userId, name: row.user_name, email: row.user_email },
          totalUsage: { tokens: 0, calls: 0 }, // will be populated next
          modelUsage: [],
        });
      }
      userStatsMap.get(userId).modelUsage.push({
        model: row.model,
        total_tokens: Number(row.total_tokens),
        total_calls: Number(row.total_calls),
      });
    }

    for (const u of paginatedUserStats) {
      if (userStatsMap.has(u.user_id)) {
        const stats = userStatsMap.get(u.user_id);
        stats.totalUsage = {
          tokens: Number(u.total_tokens),
          calls: Number(u.total_calls),
        };
      }
    }

    const finalStats = userIds.map((id) => userStatsMap.get(id));

    return c.json({
      success: true,
      stats: finalStats,
      pagination: {
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
        pageSize: limit,
      },
    });
  } catch (error) {
    console.error("Error fetching AI usage stats by user:", error);
      return c.json(
      {
        error: "사용자별 AI 사용량 통계 조회 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * 특정 사용자의 AI 사용 기록을 페이지네이션하여 조회합니다.
 */
export async function getAiUsageLogsForUser(
  c: Context
): Promise<Response> {
  if (!(await isAdmin(c))) {
    return c.json({ error: "관리자 권한이 필요합니다." }, 403);
  }

  const userId = Number(c.req.param("userId"));
  if (!userId) {
    return c.json({ error: "잘못된 사용자 ID입니다." }, 400);
  }

  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");

  try {
    const baseWhereClauses: { clause: string; binding: any }[] = [
      { clause: "user_id = ?", binding: userId },
    ];
    if (startDate) {
      baseWhereClauses.push({
        clause: "created_at >= ?",
        binding: new Date(startDate).toISOString(),
      });
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      baseWhereClauses.push({
        clause: "created_at <= ?",
        binding: end.toISOString(),
      });
    }

      return await paginate(c, c.env.DB, {
      tableName: "ai_usage_logs",
      defaultLimit: 20,
      baseWhereClauses,
    });
  } catch (error) {
    console.error("Error fetching AI usage logs for user:", error);
    return c.json(
      {
        error: "사용자 AI 사용 기록 조회 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * 특정 AI 모델을 사용한 사용자 목록과 사용량 통계를 페이지네이션하여 조회합니다.
 */
export async function getAiUsageStatsForModel(
  c: Context
): Promise<Response> {
  if (!(await isAdmin(c))) {
    return c.json({ error: "관리자 권한이 필요합니다." }, 403);
  }

  const model = c.req.query("model");
  if (!model) {
    console.error("Model name is required", c.req.query());
    return c.json({ error: "모델 이름이 필요합니다." }, 400);
  }

  const prisma = createPrismaClient(c.env.DB);
  const page = parseInt(c.req.query("page") || "1");
  const limit = parseInt(c.req.query("limit") || "20");
  const sort = c.req.query("sort") || "total_tokens";
  // Whitelist sortable columns to prevent SQL injection
  const allowedSortColumns = [
    "total_tokens",
    "total_prompt_tokens",
    "total_completion_tokens",
    "total_calls",
  ];
  const sortColumn = allowedSortColumns.includes(sort) ? sort : "total_tokens";
  const order =
    c.req.query("order")?.toLowerCase() === "asc" ? "ASC" : "DESC";
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  const offset = (page - 1) * limit;

  try {
    const whereClauses: string[] = ["l.model = ?"];
    const bindings: any[] = [model];

    if (startDate) {
      whereClauses.push("l.created_at >= ?");
      bindings.push(new Date(startDate).toISOString());
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      whereClauses.push("l.created_at <= ?");
      bindings.push(end.toISOString());
    }
    const whereClause = `WHERE ${whereClauses.join(" AND ")}`;

    const dataQuery = `
      SELECT
        u.id as user_id,
        u.name as user_name,
        u.email as user_email,
        SUM(l.prompt_tokens) as total_prompt_tokens,
        SUM(l.completion_tokens) as total_completion_tokens,
        SUM(l.total_tokens) as total_tokens,
        COUNT(l.id) as total_calls
      FROM ai_usage_logs as l
      JOIN users as u ON l.user_id = u.id
      ${whereClause}
      GROUP BY u.id, u.name, u.email
      ORDER BY ${sortColumn} ${order}
      LIMIT ? OFFSET ?
    `;

    const countQuery = `
      SELECT COUNT(*) as totalItems FROM (
        SELECT 1 FROM ai_usage_logs as l ${whereClause} GROUP BY l.user_id
      )
    `;

    const [data, countResult] = (await Promise.all([
      prisma.$queryRawUnsafe(dataQuery, ...bindings, limit, offset),
      prisma.$queryRawUnsafe(countQuery, ...bindings),
    ])) as [any[], any[]];

    const totalItems =
      countResult.length > 0 ? Number(countResult[0].totalItems) : 0;

    const formattedData = data.map((row: any) => ({
      user_id: row.user_id,
      user_name: row.user_name,
      user_email: row.user_email,
      total_prompt_tokens: Number(row.total_prompt_tokens),
      total_completion_tokens: Number(row.total_completion_tokens),
      total_tokens: Number(row.total_tokens),
      total_calls: Number(row.total_calls),
    }));

    return c.json({
      success: true,
      data: formattedData,
      pagination: {
        totalItems: totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
        pageSize: limit,
      },
    });
  } catch (error) {
    console.error("Error fetching AI usage stats for model:", error);
    return c.json(
      {
        error: "모델별 사용자 통계 조회 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * 관리자가 사용자에게 포인트를 추가합니다.
 */
export async function addUserPoints(
  c: Context
): Promise<Response> {
  try {
    // 관리자 권한 체크
    if (!(await isAdmin(c))) {
      return c.json({ error: "관리자 권한이 필요합니다." }, 403);
    }

    const userId = Number(c.req.param("userId"));
    if (!userId) {
      return c.json({ error: "잘못된 사용자 ID입니다." }, 400);
    }

    const body = await c.req.json();
    const { amount, description } = body;

    if (!amount || amount <= 0) {
      return c.json({ error: "유효한 포인트 금액을 입력해주세요." }, 400);
    }

    if (!description) {
      return c.json({ error: "포인트 추가 사유를 입력해주세요." }, 400);
    }

    const result = await addPoints(
      c.env.DB,
      userId,
      amount,
      `관리자 포인트 추가: ${description}`,
      `admin_add_${Date.now()}`
    );

    if (result.success) {
      return c.json({
        success: true,
        message: result.message,
        newPoints: result.newPoints,
      });
    } else {
      return c.json({ error: result.message }, 400);
    }
  } catch (error) {
    return c.json(
      {
        error: "포인트 추가 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * 관리자가 사용자의 포인트를 차감합니다.
 */
export async function deductUserPoints(
  c: Context
): Promise<Response> {
  try {
    // 관리자 권한 체크
    if (!(await isAdmin(c))) {
      return c.json({ error: "관리자 권한이 필요합니다." }, 403);
    }

    const userId = Number(c.req.param("userId"));
    if (!userId) {
      return c.json({ error: "잘못된 사용자 ID입니다." }, 400);
    }

    const body = await c.req.json();
    const { amount, description } = body;

    if (!amount || amount <= 0) {
      return c.json({ error: "유효한 포인트 금액을 입력해주세요." }, 400);
    }

    if (!description) {
      return c.json({ error: "포인트 차감 사유를 입력해주세요." }, 400);
    }

    const result = await deductPoints(
      c.env.DB,
      userId,
      amount,
      `관리자 포인트 차감: ${description}`,
      `admin_deduct_${Date.now()}`
    );

    if (result.success) {
      return c.json({
        success: true,
        message: result.message,
        remainingPoints: result.remainingPoints,
      });
    } else {
      return c.json({ error: result.message }, 400);
    }
  } catch (error) {
    return c.json(
      {
        error: "포인트 차감 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * 관리자가 사용자의 현재 포인트를 조회합니다.
 */
export async function getUserCurrentPoints(
  c: Context
): Promise<Response> {
  try {
    // 관리자 권한 체크
    if (!(await isAdmin(c))) {
      return c.json({ error: "관리자 권한이 필요합니다." }, 403);
    }

    const userId = Number(c.req.param("userId"));
    if (!userId) {
      return c.json({ error: "잘못된 사용자 ID입니다." }, 400);
    }

    const currentPoints = await getUserPoints(c.env.DB, userId);

    return c.json({
      success: true,
      userId,
      currentPoints,
    });
  } catch (error) {
    return c.json(
      {
        error: "포인트 조회 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * 관리자가 사용자의 포인트 거래 내역을 조회합니다.
 */
export async function getUserPointTransactions(
  c: Context
): Promise<Response> {
  try {
    // 관리자 권한 체크
    if (!(await isAdmin(c))) {
      return c.json({ error: "관리자 권한이 필요합니다." }, 403);
    }

    const userId = Number(c.req.param("userId"));
    if (!userId) {
      return c.json({ error: "잘못된 사용자 ID입니다." }, 400);
    }

    const page = parseInt(c.req.query("page") || "1");
    const limit = parseInt(c.req.query("limit") || "20");
    const offset = (page - 1) * limit;

    const transactions = await getPointTransactions(c.env.DB, userId, limit, offset);

    return c.json({
      success: true,
      userId,
      transactions,
      pagination: {
        currentPage: page,
        pageSize: limit,
      },
    });
  } catch (error) {
    return c.json(
      {
        error: "포인트 거래 내역 조회 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}
