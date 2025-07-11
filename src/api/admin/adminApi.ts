import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";
import { jsonResponse } from "../../common/utils";

const createPrismaClient = (db: D1Database) => {
  const adapter = new PrismaD1(db);
  return new PrismaClient({
    adapter,
    log: ["error"], // 에러만 로깅
  });
};

// JWT 토큰에서 사용자 정보 추출
const getUserFromToken = async (request: Request): Promise<any | null> => {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  try {
    const token = authHeader.substring(7);
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
    );
    return payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
  } catch {
    return null;
  }
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
      where: { id: user.userId },
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

  const url = new URL(request.url);
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");
  const prisma = createPrismaClient(env.DB);

  try {
    const whereConditions: string[] = [];
    if (startDate) {
      whereConditions.push(
        `created_at >= '${new Date(startDate).toISOString()}'`
      );
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // 해당 날짜의 끝까지 포함
      whereConditions.push(`created_at <= '${end.toISOString()}'`);
    }
    const whereClause =
      whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    const query = `
      SELECT
        model,
        SUM(total_tokens) as total_tokens,
        COUNT(id) as total_calls,
        COUNT(DISTINCT user_id) as unique_users
      FROM ai_usage_logs
      ${whereClause}
      GROUP BY model
      ORDER BY total_tokens DESC;
    `;

    const result: any[] = await prisma.$queryRawUnsafe(query);

    const stats = result.map((row) => ({
      ...row,
      total_tokens: Number(row.total_tokens),
      total_calls: Number(row.total_calls),
      unique_users: Number(row.unique_users),
    }));

    return jsonResponse({ success: true, stats });
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

  const url = new URL(request.url);
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");
  const prisma = createPrismaClient(env.DB);

  try {
    const whereConditions: string[] = [];
    if (startDate) {
      whereConditions.push(
        `l.created_at >= '${new Date(startDate).toISOString()}'`
      );
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      whereConditions.push(`l.created_at <= '${end.toISOString()}'`);
    }
    const whereClause =
      whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    const query = `
      SELECT
        u.id as user_id,
        u.name as user_name,
        u.email as user_email,
        l.model,
        SUM(l.total_tokens) as total_tokens,
        COUNT(l.id) as total_calls
      FROM ai_usage_logs as l
      JOIN users as u ON l.user_id = u.id
      ${whereClause}
      GROUP BY u.id, u.name, u.email, l.model
      ORDER BY u.id, total_tokens DESC;
    `;

    const result: any[] = await prisma.$queryRawUnsafe(query);

    const userStats = new Map();
    result.forEach((row) => {
      const userId = row.user_id;
      if (!userStats.has(userId)) {
        userStats.set(userId, {
          user: {
            id: userId,
            name: row.user_name,
            email: row.user_email,
          },
          totalUsage: { tokens: 0, calls: 0 },
          modelUsage: [],
        });
      }

      const stats = userStats.get(userId);
      const totalTokens = Number(row.total_tokens);
      const totalCalls = Number(row.total_calls);

      stats.totalUsage.tokens += totalTokens;
      stats.totalUsage.calls += totalCalls;
      stats.modelUsage.push({
        model: row.model,
        total_tokens: totalTokens,
        total_calls: totalCalls,
      });
    });

    const finalStats = Array.from(userStats.values()).sort(
      (a, b) => b.totalUsage.tokens - a.totalUsage.tokens
    );

    return jsonResponse({ success: true, stats: finalStats });
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
