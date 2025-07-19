import { Context } from 'hono';
import { createPrismaClient } from '../../common/prismaUtils';

export const commentApi = {
  // 댓글 목록 조회
  getComments: async (c: Context) => {
    try {
      const postId = parseInt(c.req.param('postId'));
      const page = parseInt(c.req.query('page') || '1');
      const limit = parseInt(c.req.query('limit') || '20');
      
      if (isNaN(postId)) {
        return c.json({
          success: false,
          message: '유효하지 않은 게시글 ID입니다.'
        }, 400);
      }

      const prisma = createPrismaClient(c.env.DB);
      const skip = (page - 1) * limit;

      const [comments, total] = await Promise.all([
        prisma.comment.findMany({
          where: {
            postId: postId,
            isDeleted: false,
            parentId: null // 최상위 댓글만 조회
          },
          include: {
            author: {
              select: {
                id: true,
                name: true,
                userName: true
              }
            },
            replies: {
              where: { isDeleted: false },
              include: {
                author: {
                  select: {
                    id: true,
                    name: true,
                    userName: true
                  }
                }
              },
              orderBy: { createdAt: 'asc' }
            },
            _count: {
              select: {
                commentLikes: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit
        }),
        prisma.comment.count({
          where: {
            postId: postId,
            isDeleted: false,
            parentId: null
          }
        })
      ]);

      await prisma.$disconnect();

      return c.json({
        success: true,
        data: comments,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('댓글 목록 조회 오류:', error);
      return c.json({
        success: false,
        message: '댓글 목록을 불러오는데 실패했습니다.'
      }, 500);
    }
  },

  // 댓글 작성
  createComment: async (c: Context) => {
    try {
      const body = await c.req.json();
      const { content, parentId } = body;
      
      // 사용자 정보 가져오기 (익명 사용자 허용)
      const user = c.get('user');
      const authorId = user?.id;

      if (!content) {
        return c.json({
          success: false,
          message: '댓글 내용은 필수입니다.'
        }, 400);
      }

      const prisma = createPrismaClient(c.env.DB);

      const comment = await prisma.comment.create({
        data: {
          content,
          postId: parseInt(c.req.param('postId')),
          parentId: parentId ? parseInt(parentId) : null,
          authorId: authorId || 1, // 익명 사용자의 경우 기본값 사용
          isDeleted: false
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              userName: true
            }
          }
        }
      });

      await prisma.$disconnect();

      return c.json({
        success: true,
        data: comment
      }, 201);
    } catch (error) {
      console.error('댓글 작성 오류:', error);
      return c.json({
        success: false,
        message: '댓글 작성에 실패했습니다.'
      }, 500);
    }
  },

  // 댓글 수정
  updateComment: async (c: Context) => {
    try {
      const commentId = parseInt(c.req.param('id'));
      const body = await c.req.json();
      const { content } = body;
      
      if (isNaN(commentId)) {
        return c.json({
          success: false,
          message: '유효하지 않은 댓글 ID입니다.'
        }, 400);
      }

      const prisma = createPrismaClient(c.env.DB);

      // 댓글 존재 확인 및 권한 체크
      const existingComment = await prisma.comment.findUnique({
        where: { id: commentId }
      });

      if (!existingComment) {
        await prisma.$disconnect();
        return c.json({
          success: false,
          message: '댓글을 찾을 수 없습니다.'
        }, 404);
      }

      // 수정 권한 체크 (작성자 또는 관리자만)
      const user = c.get('user');
      if (existingComment.authorId && user?.id !== existingComment.authorId && user?.role !== 'admin') {
        await prisma.$disconnect();
        return c.json({
          success: false,
          message: '댓글을 수정할 권한이 없습니다.'
        }, 403);
      }

      // 댓글 업데이트
      const updatedComment = await prisma.comment.update({
        where: { id: commentId },
        data: {
          content,
          updatedAt: new Date()
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              userName: true
            }
          }
        }
      });

      await prisma.$disconnect();

      return c.json({
        success: true,
        data: updatedComment
      });
    } catch (error) {
      console.error('댓글 수정 오류:', error);
      return c.json({
        success: false,
        message: '댓글 수정에 실패했습니다.'
      }, 500);
    }
  },

  // 댓글 삭제
  deleteComment: async (c: Context) => {
    try {
      const commentId = parseInt(c.req.param('id'));
      
      if (isNaN(commentId)) {
        return c.json({
          success: false,
          message: '유효하지 않은 댓글 ID입니다.'
        }, 400);
      }

      const prisma = createPrismaClient(c.env.DB);

      // 댓글 존재 확인 및 권한 체크
      const existingComment = await prisma.comment.findUnique({
        where: { id: commentId }
      });

      if (!existingComment) {
        await prisma.$disconnect();
        return c.json({
          success: false,
          message: '댓글을 찾을 수 없습니다.'
        }, 404);
      }

      // 삭제 권한 체크 (작성자 또는 관리자만)
      const user = c.get('user');
      if (existingComment.authorId && user?.id !== existingComment.authorId && user?.role !== 'admin') {
        await prisma.$disconnect();
        return c.json({
          success: false,
          message: '댓글을 삭제할 권한이 없습니다.'
        }, 403);
      }

      // 소프트 삭제
      await prisma.comment.update({
        where: { id: commentId },
        data: { isDeleted: true }
      });

      await prisma.$disconnect();

      return c.json({
        success: true,
        message: '댓글이 삭제되었습니다.'
      });
    } catch (error) {
      console.error('댓글 삭제 오류:', error);
      return c.json({
        success: false,
        message: '댓글 삭제에 실패했습니다.'
      }, 500);
    }
  }
}; 