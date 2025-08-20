import { Context } from "hono";
import { buildPaginationMeta, paginate, parsePagination } from "../../common/paginationUtils";
import { addPoints, deductPoints, getPointTransactions, getUserPoints } from "../../common/paymentUtils";
import { createPrismaClient, isAdmin } from "../../common/prismaUtils";
import { toUTC, toJSON } from "../../common/utils";

// 가입한 유저 목록 조회
export async function getUsers(c: Context): Promise<any> {
  try {
    // 관리자 권한 체크
    if (!(await isAdmin(c))) {
      return c.json({ error: "관리자 권한이 필요합니다." }, 403);
    }

    const prisma = createPrismaClient(c.env.DB);

    // URL 파라미터에서 페이지네이션 정보 추출
    const { page, take, skip } = parsePagination(c, { defaultLimit: 20, maxLimit: 100 });
    const search = c.req.query("search") || "";

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
        take,
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
        createdAt: toUTC(user.createdAt),
        updatedAt: toUTC(user.updatedAt),
        profileCount: user._count.sajuProfiles,
      })),
      pagination: buildPaginationMeta(totalCount, page, take),
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

/**
 * [Admin] 사용자 정보 수정 (role 포함, 범용 업데이트)
 * - 관리자만 접근 가능
 * - 허용된 필드만 업데이트
 */
