import { PrismaClient } from '@prisma/client';
import { PrismaD1 } from '@prisma/adapter-d1';

// JSON 응답 생성 함수
function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

// Prisma Client 생성 함수
function createPrismaClient(db: D1Database) {
  const adapter = new PrismaD1(db);
  return new PrismaClient({ adapter } as any);
}

// Prisma 기반 데이터베이스 API 핸들러들 (기존 URL 유지)
export const databaseApiHandlers = {
  /**
   * 댓글 목록 조회 API
   * GET /api/comments
   * 최신 댓글 10개를 ID 역순으로 조회
   */
  async getComments(request: Request, env: any): Promise<Response> {
    if (!env.DB) {
      return jsonResponse({ error: "데이터베이스가 설정되지 않았습니다." }, 500);
    }

    try {
      const prisma = createPrismaClient(env.DB);
      
      // Prisma로 댓글 조회 - 타입 안전하고 직관적
      const comments = await prisma.comment.findMany({
        take: 10,
        orderBy: {
          id: 'desc' // 최신 댓글부터
        }
      });
      
      await prisma.$disconnect();
      
      return jsonResponse(comments);
    } catch (error) {
      console.error("댓글 조회 오류:", error);
      return jsonResponse({ 
        error: "댓글을 조회할 수 없습니다.",
        message: error instanceof Error ? error.message : "Unknown error"
      }, 500);
    }
  },

  /**
   * JSON 데이터 저장 API
   * POST /api/json
   * 사용자별 임의의 JSON 데이터를 저장
   */
  async saveJson(request: Request, env: any): Promise<Response> {
    if (!env.DB) {
      return jsonResponse({ error: "데이터베이스가 설정되지 않았습니다." }, 500);
    }

    try {
      const body = await request.json() as { userId?: string; data?: any };
      const { userId, data } = body;

      if (!userId) {
        return jsonResponse({ error: "userId가 필요합니다." }, 400);
      }

      if (!data) {
        return jsonResponse({ error: "저장할 데이터가 필요합니다." }, 400);
      }

      const prisma = createPrismaClient(env.DB);
      
      // JSON 데이터를 문자열로 변환하여 저장
      const jsonString = JSON.stringify(data);
      
      // Prisma로 JSON 데이터 저장 - 타입 안전하고 자동 타임스탬프 관리
      const jsonStorage = await prisma.jsonStorage.create({
        data: {
          userId,
          jsonData: jsonString
        }
      });
      
      await prisma.$disconnect();
      
      return jsonResponse({ 
        success: true, 
        id: jsonStorage.id,
        message: "JSON 데이터가 성공적으로 저장되었습니다."
      });
    } catch (error) {
      console.error("JSON 저장 오류:", error);
      return jsonResponse({ 
        error: "JSON 데이터를 저장할 수 없습니다.",
        message: error instanceof Error ? error.message : "Unknown error"
      }, 500);
    }
  },

  /**
   * JSON 데이터 조회 API
   * GET /api/json/{userId}
   * 특정 사용자의 모든 JSON 데이터를 최신순으로 조회
   */
  async getJson(request: Request, env: any, userId: string): Promise<Response> {
    if (!env.DB) {
      return jsonResponse({ error: "데이터베이스가 설정되지 않았습니다." }, 500);
    }

    try {
      if (!userId) {
        return jsonResponse({ error: "userId가 필요합니다." }, 400);
      }

      const prisma = createPrismaClient(env.DB);
      
      // Prisma로 JSON 데이터 조회 - 타입 안전하고 필요한 필드만 선택
      const jsonRecords = await prisma.jsonStorage.findMany({
        where: { 
          userId 
        },
        orderBy: { 
          updatedAt: 'desc' // 최신 업데이트순
        },
        select: {
          id: true,
          jsonData: true,
          createdAt: true,
          updatedAt: true
        }
      });
      
      await prisma.$disconnect();
      
      if (!jsonRecords || jsonRecords.length === 0) {
        return jsonResponse({ 
          error: "해당 사용자의 JSON 데이터를 찾을 수 없습니다." 
        }, 404);
      }

      // JSON 문자열을 다시 객체로 파싱하여 반환
      const jsonData = jsonRecords.map((record) => ({
        id: record.id,
        data: JSON.parse(record.jsonData),
        created_at: record.createdAt,
        updated_at: record.updatedAt
      }));

      return jsonResponse({
        userId,
        records: jsonData,
        count: jsonData.length
      });
    } catch (error) {
      console.error("JSON 조회 오류:", error);
      return jsonResponse({ 
        error: "JSON 데이터를 조회할 수 없습니다.",
        message: error instanceof Error ? error.message : "Unknown error"
      }, 500);
    }
  }
}; 