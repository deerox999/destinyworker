import { PrismaClient } from '@prisma/client';
import { PrismaD1 } from '@prisma/adapter-d1';

// 유틸리티 함수들
const jsonResponse = (data: any, status = 200) => 
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });

const createPrismaClient = (db: D1Database) => {
  const adapter = new PrismaD1(db);
  return new PrismaClient({ 
    adapter,
    log: ['error'] // 에러만 로깅
  });
};

// JWT 토큰에서 사용자 정보 추출
const getUserFromToken = async (request: Request): Promise<any | null> => {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  try {
    const token = authHeader.substring(7);
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
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
  if (user.role === 'admin') return true;
  
  // DB에서 재확인 (토큰이 오래된 경우 대비)
  try {
    const prisma = createPrismaClient(env.DB);
    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { role: true }
    });
    await prisma.$disconnect();
    return dbUser?.role === 'admin';
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

export const adminApiHandlers = {
  // 가입한 유저 목록 조회
  async getUsers(request: Request, env: any): Promise<Response> {
    try {
      // 관리자 권한 체크
      if (!(await isAdmin(request, env))) {
        return jsonResponse({ error: "관리자 권한이 필요합니다." }, 403);
      }

      const prisma = createPrismaClient(env.DB);
      
      // URL 파라미터에서 페이지네이션 정보 추출
      const url = new URL(request.url);
      const page = parseInt(url.searchParams.get('page') || '1');
      const limit = parseInt(url.searchParams.get('limit') || '20');
      const search = url.searchParams.get('search') || '';
      
      const skip = (page - 1) * limit;
      
      // 검색 조건 구성
      const whereCondition = search ? {
        OR: [
          { name: { contains: search } },
          { email: { contains: search } }
        ]
      } : {};

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
                sajuProfiles: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.user.count({ where: whereCondition })
      ]);
      
      await prisma.$disconnect();

      return jsonResponse({
        success: true,
        users: users.map(user => ({
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture,
          role: user.role,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          profileCount: user._count.sajuProfiles
        })),
        pagination: {
          totalItems: totalCount,
          totalPages: Math.ceil(totalCount / limit),
          currentPage: page,
          pageSize: limit,
        }
      });
    } catch (error) {
      return jsonResponse({ 
        error: "사용자 목록 조회 실패", 
        message: error instanceof Error ? error.message : "Unknown error" 
      }, 500);
    }
  },

  // 특정 유저의 프로필 조회
  async getUserProfiles(request: Request, env: any, params?: Record<string, string>): Promise<Response> {
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
          createdAt: true
        }
      });

      if (!user) {
        await prisma.$disconnect();
        return jsonResponse({ error: "사용자를 찾을 수 없습니다." }, 404);
      }

      // 해당 사용자의 사주 프로필 조회
      const profiles = await prisma.sajuProfile.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
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
          createdAt: user.createdAt
        },
        profiles: profiles.map(toKoreanFields),
        count: profiles.length
      });
    } catch (error) {
      return jsonResponse({ 
        error: "프로필 조회 실패", 
        message: error instanceof Error ? error.message : "Unknown error" 
      }, 500);
    }
  },

  // 전체 통계 정보 조회
  async getAdminStats(request: Request, env: any): Promise<Response> {
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
        prisma.user.count({ where: { role: 'admin' } })
      ]);
      
      await prisma.$disconnect();

      return jsonResponse({
        success: true,
        stats: {
          totalUsers,
          totalProfiles,
          adminUsers,
          averageProfilesPerUser: totalUsers > 0 ? (totalProfiles / totalUsers).toFixed(2) : 0
        }
      });
    } catch (error) {
      return jsonResponse({ 
        error: "통계 조회 실패", 
        message: error instanceof Error ? error.message : "Unknown error" 
      }, 500);
    }
  },

  // 로그인/로그아웃 기록 조회
  async getLoginHistory(request: Request, env: any): Promise<Response> {
    try {
      if (!(await isAdmin(request, env))) {
        return jsonResponse({ error: "관리자 권한이 필요합니다." }, 403);
      }

      const prisma = createPrismaClient(env.DB);
      
      const url = new URL(request.url);
      const page = parseInt(url.searchParams.get('page') || '1');
      const limit = parseInt(url.searchParams.get('limit') || '20');
      const search = url.searchParams.get('search') || '';
      const action = url.searchParams.get('action') || ''; // 'login' or 'logout'

      const skip = (page - 1) * limit;

      const whereCondition: any = {};
      if (search) {
        whereCondition.user = {
          OR: [
            { name: { contains: search } },
            { email: { contains: search } }
          ]
        };
      }
      if (action === 'login' || action === 'logout') {
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
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.loginHistory.count({ where: whereCondition })
      ]);

      await prisma.$disconnect();

      return jsonResponse({
        success: true,
        history: history.map(h => ({
          id: h.id,
          action: h.action,
          createdAt: h.createdAt,
          user: h.user
        })),
        pagination: {
          totalItems: totalCount,
          totalPages: Math.ceil(totalCount / limit),
          currentPage: page,
          pageSize: limit,
        }
      });
    } catch (error) {
      return jsonResponse({ 
        error: "로그인 기록 조회 실패", 
        message: error instanceof Error ? error.message : "Unknown error" 
      }, 500);
    }
  }
}; 