import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";
import { jsonResponse, getUserFromToken } from "../../common/utils";
import { paginate } from "../../common/paginationUtils";
import { D1Database } from "@cloudflare/workers-types";

const createPrismaClient = (db: D1Database) => {
  const adapter = new PrismaD1(db);
  return new PrismaClient({
    adapter,
    log: ["error"], // 에러만 로깅
  });
};



// 관리자 권한 체크
const isAdmin = async (request: Request, env: any): Promise<boolean> => {
  const user = await getUserFromToken(request);
  if (!user) return false;

  // 토큰에서 role 확인하거나, DB에서 재확인
  if (user.role === "admin") return true;

  // DB에서 재확인 (토큰이 오래된 경우 대비)
  try {
    const prisma = createPrismaClient(env.DB);
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true },
    });
    await prisma.$disconnect();
    return dbUser?.role === "admin";
  } catch {
    return false;
  }
};

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
export async function getUsers(request: Request, env: any): Promise<Response> {
  try {
    // 관리자 권한 체크
    if (!(await isAdmin(request, env))) {
      return jsonResponse({ error: "관리자 권한이 필요합니다." }, 403);
    }

    const prisma = createPrismaClient(env.DB);

    // URL 파라미터에서 페이지네이션 정보 추출
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const search = url.searchParams.get("search") || "";

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

    return jsonResponse({
      success: true,
      users: users.map((user: any) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        role: user.role,
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
    return jsonResponse(
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
  request: Request,
  env: any,
  params?: Record<string, string>
): Promise<Response> {
  try {
    // 관리자 권한 체크
    if (!(await isAdmin(request, env))) {
      return jsonResponse({ error: "관리자 권한이 필요합니다." }, 403);
    }

    const userId = Number(params?.userId);
    if (!userId) {
      return jsonResponse({ error: "잘못된 사용자 ID입니다." }, 400);
    }

    const prisma = createPrismaClient(env.DB);

    // 사용자 존재 여부 확인
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        picture: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      await prisma.$disconnect();
      return jsonResponse({ error: "사용자를 찾을 수 없습니다." }, 404);
    }

    // 해당 사용자의 사주 프로필 조회
    const profiles = await prisma.sajuProfile.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });

    await prisma.$disconnect();

    return jsonResponse({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        role: user.role,
        createdAt: user.createdAt,
      },
      profiles: profiles.map(toKoreanFields),
      count: profiles.length,
    });
  } catch (error) {
    return jsonResponse(
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
  request: Request,
  env: any
): Promise<Response> {
  try {
    // 관리자 권한 체크
    if (!(await isAdmin(request, env))) {
      return jsonResponse({ error: "관리자 권한이 필요합니다." }, 403);
    }

    const prisma = createPrismaClient(env.DB);

    // 전체 통계 조회
    const [totalUsers, totalProfiles, adminUsers] = await Promise.all([
      prisma.user.count(),
      prisma.sajuProfile.count(),
      prisma.user.count({ where: { role: "admin" } }),
    ]);

    await prisma.$disconnect();

    return jsonResponse({
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
    return jsonResponse(
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
  request: Request,
  env: any
): Promise<Response> {
  try {
    if (!(await isAdmin(request, env))) {
      return jsonResponse({ error: "관리자 권한이 필요합니다." }, 403);
    }

    const prisma = createPrismaClient(env.DB);

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const search = url.searchParams.get("search") || "";
    const action = url.searchParams.get("action") || ""; // 'login' or 'logout'

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

    return jsonResponse({
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
    return jsonResponse(
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
  request: Request,
  env: any
): Promise<Response> {
  if (!(await isAdmin(request, env))) {
    return jsonResponse({ error: "관리자 권한이 필요합니다." }, 403);
  }

  const prisma = createPrismaClient(env.DB);
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "20");
  const sort = url.searchParams.get("sort") || "total_tokens";
  const allowedSortColumns = [
    "model",
    "total_tokens",
    "total_calls",
    "unique_users",
  ];
  const sortColumn = allowedSortColumns.includes(sort) ? sort : "total_tokens";
  const order =
    url.searchParams.get("order")?.toLowerCase() === "asc" ? "ASC" : "DESC";
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");
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

    return jsonResponse({
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
    return jsonResponse(
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
  request: Request,
  env: any
): Promise<Response> {
  if (!(await isAdmin(request, env))) {
    return jsonResponse({ error: "관리자 권한이 필요합니다." }, 403);
  }

  const prisma = createPrismaClient(env.DB);
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "20");
  const sort = url.searchParams.get("sort") || "total_tokens";
  const allowedSortColumns = ["total_tokens", "total_calls"];
  const sortColumn = allowedSortColumns.includes(sort) ? sort : "total_tokens";
  const order =
    url.searchParams.get("order")?.toLowerCase() === "asc" ? "ASC" : "DESC";
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");
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
      return jsonResponse({
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
      return jsonResponse({
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

    return jsonResponse({
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
    return jsonResponse(
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
  request: Request,
  env: any,
  params?: Record<string, string>
): Promise<Response> {
  if (!(await isAdmin(request, env))) {
    return jsonResponse({ error: "관리자 권한이 필요합니다." }, 403);
  }

  const userId = Number(params?.userId);
  if (!userId) {
    return jsonResponse({ error: "잘못된 사용자 ID입니다." }, 400);
  }

  const db: D1Database = env.DB;
  const url = new URL(request.url);
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");

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

    return await paginate(request, db, {
      tableName: "ai_usage_logs",
      defaultLimit: 20,
      baseWhereClauses,
    });
  } catch (error) {
    console.error("Error fetching AI usage logs for user:", error);
    return jsonResponse(
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
  request: Request,
  env: any,
  params?: Record<string, string>
): Promise<Response> {
  if (!(await isAdmin(request, env))) {
    return jsonResponse({ error: "관리자 권한이 필요합니다." }, 403);
  }

  const model = params?.["model+"];
  if (!model) {
    console.error("Model name is required", params);
    return jsonResponse({ error: "모델 이름이 필요합니다." }, 400);
  }

  const prisma = createPrismaClient(env.DB);
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "20");
  const sort = url.searchParams.get("sort") || "total_tokens";
  // Whitelist sortable columns to prevent SQL injection
  const allowedSortColumns = [
    "total_tokens",
    "total_prompt_tokens",
    "total_completion_tokens",
    "total_calls",
  ];
  const sortColumn = allowedSortColumns.includes(sort) ? sort : "total_tokens";
  const order =
    url.searchParams.get("order")?.toLowerCase() === "asc" ? "ASC" : "DESC";
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");
  const offset = (page - 1) * limit;

  try {
    const whereClauses: string[] = ["l.model = ?"];
    const bindings: any[] = [decodeURIComponent(model)];

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

    return jsonResponse({
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
    return jsonResponse(
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