export async function updateUserByAdmin(c: Context): Promise<Response> {
  try {
    if (!(await isAdmin(c))) {
      return c.json({ error: "관리자 권한이 필요합니다." }, 403);
    }

    const userId = Number(c.req.param("userId"));
    if (!userId) {
      return c.json({ error: "잘못된 사용자 ID입니다." }, 400);
    }

    const body = await c.req.json().catch(() => ({}));
    if (!body || typeof body !== "object") {
      return c.json({ error: "요청 본문이 필요합니다." }, 400);
    }

    // 허용 필드 화이트리스트
    const allowedRoles = new Set(["user", "admin"]);
    const updatableKeys: (keyof any)[] = [
      "role",
      "name",
      "userName",
      "picture",
      // 개인정보 동의 관련
      "privacyConsent",
      "privacyConsentVersion",
      "privacyConsentAt",
      "reportStorageConsent",
      "reportStorageConsentVersion",
      "reportStorageConsentAt",
      "lastConsentAt",
      "consentStatus",
    ];

    // point 변경은 별도 API로만 허용
    if (Object.prototype.hasOwnProperty.call(body, "point")) {
      return c.json({ error: "포인트는 전용 API로만 변경할 수 있습니다." }, 400);
    }

    const updateData: any = {};

    for (const key of updatableKeys) {
      if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
      const value = body[key as string];

      if (key === "role") {
        if (value == null || !allowedRoles.has(String(value))) {
          return c.json({ error: "role은 'user' 또는 'admin'만 허용됩니다." }, 400);
        }
        updateData.role = String(value);
        continue;
      }

      if (
        key === "privacyConsentAt" ||
        key === "reportStorageConsentAt" ||
        key === "lastConsentAt"
      ) {
        // null 허용, 문자열이면 Date로 변환
        if (value === null) {
          updateData[key] = null;
        } else if (typeof value === "string" || value instanceof Date) {
          const dateVal = new Date(value as any);
          if (isNaN(dateVal.getTime())) {
            return c.json({ error: `${String(key)} 값이 올바른 날짜가 아닙니다.` }, 400);
          }
          updateData[key] = dateVal;
        }
        continue;
      }

      // 나머지 필드는 그대로 매핑 (nullable 허용 필드는 null도 허용)
      updateData[key] = value;
    }

    if (Object.keys(updateData).length === 0) {
      return c.json({ error: "변경할 필드가 없습니다." }, 400);
    }

    const prisma = createPrismaClient(c.env.DB);
    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        userName: true,
        picture: true,
        role: true,
        point: true,
        privacyConsent: true,
        privacyConsentVersion: true,
        privacyConsentAt: true,
        reportStorageConsent: true,
        reportStorageConsentVersion: true,
        reportStorageConsentAt: true,
        lastConsentAt: true,
        consentStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    }).catch(async (e: any) => {
      await prisma.$disconnect();
      throw e;
    });

    await prisma.$disconnect();

    return c.json({
      success: true,
      user: {
        ...updated,
        createdAt: toUTC(updated.createdAt),
        updatedAt: toUTC(updated.updatedAt),
        privacyConsentAt: updated.privacyConsentAt ? toUTC(updated.privacyConsentAt) : null,
        reportStorageConsentAt: updated.reportStorageConsentAt ? toUTC(updated.reportStorageConsentAt) : null,
        lastConsentAt: updated.lastConsentAt ? toUTC(updated.lastConsentAt) : null,
      },
    });
  } catch (error) {
    return c.json(
      {
        error: "사용자 정보 수정 실패",
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
        createdAt: toUTC(user.createdAt),
      },
      profiles: profiles.map((p: any) => ({
        id: p.id,
        name: p.name,
        year: p.year,
        month: p.month,
        day: p.day,
        hour: p.hour,
        minute: p.minute,
        calendar: p.calendar,
        gender: p.gender,
        country: p.country,
        city: p.city,
        calculationMethod: p.calculationMethod,
        context: p.context,
        createdAt: toUTC(p.createdAt),
        updatedAt: toUTC(p.updatedAt),
      })),
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
  const sort = c.req.query("sort") || "totalTokens";
  const allowedSortColumns = [
    "model",
    "totalTokens",
    "totalCalls",
    "uniqueUsers",
  ];
  const sortColumn = allowedSortColumns.includes(sort) ? sort : "totalTokens";
  const order =
    c.req.query("order")?.toLowerCase() === "asc" ? "ASC" : "DESC";
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  const offset = (page - 1) * limit;

  try {
    const whereClauses: string[] = [];
    const bindings: any[] = [];
    if (startDate) {
      whereClauses.push("createdAt >= ?");
      bindings.push(new Date(startDate).toISOString());
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      whereClauses.push("createdAt <= ?");
      bindings.push(end.toISOString());
    }
    const whereClause =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const dataQuery = `
      SELECT
        model,
        SUM(totalTokens) as totalTokens,
        COUNT(id) as totalCalls,
        COUNT(DISTINCT userId) as uniqueUsers
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
      totalTokens: Number(row.totalTokens),
      totalCalls: Number(row.totalCalls),
      uniqueUsers: Number(row.uniqueUsers),
    }));

    await prisma.$disconnect();

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
  const { page, take, skip } = parsePagination(c, { defaultLimit: 20, maxLimit: 100 });
  const sort = c.req.query("sort") || "totalTokens";
  const allowedSortColumns = ["totalTokens", "totalCalls"];
  const sortColumn = allowedSortColumns.includes(sort) ? sort : "totalTokens";
  const order =
    c.req.query("order")?.toLowerCase() === "asc" ? "ASC" : "DESC";
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  const offset = skip;

  try {
    const whereClauses: string[] = [];
    const bindings: any[] = [];
    if (startDate) {
      whereClauses.push("l.createdAt >= ?");
      bindings.push(new Date(startDate).toISOString());
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      whereClauses.push("l.createdAt <= ?");
      bindings.push(end.toISOString());
    }
    const whereClause =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    // 1. Get total count of users
    const countQuery = `SELECT COUNT(DISTINCT userId) as totalItems FROM ai_usage_logs as l ${whereClause}`;
    const countResult = (await prisma.$queryRawUnsafe(
      countQuery,
      ...bindings
    )) as any[];
    const totalItems =
      countResult.length > 0 ? Number(countResult[0].totalItems) : 0;

    if (totalItems === 0) {
      await prisma.$disconnect();
      return c.json({
        success: true,
        stats: [],
        pagination: {
          totalItems: 0,
          totalPages: 0,
          currentPage: page,
          pageSize: take,
        },
      });
    }

    // 2. Get a paginated list of user IDs, sorted by their total usage
    const userIdsQuery = `
      SELECT
        userId,
        SUM(totalTokens) as totalTokens,
        COUNT(id) as totalCalls
      FROM ai_usage_logs as l
      ${whereClause}
      GROUP BY userId
      ORDER BY ${sortColumn} ${order}
      LIMIT ? OFFSET ?
    `;
    const paginatedUserStats = (await prisma.$queryRawUnsafe(
      userIdsQuery,
      ...bindings,
      take,
      offset
    )) as any[];
    const userIds = paginatedUserStats.map((u) => u.userId);

    if (userIds.length === 0) {
      await prisma.$disconnect();
      return c.json({
        success: true,
        stats: [],
        pagination: {
          totalItems,
          totalPages: Math.ceil(totalItems / take),
          currentPage: page,
          pageSize: take,
        },
      });
    }

    // 3. Get model-specific usage for those users
    const userIdsPlaceholder = userIds.map(() => "?").join(",");
    const detailedWhereClauses = [...whereClauses];
    detailedWhereClauses.push(`l.userId IN (${userIdsPlaceholder})`);
    const detailedBindings = [...bindings, ...userIds];
    const detailedWhereClause = `WHERE ${detailedWhereClauses.join(" AND ")}`;

    const detailedUsageQuery = `
      SELECT
        u.id as userId,
        u.name as userName,
        u.email as userEmail,
        l.model,
        SUM(l.totalTokens) as totalTokens,
        COUNT(l.id) as totalCalls
      FROM ai_usage_logs as l
      JOIN users as u ON l.userId = u.id
      ${detailedWhereClause}
      GROUP BY u.id, u.name, u.email, l.model
      ORDER BY u.id, totalTokens DESC;
    `;
    const detailedUsage = (await prisma.$queryRawUnsafe(
      detailedUsageQuery,
      ...detailedBindings
    )) as any[];

    // 4. Reconstruct the response
    const userStatsMap = new Map();
    for (const row of detailedUsage) {
      const userId = row.userId;
      if (!userStatsMap.has(userId)) {
        userStatsMap.set(userId, {
          user: { id: userId, name: row.userName, email: row.userEmail },
          totalUsage: { tokens: 0, calls: 0 }, // will be populated next
          modelUsage: [],
        });
      }
      userStatsMap.get(userId).modelUsage.push({
        model: row.model,
        totalTokens: Number(row.totalTokens),
        totalCalls: Number(row.totalCalls),
      });
    }

    for (const u of paginatedUserStats) {
      if (userStatsMap.has(u.userId)) {
        const stats = userStatsMap.get(u.userId);
        stats.totalUsage = {
          tokens: Number(u.totalTokens),
          calls: Number(u.totalCalls),
        };
      }
    }

    const finalStats = userIds.map((id) => userStatsMap.get(id));

    await prisma.$disconnect();

    return c.json({
      success: true,
      stats: finalStats,
      pagination: buildPaginationMeta(totalItems, page, take),
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
  const sort = c.req.query("sort") || "totalTokens";
  // Whitelist sortable columns to prevent SQL injection
  const allowedSortColumns = [
    "totalTokens",
    "totalPromptTokens",
    "totalCompletionTokens",
    "totalCalls",
  ];
  const sortColumn = allowedSortColumns.includes(sort) ? sort : "totalTokens";
  const order =
    c.req.query("order")?.toLowerCase() === "asc" ? "ASC" : "DESC";
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  const offset = (page - 1) * limit;

  try {
    const whereClauses: string[] = ["l.model = ?"];
    const bindings: any[] = [model];

    if (startDate) {
      whereClauses.push("l.createdAt >= ?");
      bindings.push(new Date(startDate).toISOString());
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      whereClauses.push("l.createdAt <= ?");
      bindings.push(end.toISOString());
    }
    const whereClause = `WHERE ${whereClauses.join(" AND ")}`;

    const dataQuery = `
      SELECT
        u.id as userId,
        u.name as userName,
        u.email as userEmail,
        SUM(l.promptTokens) as totalPromptTokens,
        SUM(l.completionTokens) as totalCompletionTokens,
        SUM(l.totalTokens) as totalTokens,
        COUNT(l.id) as totalCalls
      FROM ai_usage_logs as l
      JOIN users as u ON l.userId = u.id
      ${whereClause}
      GROUP BY u.id, u.name, u.email
      ORDER BY ${sortColumn} ${order}
      LIMIT ? OFFSET ?
    `;

    const countQuery = `
      SELECT COUNT(*) as totalItems FROM (
        SELECT 1 FROM ai_usage_logs as l ${whereClause} GROUP BY l.userId
      )
    `;

    const [data, countResult] = (await Promise.all([
      prisma.$queryRawUnsafe(dataQuery, ...bindings, limit, offset),
      prisma.$queryRawUnsafe(countQuery, ...bindings),
    ])) as [any[], any[]];

    const totalItems =
      countResult.length > 0 ? Number(countResult[0].totalItems) : 0;

    const formattedData = data.map((row: any) => ({
      userId: row.userId,
      userName: row.userName,
      userEmail: row.userEmail,
      totalPromptTokens: Number(row.totalPromptTokens),
      totalCompletionTokens: Number(row.totalCompletionTokens),
      totalTokens: Number(row.totalTokens),
      totalCalls: Number(row.totalCalls),
    }));

    await prisma.$disconnect();

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

    // analysisId 컬럼이 이미 있으므로 그대로 사용
    const transactionsWithAnalysisId = transactions;

    return c.json({
      success: true,
      userId,
      transactions: transactionsWithAnalysisId.map((t: any) => ({
        id: t.id,
        userId: t.userId,
        amount: t.amount,
        description: t.description,
        type: t.type,
        reference: t.reference,
        analysisId: t.analysisId,
        createdAt: toUTC(t.createdAt),
      })),
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

/**
 * 관리자가 사용자의 분석 결과가 있는 포인트 거래 내역만 조회합니다.
 */
export async function getUserAnalysisTransactions(
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

    const prisma = createPrismaClient(c.env.DB);

    // 분석 결과가 있는 거래만 조회
    const query = `
      SELECT 
        pt.id, pt.userId, pt.amount, pt.description, pt.type, pt.reference, pt.createdAt,
        sa.id as analysisId, sa.analysis_type, sa.type as analysis_type_detail, sa.title
      FROM PointTransaction pt
      LEFT JOIN saju_analyses sa ON (
        CASE 
          WHEN pt.reference LIKE 'saju_analysis_%' THEN CAST(SUBSTR(pt.reference, 14) AS INTEGER)
          WHEN pt.reference LIKE 'compatibility_analysis_%' THEN CAST(SUBSTR(pt.reference, 22) AS INTEGER)
          ELSE NULL
        END = sa.id
      )
      WHERE pt.userId = ? 
        AND pt.reference IS NOT NULL
        AND (
          pt.reference LIKE 'saju_analysis_%' OR
          pt.reference LIKE 'compatibility_analysis_%'
        )
        AND sa.id IS NOT NULL
      ORDER BY pt.createdAt DESC 
      LIMIT ? OFFSET ?
    `;

    const transactions = await prisma.$queryRawUnsafe(query, userId, limit, offset);

    // 총 개수 조회
    const countQuery = `
      SELECT COUNT(*) as total
      FROM PointTransaction pt
      LEFT JOIN saju_analyses sa ON (
        CASE 
          WHEN pt.reference LIKE 'saju_analysis_%' THEN CAST(SUBSTR(pt.reference, 14) AS INTEGER)
          WHEN pt.reference LIKE 'compatibility_analysis_%' THEN CAST(SUBSTR(pt.reference, 22) AS INTEGER)
          ELSE NULL
        END = sa.id
      )
      WHERE pt.userId = ? 
        AND pt.reference IS NOT NULL
        AND (
          pt.reference LIKE 'saju_analysis_%' OR
          pt.reference LIKE 'compatibility_analysis_%'
        )
        AND sa.id IS NOT NULL
    `;

    const totalCount = await prisma.$queryRawUnsafe(countQuery, userId) as any[];
    const total = totalCount?.[0]?.total || 0;

    await prisma.$disconnect();

    return c.json({
      success: true,
      userId,
      transactions: (transactions as any[]).map((t: any) => ({
        id: t.id,
        amount: t.amount,
        description: t.description,
        type: t.type,
        reference: t.reference,
        createdAt: toUTC(t.createdAt),
        analysis: {
          id: t.analysisId,
          analysisType: t.analysis_type,
          type: t.analysis_type_detail,
          title: t.title
        }
      })),
      pagination: {
        currentPage: page,
        pageSize: limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
    });
  } catch (error) {
    return c.json(
      {
        error: "분석 거래 내역 조회 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * 관리자가 분석 결과를 ID로 직접 조회합니다.
 */
export async function getAnalysisById(
  c: Context
): Promise<Response> {
  try {
    // 관리자 권한 체크
    if (!(await isAdmin(c))) {
      return c.json({ error: "관리자 권한이 필요합니다." }, 403);
    }

    const analysisId = Number(c.req.param("analysisId"));
    if (!analysisId) {
      return c.json({ error: "잘못된 분석 ID입니다." }, 400);
    }

    const prisma = createPrismaClient(c.env.DB);

    // 분석 결과 조회
    const analysis = await prisma.sajuAnalysis.findUnique({
      where: { id: analysisId },
      select: {
        id: true,
        analysisType: true,
        type: true,
        title: true,
        sajuData: true,
        userPrompt: true,
        systemPrompt: true,
        aiResponse: true,
        chartJson: true,
        modelUsed: true,
        pointsSpent: true,
        isFavorite: true,
        i18n: true,
        timezone: true,
        analysisStartedAt: true,
        analysisCompletedAt: true,
        usageMetadata: true,
        createdAt: true,
        updatedAt: true,
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

    return c.json({
      success: true,
      analysis: {
        id: analysis.id,
        analysisType: analysis.analysisType,
        type: analysis.type,
        title: analysis.title,
        userPrompt: analysis.userPrompt,
        systemPrompt: analysis.systemPrompt,
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
        createdAt: toUTC(analysis.createdAt),
        updatedAt: toUTC(analysis.updatedAt),
        isFollowUp: typeof analysis.title === 'string' && (analysis.title as string).includes('재질문'),
        optionsJson: (analysis as any).optionsJson || null,
        options: (() => { try { return (analysis as any).optionsJson ? JSON.parse((analysis as any).optionsJson) : null; } catch { return null; } })(),
      }
    });

  } catch (error) {
    return c.json(
      {
        error: "분석 결과 조회 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * [Admin] 특정 사용자의 사주 분석 결과 목록 조회
 */
export async function getUserSajuAnalyses(c: Context): Promise<Response> {
  try {
    if (!(await isAdmin(c))) {
      return c.json({ error: "관리자 권한이 필요합니다." }, 403);
    }

    const userId = Number(c.req.param("userId"));
    if (!userId) {
      return c.json({ error: "잘못된 사용자 ID입니다." }, 400);
    }

    const { page, take, skip } = parsePagination(c, { defaultLimit: 20, maxLimit: 100 });
    const type = c.req.query("type");
    const favorite = c.req.query("favorite");

    const prisma = createPrismaClient(c.env.DB);

    const where: any = { userId };
    if (type) where.type = type;
    if (favorite === "true") where.isFavorite = true;
    if (favorite === "false") where.isFavorite = false;

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
          ...( { optionsJson: true } as any ),
        },
        orderBy: [{ isFavorite: "desc" }, { createdAt: "desc" }],
        take,
        skip,
      }),
      prisma.sajuAnalysis.count({ where }),
    ]);

    await prisma.$disconnect();

    return c.json({
      success: true,
      analyses: analyses.map((a: any) => ({
        id: a.id,
        analysisType: a.analysisType,
        type: a.type,
        title: a.title,
        aiResponse: a.aiResponse,
        chartJson: (() => { try { return a.chartJson ? JSON.parse(a.chartJson) : null; } catch { return null; } })(),
        modelUsed: a.modelUsed,
        pointsSpent: a.pointsSpent,
        isFavorite: a.isFavorite,
        createdAt: toUTC(a.createdAt),
        analysisStartedAt: toUTC(a.analysisStartedAt),
        analysisCompletedAt: toUTC(a.analysisCompletedAt),
        i18n: a.i18n || undefined,
        timezone: a.timezone || undefined,
        isFollowUp: typeof a.title === 'string' ? a.title.includes('재질문') : false,
        optionsJson: a.optionsJson || null,
        options: (() => { try { return a.optionsJson ? JSON.parse(a.optionsJson) : null; } catch { return null; } })(),
      })),
      pagination: buildPaginationMeta(total, page, take),
    });
  } catch (error) {
    return c.json(
      {
        error: "사용자 분석 목록 조회 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}
