import { Context } from "hono";
import { createPrismaClient, isAdmin } from "../../common/prismaUtils";
import { getUserFromToken } from "../../common/utils";

export const adminCommunityApi = {
  // 게시판 목록 조회 (관리자용 - 전체)
  async getBoards(c: Context) {
    try {
      // 관리자 권한 확인
      if (!(await isAdmin(c))) {
        return c.json({ error: "관리자 권한이 필요합니다." }, 403);
      }

      const prisma = createPrismaClient(c.env.DB);
      
      const boards = await prisma.board.findMany({
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
      const { name, displayName, description, sortOrder = 0, isActive = true } = body;

      const prisma = createPrismaClient(c.env.DB);

      // 게시판명 중복 확인
      const existingBoard = await prisma.board.findUnique({
        where: { name },
      });

      if (existingBoard) {
        await prisma.$disconnect();
        return c.json(
          { success: false, message: "이미 존재하는 게시판명입니다." },
          409
        );
      }

      const board = await prisma.board.create({
        data: {
          name,
          displayName,
          description,
          sortOrder,
          isActive,
        },
      });

      await prisma.$disconnect();

      return c.json(
        {
          success: true,
          data: board,
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

      const prisma = createPrismaClient(c.env.DB);

      const board = await prisma.board.findUnique({
        where: { id: parseInt(boardId) },
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

      const prisma = createPrismaClient(c.env.DB);

      const board = await prisma.board.findUnique({
        where: { id: parseInt(boardId) },
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

      const prisma = createPrismaClient(c.env.DB);

      const board = await prisma.board.findUnique({
        where: { id: parseInt(boardId) },
      });

      if (!board) {
        await prisma.$disconnect();
        return c.json(
          { success: false, message: "게시판을 찾을 수 없습니다." },
          404
        );
      }

      const categories = await prisma.boardCategory.findMany({
        where: { boardId: parseInt(boardId) },
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
      const { name, sortOrder = 0, isActive = true } = body;

      const prisma = createPrismaClient(c.env.DB);

      // 게시판 존재 확인
      const board = await prisma.board.findUnique({
        where: { id: parseInt(boardId) },
      });

      if (!board) {
        await prisma.$disconnect();
        return c.json(
          { success: false, message: "게시판을 찾을 수 없습니다." },
          404
        );
      }

      // 카테고리명 중복 확인 (같은 게시판 내에서)
      const existingCategory = await prisma.boardCategory.findFirst({
        where: {
          boardId: parseInt(boardId),
          name: name,
        },
      });

      if (existingCategory) {
        await prisma.$disconnect();
        return c.json(
          { success: false, message: "이미 존재하는 카테고리명입니다." },
          409
        );
      }

      const category = await prisma.boardCategory.create({
        data: {
          boardId: parseInt(boardId),
          name,
          sortOrder,
          isActive,
        },
      });

      await prisma.$disconnect();

      return c.json(
        {
          success: true,
          data: category,
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

      const prisma = createPrismaClient(c.env.DB);

      const category = await prisma.boardCategory.findUnique({
        where: { id: parseInt(categoryId) },
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

      const prisma = createPrismaClient(c.env.DB);

      const category = await prisma.boardCategory.findUnique({
        where: { id: parseInt(categoryId) },
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
          where: { name: boardData.name }
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
