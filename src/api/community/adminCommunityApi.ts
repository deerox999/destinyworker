import { Context } from "hono";
import { createPrismaClient, isAdmin } from "../../common/prismaUtils";
import { requireLanguageParam, supportedLanguages } from "../../common/utils";
import { getUserFromToken } from "../../common/utils";

export const adminCommunityApi = {
  // 게시판 목록 조회 (관리자용 - 전체)
  async getBoards(c: Context) {
    try {
      // 관리자 권한 확인
      if (!(await isAdmin(c))) {
        return c.json({ error: "관리자 권한이 필요합니다." }, 403);
      }

      const language = requireLanguageParam(c);
      const prisma = createPrismaClient(c.env.DB);
      
      const boards = await prisma.board.findMany({
        where: ({ language } as any),
        orderBy: [
          { sortOrder: "asc" },
          { createdAt: "asc" }
        ],
      });

      await prisma.$disconnect();

      return c.json({
        success: true,
        data: boards,
      });
    } catch (error) {
      console.error("게시판 목록 조회 오류:", error);
      return c.json(
        { success: false, message: "서버 오류가 발생했습니다." },
        500
      );
    }
  },

  // 게시판 생성
  async createBoard(c: Context) {
    try {
      // 관리자 권한 확인
      if (!(await isAdmin(c))) {
        return c.json({ error: "관리자 권한이 필요합니다." }, 403);
      }

      const body = await c.req.json();
      // 언어별 다건 입력 지원: items: [{ language, name, displayName, description, sortOrder?, isActive? }]
      const { items } = body as { items: Array<{ language: string; name: string; displayName: string; description?: string; sortOrder?: number; isActive?: boolean }>; };

      if (!Array.isArray(items) || items.length === 0) {
        return c.json({ success: false, message: "items는 필수입니다." }, 400);
      }
      for (const it of items) {
        if (!it.language || !supportedLanguages.includes(it.language as any)) {
          return c.json({ success: false, message: "유효한 language가 필요합니다." }, 400);
        }
      }

      const prisma = createPrismaClient(c.env.DB);

      const created: any[] = [];
      for (const it of items) {
        const existing = await prisma.board.findFirst({ where: ({ name: it.name, language: it.language } as any) });
        if (existing) {
          continue; // 같은 (name, language)는 건너뜀
        }
        const board = await prisma.board.create({
          data: ({
            name: it.name,
            displayName: it.displayName,
            description: it.description,
            sortOrder: it.sortOrder ?? 0,
            isActive: it.isActive ?? true,
            language: it.language as any,
          } as any),
        });
        created.push(board);
      }

      await prisma.$disconnect();

      return c.json(
        {
          success: true,
          data: created,
        },
        201
      );
    } catch (error) {
      console.error("게시판 생성 오류:", error);
      return c.json(
        { success: false, message: "서버 오류가 발생했습니다." },
        500
      );
    }
  },

  // 게시판 수정
  async updateBoard(c: Context) {
    try {
      // 관리자 권한 확인
      if (!(await isAdmin(c))) {
        return c.json({ error: "관리자 권한이 필요합니다." }, 403);
      }

      const { boardId } = c.req.param();
      const body = await c.req.json();
      const { displayName, description, sortOrder, isActive } = body;
      const language = requireLanguageParam(c);

      const prisma = createPrismaClient(c.env.DB);

      const board = await prisma.board.findFirst({
        where: ({ id: parseInt(boardId), language } as any),
      });

      if (!board) {
        await prisma.$disconnect();
        return c.json(
          { success: false, message: "게시판을 찾을 수 없습니다." },
          404
        );
      }

      const updatedBoard = await prisma.board.update({
        where: { id: parseInt(boardId) },
        data: {
          ...(displayName && { displayName }),
          ...(description !== undefined && { description }),
          ...(sortOrder !== undefined && { sortOrder }),
          ...(isActive !== undefined && { isActive }),
          ...(language && ({ language } as any)),
          updatedAt: new Date(),
        },
      });

      await prisma.$disconnect();

      return c.json({
        success: true,
        data: updatedBoard,
      });
    } catch (error) {
      console.error("게시판 수정 오류:", error);
      return c.json(
        { success: false, message: "서버 오류가 발생했습니다." },
        500
      );
    }
  },

  // 게시판 삭제
  async deleteBoard(c: Context) {
    try {
      // 관리자 권한 확인
      if (!(await isAdmin(c))) {
        return c.json({ error: "관리자 권한이 필요합니다." }, 403);
      }

      const { boardId } = c.req.param();
      const language = requireLanguageParam(c);

      const prisma = createPrismaClient(c.env.DB);

      const board = await prisma.board.findFirst({
        where: ({ id: parseInt(boardId), language } as any),
      });

      if (!board) {
        await prisma.$disconnect();
        return c.json(
          { success: false, message: "게시판을 찾을 수 없습니다." },
          404
        );
      }

      // 물리적 삭제가 아닌 비활성화
      await prisma.board.update({
        where: { id: parseInt(boardId) },
        data: { isActive: false },
      });

      await prisma.$disconnect();

      return c.json({
        success: true,
        message: "게시판이 삭제되었습니다.",
      });
    } catch (error) {
      console.error("게시판 삭제 오류:", error);
      return c.json(
        { success: false, message: "서버 오류가 발생했습니다." },
        500
      );
    }
  },

  // 게시판별 카테고리 목록 조회
  async getBoardCategories(c: Context) {
    try {
      // 관리자 권한 확인
      if (!(await isAdmin(c))) {
        return c.json({ error: "관리자 권한이 필요합니다." }, 403);
      }

      const { boardId } = c.req.param();
      const language = requireLanguageParam(c);

      const prisma = createPrismaClient(c.env.DB);

      const board = await prisma.board.findFirst({
        where: ({ id: parseInt(boardId), language } as any),
      });

      if (!board) {
        await prisma.$disconnect();
        return c.json(
          { success: false, message: "게시판을 찾을 수 없습니다." },
          404
        );
      }

      const categories = await prisma.boardCategory.findMany({
        where: ({ boardId: parseInt(boardId), language } as any),
        orderBy: { sortOrder: "asc" },
      });

      await prisma.$disconnect();

      return c.json({
        success: true,
        data: categories,
      });
    } catch (error) {
      console.error("카테고리 목록 조회 오류:", error);
      return c.json(
        { success: false, message: "서버 오류가 발생했습니다." },
        500
      );
    }
  },

  // 카테고리 생성
  async createCategory(c: Context) {
    try {
      // 관리자 권한 확인
      if (!(await isAdmin(c))) {
        return c.json({ error: "관리자 권한이 필요합니다." }, 403);
      }

      const { boardId } = c.req.param();
      const body = await c.req.json();
      // 언어별 다건 입력 지원: items: [{ language, name, sortOrder?, isActive? }]
      const { items } = body as { items: Array<{ language: string; name: string; sortOrder?: number; isActive?: boolean }>; };
      if (!Array.isArray(items) || items.length === 0) {
        return c.json({ success: false, message: "items는 필수입니다." }, 400);
      }

      const prisma = createPrismaClient(c.env.DB);

      // 게시판 존재 확인
      const language = requireLanguageParam(c);
      const board = await prisma.board.findFirst({
        where: ({ id: parseInt(boardId), language } as any),
      });

      if (!board) {
        await prisma.$disconnect();
        return c.json(
          { success: false, message: "게시판을 찾을 수 없습니다." },
          404
        );
      }

      const created: any[] = [];
      for (const it of items) {
        if (!it.language || !supportedLanguages.includes(it.language as any)) {
          await prisma.$disconnect();
          return c.json({ success: false, message: "유효한 language가 필요합니다." }, 400);
        }
        const existing = await prisma.boardCategory.findFirst({
          where: ({ boardId: parseInt(boardId), name: it.name, language: it.language } as any),
        });
        if (existing) continue;
        const category = await prisma.boardCategory.create({
          data: ({
            boardId: parseInt(boardId),
            name: it.name,
            sortOrder: it.sortOrder ?? 0,
            isActive: it.isActive ?? true,
            language: it.language as any,
          } as any),
        });
        created.push(category);
      }

      await prisma.$disconnect();

      return c.json(
        {
          success: true,
          data: created,
        },
        201
      );
    } catch (error) {
      console.error("카테고리 생성 오류:", error);
      return c.json(
        { success: false, message: "서버 오류가 발생했습니다." },
        500
      );
    }
  },

  // 카테고리 수정
  async updateCategory(c: Context) {
    try {
      // 관리자 권한 확인
      if (!(await isAdmin(c))) {
        return c.json({ error: "관리자 권한이 필요합니다." }, 403);
      }

      const { categoryId } = c.req.param();
      const body = await c.req.json();
      const { name, sortOrder, isActive } = body;
      const language = requireLanguageParam(c);

      const prisma = createPrismaClient(c.env.DB);

      const category = await prisma.boardCategory.findFirst({
        where: ({ id: parseInt(categoryId), language } as any),
      });

      if (!category) {
        await prisma.$disconnect();
        return c.json(
          { success: false, message: "카테고리를 찾을 수 없습니다." },
          404
        );
      }

      const updatedCategory = await prisma.boardCategory.update({
        where: { id: parseInt(categoryId) },
        data: {
          ...(name && { name }),
          ...(sortOrder !== undefined && { sortOrder }),
          ...(isActive !== undefined && { isActive }),
          ...(language && ({ language } as any)),
          updatedAt: new Date(),
        },
      });

      await prisma.$disconnect();

      return c.json({
        success: true,
        data: updatedCategory,
      });
    } catch (error) {
      console.error("카테고리 수정 오류:", error);
      return c.json(
        { success: false, message: "서버 오류가 발생했습니다." },
        500
      );
    }
  },

  // 카테고리 삭제
  async deleteCategory(c: Context) {
    try {
      // 관리자 권한 확인
      if (!(await isAdmin(c))) {
        return c.json({ error: "관리자 권한이 필요합니다." }, 403);
      }

      const { categoryId } = c.req.param();
      const language = requireLanguageParam(c);

      const prisma = createPrismaClient(c.env.DB);

      const category = await prisma.boardCategory.findFirst({
        where: ({ id: parseInt(categoryId), language } as any),
      });

      if (!category) {
        await prisma.$disconnect();
        return c.json(
          { success: false, message: "카테고리를 찾을 수 없습니다." },
          404
        );
      }

      // 물리적 삭제가 아닌 비활성화
      await prisma.boardCategory.update({
        where: { id: parseInt(categoryId) },
        data: { isActive: false },
      });

      await prisma.$disconnect();

      return c.json({
        success: true,
        message: "카테고리가 삭제되었습니다.",
      });
    } catch (error) {
      console.error("카테고리 삭제 오류:", error);
      return c.json(
        { success: false, message: "서버 오류가 발생했습니다." },
        500
      );
    }
  },

  // 어드민용 샘플 데이터 생성
  async createSampleData(c: Context) {
    try {
      // 관리자 권한 확인
      if (!(await isAdmin(c))) {
        return c.json({ error: "관리자 권한이 필요합니다." }, 403);
      }

      const prisma = createPrismaClient(c.env.DB);

      // 샘플 게시판들 생성
      const sampleBoards = [
        {
          name: 'free-discussion',
          displayName: '자유 토론',
          description: '자유롭게 이야기를 나누는 공간입니다.',
          sortOrder: 0,
          isActive: true
        },
        {
          name: 'bug-report',
          displayName: '버그 제보',
          description: '버그를 발견하셨다면 여기에 제보해주세요.',
          sortOrder: 1,
          isActive: true
        },
        {
          name: 'feature-request',
          displayName: '기능 요청',
          description: '새로운 기능을 제안하는 공간입니다.',
          sortOrder: 2,
          isActive: true
        },
        {
          name: 'announcement',
          displayName: '공지사항',
          description: '중요한 공지사항을 확인하세요.',
          sortOrder: 3,
          isActive: true
        }
      ];

      const createdBoards = [];
      for (const boardData of sampleBoards) {
        // 기존 게시판이 있는지 확인
        const existingBoard = await prisma.board.findUnique({
          where: { name: boardData.name } as any
        });

        if (!existingBoard) {
          const board = await prisma.board.create({
            data: boardData
          });
          createdBoards.push(board);
        } else {
          createdBoards.push(existingBoard);
        }
      }

      // 샘플 카테고리들 생성
      const sampleCategories = [
        // 자유 토론 카테고리
        {
          boardId: createdBoards[0].id,
          name: '일상',
          sortOrder: 0,
          isActive: true
        },
        {
          boardId: createdBoards[0].id,
          name: '정보 공유',
          sortOrder: 1,
          isActive: true
        },
        {
          boardId: createdBoards[0].id,
          name: '질문',
          sortOrder: 2,
          isActive: true
        },
        // 버그 제보 카테고리
        {
          boardId: createdBoards[1].id,
          name: '치명적 버그',
          sortOrder: 0,
          isActive: true
        },
        {
          boardId: createdBoards[1].id,
          name: '사소한 버그',
          sortOrder: 1,
          isActive: true
        },
        {
          boardId: createdBoards[1].id,
          name: 'UI/UX 문제',
          sortOrder: 2,
          isActive: true
        },
        // 기능 요청 카테고리
        {
          boardId: createdBoards[2].id,
          name: '새로운 기능',
          sortOrder: 0,
          isActive: true
        },
        {
          boardId: createdBoards[2].id,
          name: '개선 사항',
          sortOrder: 1,
          isActive: true
        },
        {
          boardId: createdBoards[2].id,
          name: '사용자 경험',
          sortOrder: 2,
          isActive: true
        },
        // 공지사항 카테고리
        {
          boardId: createdBoards[3].id,
          name: '시스템 공지',
          sortOrder: 0,
          isActive: true
        },
        {
          boardId: createdBoards[3].id,
          name: '업데이트',
          sortOrder: 1,
          isActive: true
        },
        {
          boardId: createdBoards[3].id,
          name: '이벤트',
          sortOrder: 2,
          isActive: true
        }
      ];

      const createdCategories = [];
      for (const categoryData of sampleCategories) {
        // 기존 카테고리가 있는지 확인
        const existingCategory = await prisma.boardCategory.findFirst({
          where: {
            boardId: categoryData.boardId,
            name: categoryData.name
          }
        });

        if (!existingCategory) {
          const category = await prisma.boardCategory.create({
            data: categoryData
          });
          createdCategories.push(category);
        } else {
          createdCategories.push(existingCategory);
        }
      }

      await prisma.$disconnect();

      return c.json({
        success: true,
        data: {
          message: '샘플 데이터가 생성되었습니다.',
          boards: createdBoards.length,
          categories: createdCategories.length,
          details: {
            boards: createdBoards.map(board => ({
              id: board.id,
              name: board.name,
              displayName: board.displayName,
              sortOrder: board.sortOrder
            })),
            categories: createdCategories.map(category => ({
              id: category.id,
              name: category.name,
              boardId: category.boardId,
              sortOrder: category.sortOrder
            }))
          }
        }
      }, 201);
    } catch (error) {
      console.error('샘플 데이터 생성 오류:', error);
      return c.json({ success: false, message: '서버 오류가 발생했습니다.' }, 500);
    }
  },

  // 샘플 데이터 초기화 (모든 게시판과 카테고리 삭제)
  async resetSampleData(c: Context) {
    try {
      // 관리자 권한 확인
      const user = await getUserFromToken(c);
      if (!user || user.role !== 'admin') {
        return c.json({ success: false, message: '관리자 권한이 필요합니다.' }, 403);
      }

      const prisma = createPrismaClient(c.env.DB);

      // 모든 카테고리 삭제 (비활성화)
      const deletedCategories = await prisma.boardCategory.updateMany({
        where: {},
        data: { isActive: false }
      });

      // 모든 게시판 삭제 (비활성화)
      const deletedBoards = await prisma.board.updateMany({
        where: {},
        data: { isActive: false }
      });

      await prisma.$disconnect();

      return c.json({
        success: true,
        data: {
          message: '모든 게시판과 카테고리가 초기화되었습니다.',
          deletedBoards: deletedBoards.count,
          deletedCategories: deletedCategories.count
        }
      });
    } catch (error) {
      console.error('샘플 데이터 초기화 오류:', error);
      return c.json({ success: false, message: '서버 오류가 발생했습니다.' }, 500);
    }
  },
};
