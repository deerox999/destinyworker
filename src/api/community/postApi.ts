import { Context } from 'hono';
import { createPrismaClient } from '../../common/prismaUtils';

export const postApi = {
  // 게시글 목록 조회
  getPosts: async (c: Context) => {
    try {
      const boardId = parseInt(c.req.param('boardId'));
      const page = parseInt(c.req.query('page') || '1');
      const limit = parseInt(c.req.query('limit') || '10');
      const categoryId = c.req.query('categoryId');
      const search = c.req.query('search');
      
      if (isNaN(boardId)) {
        return c.json({
          success: false,
          message: '유효하지 않은 게시판 ID입니다.'
        }, 400);
      }

      const prisma = createPrismaClient(c.env.DB);
      const skip = (page - 1) * limit;

      // 검색 조건 구성
      const where: any = {
        boardId: boardId,
        isDeleted: false
      };

      if (categoryId && !isNaN(parseInt(categoryId))) {
        where.categoryId = parseInt(categoryId);
      }

      if (search) {
        where.OR = [
          { title: { contains: search } },
          { content: { contains: search } }
        ];
      }

      const [posts, total] = await Promise.all([
        prisma.post.findMany({
          where,
          include: {
            author: {
              select: {
                id: true,
                name: true,
                userName: true
              }
            },
            category: {
              select: {
                id: true,
                name: true
              }
            },
            _count: {
              select: {
                comments: true,
                postLikes: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          skip,
          take: limit
        }),
        prisma.post.count({ where })
      ]);

      await prisma.$disconnect();

      return c.json({
        success: true,
        data: posts,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('게시글 목록 조회 오류:', error);
      return c.json({
        success: false,
        message: '게시글 목록을 불러오는데 실패했습니다.'
      }, 500);
    }
  },

  // 게시글 상세 조회
  getPost: async (c: Context) => {
    try {
      const postId = parseInt(c.req.param('id'));
      
      if (isNaN(postId)) {
        return c.json({
          success: false,
          message: '유효하지 않은 게시글 ID입니다.'
        }, 400);
      }

      const prisma = createPrismaClient(c.env.DB);

      const post = await prisma.post.findUnique({
        where: {
          id: postId
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              userName: true
            }
          },
          category: {
            select: {
              id: true,
              name: true
            }
          },
          postTags: {
            include: {
              tag: true
            }
          },
          _count: {
            select: {
              comments: true,
              postLikes: true
            }
          }
        }
      });

      await prisma.$disconnect();

      if (!post || post.isDeleted) {
        return c.json({
          success: false,
          message: '게시글을 찾을 수 없습니다.'
        }, 404);
      }

      return c.json({
        success: true,
        data: post
      });
    } catch (error) {
      console.error('게시글 상세 조회 오류:', error);
      return c.json({
        success: false,
        message: '게시글을 불러오는데 실패했습니다.'
      }, 500);
    }
  },

  // 게시글 작성
  createPost: async (c: Context) => {
    try {
      const body = await c.req.json();
      const { title, content, categoryId, tagIds } = body;
      
      // 사용자 정보 가져오기 (익명 사용자 허용)
      const user = c.get('user');
      const authorId = user?.id;

      if (!title || !content) {
        return c.json({
          success: false,
          message: '제목과 내용은 필수입니다.'
        }, 400);
      }

      const prisma = createPrismaClient(c.env.DB);

      // 기본 카테고리 조회 (카테고리가 지정되지 않은 경우)
      let finalCategoryId = categoryId ? parseInt(categoryId) : null;
      if (!finalCategoryId) {
        const defaultCategory = await prisma.boardCategory.findFirst({
          where: {
            boardId: parseInt(c.req.param('boardId')),
            isActive: true
          },
          orderBy: { sortOrder: 'asc' }
        });
        finalCategoryId = defaultCategory?.id || 1; // 기본값으로 1 사용
      }

      const post = await prisma.post.create({
        data: {
          title,
          content,
          boardId: parseInt(c.req.param('boardId')),
          categoryId: finalCategoryId,
          authorId: authorId || 1, // 익명 사용자의 경우 기본값 사용
          isDeleted: false
        }
      });

      // 태그 연결
      if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
        await prisma.postTag.createMany({
          data: tagIds.map((tagId: number) => ({
            postId: post.id,
            tagId
          }))
        });
      }

      await prisma.$disconnect();

      return c.json({
        success: true,
        data: post
      }, 201);
    } catch (error) {
      console.error('게시글 작성 오류:', error);
      return c.json({
        success: false,
        message: '게시글 작성에 실패했습니다.'
      }, 500);
    }
  },

  // 게시글 수정
  updatePost: async (c: Context) => {
    try {
      const postId = parseInt(c.req.param('id'));
      const body = await c.req.json();
      const { title, content, categoryId, tagIds } = body;
      
      if (isNaN(postId)) {
        return c.json({
          success: false,
          message: '유효하지 않은 게시글 ID입니다.'
        }, 400);
      }

      const prisma = createPrismaClient(c.env.DB);

      // 게시글 존재 확인 및 권한 체크
      const existingPost = await prisma.post.findUnique({
        where: { id: postId }
      });

      if (!existingPost) {
        await prisma.$disconnect();
        return c.json({
          success: false,
          message: '게시글을 찾을 수 없습니다.'
        }, 404);
      }

      // 수정 권한 체크 (작성자 또는 관리자만)
      const user = c.get('user');
      if (existingPost.authorId && user?.id !== existingPost.authorId && user?.role !== 'admin') {
        await prisma.$disconnect();
        return c.json({
          success: false,
          message: '게시글을 수정할 권한이 없습니다.'
        }, 403);
      }

      // 게시글 업데이트
      const updatedPost = await prisma.post.update({
        where: { id: postId },
        data: {
          title,
          content,
          categoryId: categoryId ? parseInt(categoryId) : undefined,
          updatedAt: new Date()
        }
      });

      // 태그 업데이트
      if (tagIds !== undefined) {
        // 기존 태그 삭제
        await prisma.postTag.deleteMany({
          where: { postId }
        });

        // 새 태그 추가
        if (Array.isArray(tagIds) && tagIds.length > 0) {
          await prisma.postTag.createMany({
            data: tagIds.map((tagId: number) => ({
              postId,
              tagId
            }))
          });
        }
      }

      await prisma.$disconnect();

      return c.json({
        success: true,
        data: updatedPost
      });
    } catch (error) {
      console.error('게시글 수정 오류:', error);
      return c.json({
        success: false,
        message: '게시글 수정에 실패했습니다.'
      }, 500);
    }
  },

  // 게시글 삭제
  deletePost: async (c: Context) => {
    try {
      const postId = parseInt(c.req.param('id'));
      
      if (isNaN(postId)) {
        return c.json({
          success: false,
          message: '유효하지 않은 게시글 ID입니다.'
        }, 400);
      }

      const prisma = createPrismaClient(c.env.DB);

      // 게시글 존재 확인 및 권한 체크
      const existingPost = await prisma.post.findUnique({
        where: { id: postId }
      });

      if (!existingPost) {
        await prisma.$disconnect();
        return c.json({
          success: false,
          message: '게시글을 찾을 수 없습니다.'
        }, 404);
      }

      // 삭제 권한 체크 (작성자 또는 관리자만)
      const user = c.get('user');
      if (existingPost.authorId && user?.id !== existingPost.authorId && user?.role !== 'admin') {
        await prisma.$disconnect();
        return c.json({
          success: false,
          message: '게시글을 삭제할 권한이 없습니다.'
        }, 403);
      }

      // 소프트 삭제
      await prisma.post.update({
        where: { id: postId },
        data: { isDeleted: true }
      });

      await prisma.$disconnect();

      return c.json({
        success: true,
        message: '게시글이 삭제되었습니다.'
      });
    } catch (error) {
      console.error('게시글 삭제 오류:', error);
      return c.json({
        success: false,
        message: '게시글 삭제에 실패했습니다.'
      }, 500);
    }
  }
}; 