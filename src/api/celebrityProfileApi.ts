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

// JWT 토큰에서 사용자 정보 추출
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

// 댓글 데이터 변환
const toCommentFields = (comment: any) => ({
  id: comment.id,
  내용: comment.content,
  작성자: comment.user?.name || '알 수 없음',
  작성자ID: comment.userId,
  부모댓글ID: comment.parentId,
  답글: comment.replies?.map(toCommentFields) || [],
  작성일: comment.createdAt,
  수정일: comment.updatedAt,
});

// 유명인물 데이터 검증
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

// 댓글 데이터 검증
const validateCommentData = (data: any): boolean => {
  return data?.내용?.trim();
};

// 중복 조회 방지를 위한 메모리 캐시 (30분 유지)
const viewCache = new Map<string, number>();
const CACHE_DURATION = 30 * 60 * 1000; // 30분

// 클라이언트 식별자 생성
const getClientFingerprint = (request: Request): string => {
  const ip = request.headers.get('CF-Connecting-IP') || 
             request.headers.get('X-Forwarded-For') || 
             request.headers.get('X-Real-IP') || 
             'unknown';
  const userAgent = request.headers.get('User-Agent') || 'unknown';
  return `${ip}:${userAgent.substring(0, 50)}`;
};

// 조회수 증가 함수 (중복 방지)
const incrementViewCount = async (prisma: PrismaClient, celebrityId: string, request: Request): Promise<number> => {
  try {
    const fingerprint = getClientFingerprint(request);
    const cacheKey = `${celebrityId}:${fingerprint}`;
    const now = Date.now();
    
    // 캐시에서 최근 조회 기록 확인
    const lastView = viewCache.get(cacheKey);
    if (lastView && (now - lastView) < CACHE_DURATION) {
      // 30분 이내 동일 사용자의 조회는 조회수 증가 안함
      const existingCount = await getViewCount(prisma, celebrityId);
      return existingCount;
    }
    
    // 캐시에 조회 기록 저장
    viewCache.set(cacheKey, now);
    
    // 오래된 캐시 항목들 정리 (메모리 절약)
    if (viewCache.size > 1000) {
      const cutoff = now - CACHE_DURATION;
      for (const [key, timestamp] of viewCache.entries()) {
        if (timestamp < cutoff) {
          viewCache.delete(key);
        }
      }
    }
    
    // 조회수 증가
    const viewCount = await prisma.celebrityViewCount.upsert({
      where: { celebrityId },
      update: { viewCount: { increment: 1 } },
      create: { celebrityId, viewCount: 1 }
    });
    return viewCount.viewCount;
  } catch (error) {
    console.error('Failed to increment view count:', error);
    return 0;
  }
};

// 조회수 조회 함수
const getViewCount = async (prisma: PrismaClient, celebrityId: string): Promise<number> => {
  try {
    const viewCount = await prisma.celebrityViewCount.findUnique({
      where: { celebrityId },
      select: { viewCount: true }
    });
    return viewCount?.viewCount || 0;
  } catch (error) {
    console.error('Failed to get view count:', error);
    return 0;
  }
};

