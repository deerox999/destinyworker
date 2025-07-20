import { Context } from "hono";
import { createPrismaClient } from "../../common/prismaUtils";
import { getUserFromToken } from "../../common/utils";

export const adminCommunityApi = {
  // 게시판 목록 조회 (관리자용 - 전체)
  async getBoards(c: Context) {
    try {
      // 관리자 권한 확인
      const user = await getUserFromToken(c);
      if (!user || user.role !== 'admin') {
        return c.json({ success: false, message: '관리자 권한이 필요합니다.' }, 403);
      }

      const prisma = createPrismaClient(c.env.DB);
      
      const boards = await prisma.board.findMany({
        orderBy: { createdAt: "asc" },
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
      const user = await getUserFromToken(c);
      if (!user || user.role !== 'admin') {
        return c.json({ success: false, message: '관리자 권한이 필요합니다.' }, 403);
      }

      const body = await c.req.json();
      const { name, displayName, description, isActive = true } = body;

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
      const user = await getUserFromToken(c);
      if (!user || user.role !== 'admin') {
        return c.json({ success: false, message: '관리자 권한이 필요합니다.' }, 403);
      }

      const { boardId } = c.req.param();
      const body = await c.req.json();
      const { displayName, description, isActive } = body;

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
      const user = await getUserFromToken(c);
      if (!user || user.role !== 'admin') {
        return c.json({ success: false, message: '관리자 권한이 필요합니다.' }, 403);
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
      const user = await getUserFromToken(c);
      if (!user || user.role !== 'admin') {
        return c.json({ success: false, message: '관리자 권한이 필요합니다.' }, 403);
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
      const user = await getUserFromToken(c);
      if (!user || user.role !== 'admin') {
        return c.json({ success: false, message: '관리자 권한이 필요합니다.' }, 403);
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
      const user = await getUserFromToken(c);
      if (!user || user.role !== 'admin') {
        return c.json({ success: false, message: '관리자 권한이 필요합니다.' }, 403);
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
      const user = await getUserFromToken(c);
      if (!user || user.role !== 'admin') {
        return c.json({ success: false, message: '관리자 권한이 필요합니다.' }, 403);
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
};
