import { Context } from 'hono';
import { createPrismaClient } from '../../common/prismaUtils';

export const tagApi = {
  // 태그 목록 조회
  getTags: async (c: Context) => {
    try {
      const prisma = createPrismaClient(c.env.DB);
      
      const tags = await prisma.tag.findMany({
        orderBy: {
          name: 'asc'
        }
      });

      await prisma.$disconnect();

      return c.json({
        success: true,
        data: tags
      });
    } catch (error) {
      console.error('태그 목록 조회 오류:', error);
      return c.json({
        success: false,
        message: '태그 목록을 불러오는데 실패했습니다.'
      }, 500);
    }
  },

  // 태그 생성
  createTag: async (c: Context) => {
    try {
      const body = await c.req.json();
      const { name } = body;
      
      if (!name) {
        return c.json({
          success: false,
          message: '태그 이름은 필수입니다.'
        }, 400);
      }

      const prisma = createPrismaClient(c.env.DB);

      // 중복 태그 확인
      const existingTag = await prisma.tag.findUnique({
        where: { name }
      });

      if (existingTag) {
        await prisma.$disconnect();
        return c.json({
          success: false,
          message: '이미 존재하는 태그입니다.'
        }, 400);
      }

      const tag = await prisma.tag.create({
        data: { name }
      });

      await prisma.$disconnect();

      return c.json({
        success: true,
        data: tag
      }, 201);
    } catch (error) {
      console.error('태그 생성 오류:', error);
      return c.json({
        success: false,
        message: '태그 생성에 실패했습니다.'
      }, 500);
    }
  },

  // 태그 삭제
  deleteTag: async (c: Context) => {
    try {
      const tagId = parseInt(c.req.param('id'));
      
      if (isNaN(tagId)) {
        return c.json({
          success: false,
          message: '유효하지 않은 태그 ID입니다.'
        }, 400);
      }

      const prisma = createPrismaClient(c.env.DB);

      // 태그 존재 확인
      const existingTag = await prisma.tag.findUnique({
        where: { id: tagId }
      });

      if (!existingTag) {
        await prisma.$disconnect();
        return c.json({
          success: false,
          message: '태그를 찾을 수 없습니다.'
        }, 404);
      }

      // 태그 삭제 (연결된 게시글-태그 관계도 함께 삭제됨)
      await prisma.tag.delete({
        where: { id: tagId }
      });

      await prisma.$disconnect();

      return c.json({
        success: true,
        message: '태그가 삭제되었습니다.'
      });
    } catch (error) {
      console.error('태그 삭제 오류:', error);
      return c.json({
        success: false,
        message: '태그 삭제에 실패했습니다.'
      }, 500);
    }
  }
}; 