export const celebrityProfileApiHandlers = {
  // 유명인물 댓글 목록 조회 (페이징 지원, 계층 구조, 조회수 증가)
  async getCelebrityComments(request: Request, env: any, params?: Record<string, string>): Promise<Response> {
    try {
      const celebrityId = params?.id;
      if (!celebrityId) return jsonResponse({ error: "유명인물 ID가 필요합니다." }, 400);

      const url = new URL(request.url);
      const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
      const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
      const skip = (page - 1) * limit;

      const prisma = createPrismaClient(env.DB);

      // 조회수 증가
      const viewCount = await incrementViewCount(prisma, celebrityId, request);

      // 최상위 댓글만 조회 (대댓글은 중첩으로 포함)
      const [total, comments] = await Promise.all([
        prisma.celebrityComment.count({
          where: { celebrityId, parentId: null }
        }),
        prisma.celebrityComment.findMany({
          where: { celebrityId, parentId: null },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { name: true } },
            replies: {
              include: {
                user: { select: { name: true } },
                replies: {
                  include: {
                    user: { select: { name: true } },
                    replies: true // 3단계까지만 지원
                  },
                  orderBy: { createdAt: 'asc' }
                }
              },
              orderBy: { createdAt: 'asc' }
            }
          }
        })
      ]);

      await prisma.$disconnect();

      return jsonResponse({
        success: true,
        celebrityId,
        조회수: viewCount,
        comments: comments.map(toCommentFields),
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
      return jsonResponse({ error: "댓글 조회 실패", message: error instanceof Error ? error.message : "Unknown error" }, 500);
    }
  },

  // 유명인물 댓글 작성 (로그인 필요)
  async createCelebrityComment(request: Request, env: any, params?: Record<string, string>): Promise<Response> {
    try {
      const user = await getUserFromToken(request);
      if (!user) return jsonResponse({ error: "로그인이 필요합니다." }, 401);

      const celebrityId = params?.id;
      if (!celebrityId) return jsonResponse({ error: "유명인물 ID가 필요합니다." }, 400);

      const body = await request.json() as any;
      if (!validateCommentData(body)) {
        return jsonResponse({ error: "댓글 내용이 필요합니다." }, 400);
      }

      const prisma = createPrismaClient(env.DB);

      // 부모 댓글 존재 확인 (대댓글인 경우)
      if (body.부모댓글ID) {
        const parentComment = await prisma.celebrityComment.findUnique({
          where: { id: body.부모댓글ID },
          select: { celebrityId: true }
        });
        if (!parentComment || parentComment.celebrityId !== celebrityId) {
          await prisma.$disconnect();
          return jsonResponse({ error: "부모 댓글을 찾을 수 없습니다." }, 404);
        }
      }

      const comment = await prisma.celebrityComment.create({
        data: {
          celebrityId,
          userId: user.id,
          content: body.내용,
          parentId: body.부모댓글ID || null
        },
        include: {
          user: { select: { name: true } }
        }
      });

      await prisma.$disconnect();

      return jsonResponse({
        success: true,
        comment: toCommentFields(comment),
        message: "댓글이 작성되었습니다."
      }, 201);
    } catch (error) {
      return jsonResponse({ error: "댓글 작성 실패", message: error instanceof Error ? error.message : "Unknown error" }, 500);
    }
  },

  // 유명인물 댓글 수정 (본인만)
  async updateCelebrityComment(request: Request, env: any, params?: Record<string, string>): Promise<Response> {
    try {
      const user = await getUserFromToken(request);
      if (!user) return jsonResponse({ error: "로그인이 필요합니다." }, 401);

      const commentId = parseInt(params?.commentId || '0');
      if (!commentId) return jsonResponse({ error: "댓글 ID가 필요합니다." }, 400);

      const body = await request.json() as any;
      if (!validateCommentData(body)) {
        return jsonResponse({ error: "댓글 내용이 필요합니다." }, 400);
      }

      const prisma = createPrismaClient(env.DB);

      // 댓글 존재 및 소유권 확인
      const comment = await prisma.celebrityComment.findUnique({
        where: { id: commentId },
        select: { userId: true }
      });
      if (!comment) {
        await prisma.$disconnect();
        return jsonResponse({ error: "댓글을 찾을 수 없습니다." }, 404);
      }
      if (comment.userId !== user.id) {
        await prisma.$disconnect();
        return jsonResponse({ error: "본인의 댓글만 수정할 수 있습니다." }, 403);
      }

      await prisma.celebrityComment.update({
        where: { id: commentId },
        data: { content: body.내용 }
      });

      await prisma.$disconnect();

      return jsonResponse({ success: true, message: "댓글이 수정되었습니다." });
    } catch (error) {
      return jsonResponse({ error: "댓글 수정 실패", message: error instanceof Error ? error.message : "Unknown error" }, 500);
    }
  },

  // 유명인물 댓글 삭제 (본인 또는 관리자)
  async deleteCelebrityComment(request: Request, env: any, params?: Record<string, string>): Promise<Response> {
    try {
      const user = await getUserFromToken(request);
      if (!user) return jsonResponse({ error: "로그인이 필요합니다." }, 401);

      const commentId = parseInt(params?.commentId || '0');
      if (!commentId) return jsonResponse({ error: "댓글 ID가 필요합니다." }, 400);

      const prisma = createPrismaClient(env.DB);

      // 댓글 존재 확인
      const comment = await prisma.celebrityComment.findUnique({
        where: { id: commentId },
        select: { userId: true }
      });
      if (!comment) {
        await prisma.$disconnect();
        return jsonResponse({ error: "댓글을 찾을 수 없습니다." }, 404);
      }

      // 본인 또는 관리자인지 확인
      const isOwner = comment.userId === user.id;
      const isUserAdmin = await isAdmin(request, env);
      
      if (!isOwner && !isUserAdmin) {
        await prisma.$disconnect();
        return jsonResponse({ error: "댓글을 삭제할 권한이 없습니다." }, 403);
      }

      await prisma.celebrityComment.delete({ where: { id: commentId } });
      await prisma.$disconnect();

      return jsonResponse({ success: true, message: "댓글이 삭제되었습니다." });
    } catch (error) {
      return jsonResponse({ error: "댓글 삭제 실패", message: error instanceof Error ? error.message : "Unknown error" }, 500);
    }
  }
}; 