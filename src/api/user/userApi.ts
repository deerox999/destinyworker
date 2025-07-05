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

// JWT 토큰에서 사용자 ID 추출
const getUserIdFromToken = async (request: Request): Promise<number | null> => {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  try {
    const token = authHeader.substring(7);
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.exp > Math.floor(Date.now() / 1000) ? payload.userId : null;
  } catch {
    return null;
  }
};

// 프로필 이름 유효성 검사
const validateUserName = (userName: string): boolean => {
  if (!userName || typeof userName !== 'string') return false;
  const trimmed = userName.trim();
  return trimmed.length >= 1 && trimmed.length <= 50;
};

export const userApiHandlers = {
  // 사용자 정보 조회
  async getUserProfile(request: Request, env: any): Promise<Response> {
    try {
      const userId = await getUserIdFromToken(request);
      if (!userId) return jsonResponse({ error: "인증이 필요합니다." }, 401);

      const prisma = createPrismaClient(env.DB);
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          userName: true,
          picture: true,
          createdAt: true,
          updatedAt: true
        }
      });
      await prisma.$disconnect();

      if (!user) {
        return jsonResponse({ error: "사용자를 찾을 수 없습니다." }, 404);
      }

      return jsonResponse({
        success: true,
        user: {
          id: user.id,
          이메일: user.email,
          이름: user.name,
          프로필이름: user.userName,
          프로필사진: user.picture,
          가입일: user.createdAt,
          수정일: user.updatedAt
        }
      });
    } catch (error) {
      return jsonResponse({ 
        error: "사용자 정보 조회 실패", 
        message: error instanceof Error ? error.message : "Unknown error" 
      }, 500);
    }
  },

  // 프로필 이름 수정
  async updateUserName(request: Request, env: any): Promise<Response> {
    try {
      const userId = await getUserIdFromToken(request);
      if (!userId) return jsonResponse({ error: "인증이 필요합니다." }, 401);

      const body = await request.json() as any;
      const userName = body.프로필이름 || body.userName;
      
      if (!validateUserName(userName)) {
        return jsonResponse({ 
          error: "프로필 이름은 1-50자 사이여야 합니다." 
        }, 400);
      }

      const prisma = createPrismaClient(env.DB);
      
      // 사용자 존재 확인
      const existingUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true }
      });

      if (!existingUser) {
        await prisma.$disconnect();
        return jsonResponse({ error: "사용자를 찾을 수 없습니다." }, 404);
      }

      // 프로필 이름 업데이트
      await prisma.user.update({
        where: { id: userId },
        data: { userName: userName.trim() }
      });
      
      await prisma.$disconnect();

      return jsonResponse({ 
        success: true, 
        message: "프로필 이름이 성공적으로 수정되었습니다.",
        프로필이름: userName.trim()
      });
    } catch (error) {
      return jsonResponse({ 
        error: "프로필 이름 수정 실패", 
        message: error instanceof Error ? error.message : "Unknown error" 
      }, 500);
    }
  }
}; 