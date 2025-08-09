import { Context } from "hono";
import { createPrismaClient, isAdmin } from "../../common/prismaUtils";
import { requireLanguageParam, supportedLanguages } from "../../common/utils";

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
};
