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
    log: ['error']
  });
};

// JWT 토큰에서 사용자 정보 추출 (관리자 체크용)
const getUserFromToken = async (request: Request): Promise<{ id: number; role: string } | null> => {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  try {
    const token = authHeader.substring(7);
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    
    return { id: payload.userId, role: payload.role || 'user' };
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
      where: { id: user.id },
      select: { role: true }
    });
    await prisma.$disconnect();
    return dbUser?.role === 'admin';
  } catch {
    return false;
  }
};

// 한글 -> 영어 필드 변환
const toDbFields = (data: any) => ({
  id: data.id,
  name: data.이름,
  year: data.년,
  month: data.월,
  day: data.일,
  calendar: data.달력,
  gender: data.성별,
  occupation: data.직업,
  description: data.설명,
  thumbnail: data.썸네일,
});

// 영어 -> 한글 필드 변환
const toKoreanFields = (profile: any) => ({
  id: profile.id,
  이름: profile.name,
  년: profile.year,
  월: profile.month,
  일: profile.day,
  달력: profile.calendar,
  성별: profile.gender,
  직업: profile.occupation,
  설명: profile.description,
  썸네일: profile.thumbnail,
  createdAt: profile.createdAt,
  updatedAt: profile.updatedAt,
});

// 데이터 검증
const validateCelebrityData = (data: any): boolean => {
  return data?.이름?.trim() && 
         data?.id?.trim() &&
         /^\d{4}$/.test(data.년) && 
         /^(0[1-9]|1[0-2])$/.test(data.월) && 
         /^(0[1-9]|[12]\d|3[01])$/.test(data.일) && 
         ['양력', '음력'].includes(data.달력) && 
         ['남자', '여자'].includes(data.성별) &&
         data?.직업?.trim() &&
         data?.설명?.trim();
};

export const celebrityProfileApiHandlers = {
  // 유명인물 목록 조회 (페이징 지원, 인증 불필요)
  async getCelebrites(request: Request, env: any): Promise<Response> {
    try {
      const url = new URL(request.url);
      const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
      const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
      const search = url.searchParams.get('search')?.trim() || '';
      const skip = (page - 1) * limit;

      const prisma = createPrismaClient(env.DB);
      
      // 검색 조건
      const where = search ? {
        OR: [
          { name: { contains: search } },
          { occupation: { contains: search } },
          { description: { contains: search } }
        ]
      } : {};

      // 총 개수와 데이터를 동시에 조회
      const [total, profiles] = await Promise.all([
        prisma.celebrityProfile.count({ where }),
        prisma.celebrityProfile.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' }
        })
      ]);
      
      await prisma.$disconnect();

      return jsonResponse({
        success: true,
        profiles: profiles.map(toKoreanFields),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      });
    } catch (error) {
      return jsonResponse({ error: "조회 실패", message: error instanceof Error ? error.message : "Unknown error" }, 500);
    }
  },

  // 특정 유명인물 조회 (인증 불필요)
  async getCelebrity(request: Request, env: any, params?: Record<string, string>): Promise<Response> {
    try {
      const profileId = params?.id;
      if (!profileId) return jsonResponse({ error: "ID가 필요합니다." }, 400);

      const prisma = createPrismaClient(env.DB);
      const profile = await prisma.celebrityProfile.findUnique({
        where: { id: profileId }
      });
      await prisma.$disconnect();

      if (!profile) return jsonResponse({ error: "유명인물을 찾을 수 없습니다." }, 404);

      return jsonResponse({
        success: true,
        profile: toKoreanFields(profile)
      });
    } catch (error) {
      return jsonResponse({ error: "조회 실패", message: error instanceof Error ? error.message : "Unknown error" }, 500);
    }
  },

  // 유명인물 생성 (관리자만)
  async createCelebrity(request: Request, env: any): Promise<Response> {
    try {
      if (!(await isAdmin(request, env))) {
        return jsonResponse({ error: "관리자 권한이 필요합니다." }, 403);
      }

      const body = await request.json();
      if (!validateCelebrityData(body)) {
        return jsonResponse({ error: "잘못된 데이터입니다." }, 400);
      }

      const prisma = createPrismaClient(env.DB);
      
      // ID 중복 체크
      const existing = await prisma.celebrityProfile.findUnique({
        where: { id: (body as any).id }
      });
      if (existing) {
        await prisma.$disconnect();
        return jsonResponse({ error: "이미 존재하는 ID입니다." }, 409);
      }

      const profile = await prisma.celebrityProfile.create({
        data: toDbFields(body)
      });
      await prisma.$disconnect();

      return jsonResponse({ 
        success: true, 
        id: profile.id,
        message: "유명인물이 생성되었습니다."
      }, 201);
    } catch (error) {
      return jsonResponse({ error: "생성 실패", message: error instanceof Error ? error.message : "Unknown error" }, 500);
    }
  },

  // 유명인물 수정 (관리자만)
  async updateCelebrity(request: Request, env: any, params?: Record<string, string>): Promise<Response> {
    try {
      if (!(await isAdmin(request, env))) {
        return jsonResponse({ error: "관리자 권한이 필요합니다." }, 403);
      }

      const profileId = params?.id;
      if (!profileId) return jsonResponse({ error: "ID가 필요합니다." }, 400);

      const body = await request.json();
      if (!validateCelebrityData(body)) {
        return jsonResponse({ error: "잘못된 데이터입니다." }, 400);
      }

      const prisma = createPrismaClient(env.DB);
      
      // 존재 여부 확인
      const existing = await prisma.celebrityProfile.findUnique({
        where: { id: profileId }
      });
      if (!existing) {
        await prisma.$disconnect();
        return jsonResponse({ error: "유명인물을 찾을 수 없습니다." }, 404);
      }

      // ID 변경 시 중복 체크
      if ((body as any).id !== profileId) {
        const duplicate = await prisma.celebrityProfile.findUnique({
          where: { id: (body as any).id }
        });
        if (duplicate) {
          await prisma.$disconnect();
          return jsonResponse({ error: "변경하려는 ID가 이미 존재합니다." }, 409);
        }
      }

      await prisma.celebrityProfile.update({
        where: { id: profileId },
        data: toDbFields(body)
      });
      await prisma.$disconnect();

      return jsonResponse({ success: true, message: "유명인물 정보가 수정되었습니다." });
    } catch (error) {
      return jsonResponse({ error: "수정 실패", message: error instanceof Error ? error.message : "Unknown error" }, 500);
    }
  },

  // 유명인물 삭제 (관리자만)
  async deleteCelebrity(request: Request, env: any, params?: Record<string, string>): Promise<Response> {
    try {
      if (!(await isAdmin(request, env))) {
        return jsonResponse({ error: "관리자 권한이 필요합니다." }, 403);
      }

      const profileId = params?.id;
      if (!profileId) return jsonResponse({ error: "ID가 필요합니다." }, 400);

      const prisma = createPrismaClient(env.DB);
      
      const existing = await prisma.celebrityProfile.findUnique({
        where: { id: profileId }
      });
      if (!existing) {
        await prisma.$disconnect();
        return jsonResponse({ error: "유명인물을 찾을 수 없습니다." }, 404);
      }

      await prisma.celebrityProfile.delete({ where: { id: profileId } });
      await prisma.$disconnect();

      return jsonResponse({ success: true, message: "유명인물이 삭제되었습니다." });
    } catch (error) {
      return jsonResponse({ error: "삭제 실패", message: error instanceof Error ? error.message : "Unknown error" }, 500);
    }
  }
}; 