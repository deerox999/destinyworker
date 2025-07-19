import { Context } from 'hono';
import { createPrismaClient } from '../../common/prismaUtils';

export const boardApi = {
  // 게시판 목록 조회
  getBoards: async (c: Context) => {
    try {
      const prisma = createPrismaClient(c.env.DB);
      
      const boards = await prisma.board.findMany({
        where: {
          isActive: true
        },
        orderBy: {
          id: 'asc'
        }
      });

      await prisma.$disconnect();

      return c.json({
        success: true,
        data: boards
      });
    } catch (error) {
      console.error('게시판 목록 조회 오류:', error);
      return c.json({
        success: false,
        message: '게시판 목록을 불러오는데 실패했습니다.'
      }, 500);
    }
  },

  // 게시판별 카테고리 조회
  getBoardCategories: async (c: Context) => {
    try {
      const boardId = parseInt(c.req.param('id'));
      
      if (isNaN(boardId)) {
        return c.json({
          success: false,
          message: '유효하지 않은 게시판 ID입니다.'
        }, 400);
      }

      const prisma = createPrismaClient(c.env.DB);

      const categories = await prisma.boardCategory.findMany({
        where: {
          boardId: boardId,
          isActive: true
        },
        orderBy: [
          { sortOrder: 'asc' },
          { id: 'asc' }
        ]
      });

      await prisma.$disconnect();

      return c.json({
        success: true,
        data: categories
      });
    } catch (error) {
      console.error('게시판 카테고리 조회 오류:', error);
      return c.json({
        success: false,
        message: '카테고리 목록을 불러오는데 실패했습니다.'
      }, 500);
    }
  }
}; 