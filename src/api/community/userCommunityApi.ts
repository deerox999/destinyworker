import { Context } from "hono";
import { createPrismaClient } from "../../common/prismaUtils";
import { getUserFromToken } from "../../common/utils";

export const userCommunityApi = {
  // 커뮤니티 전체 데이터 조회
  async getCommunityData(c: Context) {
    try {
      const prisma = createPrismaClient(c.env.DB);
      
      const boards = await prisma.board.findMany({
        where: { isActive: true },
        include: {
          categories: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' }
          },
          posts: {
            where: { isDeleted: false },
            orderBy: { createdAt: 'desc' },
            take: 5,
            include: {
              category: true,
              postTags: {
                include: {
                  tag: true
                }
              },
              _count: {
                select: { comments: true }
              }
            }
          }
        },
        orderBy: { createdAt: 'asc' }
      });

      // 최근 게시글 (전체)
      const recentPosts = await prisma.post.findMany({
        where: { isDeleted: false },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          board: true,
          category: true,
          postTags: {
            include: {
              tag: true
            }
          },
          _count: {
            select: { comments: true }
          }
        }
      });

      // 인기 게시글 (좋아요 기준)
      const popularPosts = await prisma.post.findMany({
        where: { isDeleted: false },
        orderBy: { likeCount: 'desc' },
        take: 10,
        include: {
          board: true,
          category: true,
          postTags: {
            include: {
              tag: true
            }
          },
          _count: {
            select: { comments: true }
          }
        }
      });

      // 게시판별 최근 게시글 추가
      const boardsWithRecentPosts = boards.map(board => ({
        ...board,
        recentPosts: board.posts.map(post => ({
          id: post.id,
          title: post.title,
          authorName: post.authorName || '익명',
          isAnonymous: !post.authorId,
          tags: post.postTags.map(pt => pt.tag.name),
          viewCount: post.viewCount,
          likeCount: post.likeCount,
          commentCount: post._count.comments,
          createdAt: post.createdAt
        }))
      }));

      await prisma.$disconnect();

      return c.json({
        success: true,
        data: {
          boards: boardsWithRecentPosts.map(board => ({
            id: board.id,
            name: board.name,
            displayName: board.displayName,
            description: board.description,
            isActive: board.isActive,
            createdAt: board.createdAt,
            updatedAt: board.updatedAt,
            categories: board.categories.map(cat => ({
              id: cat.id,
              name: cat.name,
              sortOrder: cat.sortOrder,
              isActive: cat.isActive
            })),
            recentPosts: board.recentPosts
          })),
          recentPosts: recentPosts.map(post => ({
            id: post.id,
            boardId: post.boardId,
            title: post.title,
            authorName: post.authorName || '익명',
            isAnonymous: !post.authorId,
            tags: post.postTags.map(pt => pt.tag.name),
            viewCount: post.viewCount,
            likeCount: post.likeCount,
            commentCount: post._count.comments,
            createdAt: post.createdAt
          })),
          popularPosts: popularPosts.map(post => ({
            id: post.id,
            boardId: post.boardId,
            title: post.title,
            authorName: post.authorName || '익명',
            isAnonymous: !post.authorId,
            tags: post.postTags.map(pt => pt.tag.name),
            viewCount: post.viewCount,
            likeCount: post.likeCount,
            commentCount: post._count.comments,
            createdAt: post.createdAt
          }))
        }
      });
    } catch (error) {
      console.error('커뮤니티 데이터 조회 오류:', error);
      return c.json({ success: false, message: '서버 오류가 발생했습니다.' }, 500);
    }
  },

  // 게시판 목록 조회
  async getBoards(c: Context) {
    try {
      const prisma = createPrismaClient(c.env.DB);
      
      const boards = await prisma.board.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' }
      });

      await prisma.$disconnect();

      return c.json({
        success: true,
        data: boards
      });
    } catch (error) {
      console.error('게시판 목록 조회 오류:', error);
      return c.json({ success: false, message: '서버 오류가 발생했습니다.' }, 500);
    }
  },

  // 특정 게시판 데이터 조회
  async getBoardData(c: Context) {
    try {
      const { boardId } = c.req.param();
      const { page = 1, limit = 10, categoryId, sort = 'newest', search, tags } = c.req.query();

      const prisma = createPrismaClient(c.env.DB);

      const board = await prisma.board.findUnique({
        where: { id: parseInt(boardId), isActive: true }
      });

      if (!board) {
        await prisma.$disconnect();
        return c.json({ success: false, message: '게시판을 찾을 수 없습니다.' }, 404);
      }

      // 카테고리 조회
      const categories = await prisma.boardCategory.findMany({
        where: { boardId: parseInt(boardId), isActive: true },
        orderBy: { sortOrder: 'asc' }
      });

      // 게시글 조회 조건 구성
      const where: any = {
        boardId: parseInt(boardId),
        isDeleted: false
      };

      if (categoryId && categoryId !== 'all') {
        where.categoryId = parseInt(categoryId);
      }

      if (search) {
        where.OR = [
          { title: { contains: search } },
          { content: { contains: search } }
        ];
      }

      if (tags) {
        const tagArray = tags.split(',').map(tag => tag.trim());
        where.postTags = {
          some: {
            tag: {
              name: { in: tagArray }
            }
          }
        };
      }

      // 정렬 조건
      let orderBy: any = {};
      switch (sort) {
        case 'oldest':
          orderBy.createdAt = 'asc';
          break;
        case 'popular':
          orderBy.likeCount = 'desc';
          break;
        case 'views':
          orderBy.viewCount = 'desc';
          break;
        default: // newest
          orderBy.createdAt = 'desc';
      }

      // 페이징
      const pageNum = typeof page === 'string' ? parseInt(page) : page;
      const limitNum = typeof limit === 'string' ? parseInt(limit) : limit;
      const skip = (pageNum - 1) * limitNum;
      const take = limitNum;

      const [posts, total] = await Promise.all([
        prisma.post.findMany({
          where,
          orderBy,
          skip,
          take,
          include: {
            category: true,
            postTags: {
              include: {
                tag: true
              }
            },
            _count: {
              select: { comments: true }
            }
          }
        }),
        prisma.post.count({ where })
      ]);

      const totalPages = Math.ceil(total / take);

      await prisma.$disconnect();

      return c.json({
        success: true,
        data: {
          board: {
            id: board.id,
            name: board.name,
            displayName: board.displayName,
            description: board.description,
            isActive: board.isActive,
            createdAt: board.createdAt,
            updatedAt: board.updatedAt
          },
          categories: categories.map(cat => ({
            id: cat.id,
            name: cat.name,
            sortOrder: cat.sortOrder,
            isActive: cat.isActive
          })),
          posts: posts.map(post => ({
            id: post.id,
            title: post.title,
            authorName: post.authorName || '익명',
            isAnonymous: !post.authorId,
            tags: post.postTags.map(pt => pt.tag.name),
            viewCount: post.viewCount,
            likeCount: post.likeCount,
            commentCount: post._count.comments,
            createdAt: post.createdAt,
            category: post.category ? {
              id: post.category.id,
              name: post.category.name
            } : null
          })),
          pagination: {
            page: pageNum,
            limit: take,
            total,
            totalPages,
            hasNext: pageNum < totalPages,
            hasPrev: pageNum > 1
          }
        }
      });
    } catch (error) {
      console.error('게시판 데이터 조회 오류:', error);
      return c.json({ success: false, message: '서버 오류가 발생했습니다.' }, 500);
    }
  },

  // 게시글 목록 조회
  async getPosts(c: Context) {
    try {
      const { page = 1, limit = 20, boardId, categoryId, search, tags, sort = 'newest' } = c.req.query();

      const prisma = createPrismaClient(c.env.DB);

      const where: any = { isDeleted: false };

      if (boardId) {
        where.boardId = parseInt(boardId);
      }

      if (categoryId) {
        where.categoryId = parseInt(categoryId);
      }

      if (search) {
        where.OR = [
          { title: { contains: search } },
          { content: { contains: search } }
        ];
      }

      if (tags) {
        const tagArray = tags.split(',').map(tag => tag.trim());
        where.postTags = {
          some: {
            tag: {
              name: { in: tagArray }
            }
          }
        };
      }

      // 정렬 조건
      let orderBy: any = {};
      switch (sort) {
        case 'oldest':
          orderBy.createdAt = 'asc';
          break;
        case 'popular':
          orderBy.likeCount = 'desc';
          break;
        case 'views':
          orderBy.viewCount = 'desc';
          break;
        default: // newest
          orderBy.createdAt = 'desc';
      }

      const pageNum = typeof page === 'string' ? parseInt(page) : page;
      const limitNum = typeof limit === 'string' ? parseInt(limit) : limit;
      const skip = (pageNum - 1) * limitNum;
      const take = limitNum;

      const [posts, total] = await Promise.all([
        prisma.post.findMany({
          where,
          orderBy,
          skip,
          take,
          include: {
            board: true,
            category: true,
            postTags: {
              include: {
                tag: true
              }
            },
            _count: {
              select: { comments: true }
            }
          }
        }),
        prisma.post.count({ where })
      ]);

      const totalPages = Math.ceil(total / take);

      await prisma.$disconnect();

      return c.json({
        success: true,
        data: {
          posts: posts.map(post => ({
            id: post.id,
            title: post.title,
            content: post.content,
            authorName: post.authorName || '익명',
            isAnonymous: !post.authorId,
            tags: post.postTags.map(pt => pt.tag.name),
            viewCount: post.viewCount,
            likeCount: post.likeCount,
            commentCount: post._count.comments,
            createdAt: post.createdAt,
            updatedAt: post.updatedAt,
            board: {
              id: post.board.id,
              name: post.board.name,
              displayName: post.board.displayName
            },
            category: post.category ? {
              id: post.category.id,
              name: post.category.name
            } : null
          })),
          pagination: {
            page: pageNum,
            limit: take,
            total,
            totalPages
          }
        }
      });
    } catch (error) {
      console.error('게시글 목록 조회 오류:', error);
      return c.json({ success: false, message: '서버 오류가 발생했습니다.' }, 500);
    }
  },

  // 게시글 상세 조회
  async getPost(c: Context) {
    try {
      const { id } = c.req.param();

      const prisma = createPrismaClient(c.env.DB);

      const post = await prisma.post.findUnique({
        where: { id: parseInt(id), isDeleted: false },
        include: {
          board: true,
          category: true,
          postTags: {
            include: {
              tag: true
            }
          },
          _count: {
            select: { comments: true }
          }
        }
      });

      if (!post) {
        await prisma.$disconnect();
        return c.json({ success: false, message: '게시글을 찾을 수 없습니다.' }, 404);
      }

      // 조회수 증가
      await prisma.post.update({
        where: { id: parseInt(id) },
        data: { viewCount: { increment: 1 } }
      });

      await prisma.$disconnect();

      return c.json({
        success: true,
        data: {
          id: post.id,
          title: post.title,
          content: post.content,
          authorName: post.authorName || '익명',
          isAnonymous: !post.authorId,
          tags: post.postTags.map(pt => pt.tag.name),
          viewCount: post.viewCount + 1, // 증가된 조회수 반영
          likeCount: post.likeCount,
          commentCount: post._count.comments,
          createdAt: post.createdAt,
          updatedAt: post.updatedAt,
          board: {
            id: post.board.id,
            name: post.board.name,
            displayName: post.board.displayName
          },
          category: post.category ? {
            id: post.category.id,
            name: post.category.name
          } : null
        }
      });
    } catch (error) {
      console.error('게시글 상세 조회 오류:', error);
      return c.json({ success: false, message: '서버 오류가 발생했습니다.' }, 500);
    }
  },

  // 게시글 작성
  async createPost(c: Context) {
    try {
      const body = await c.req.json();
      const { title, content, boardId, categoryId, isAnonymous = false, password, tags = [] } = body;

      const prisma = createPrismaClient(c.env.DB);

      // 게시판 존재 확인
      const board = await prisma.board.findUnique({
        where: { id: boardId, isActive: true }
      });

      if (!board) {
        await prisma.$disconnect();
        return c.json({ success: false, message: '존재하지 않는 게시판입니다.' }, 400);
      }

      // 카테고리 존재 확인 (선택사항)
      if (categoryId) {
        const category = await prisma.boardCategory.findUnique({
          where: { id: categoryId, boardId, isActive: true }
        });

        if (!category) {
          await prisma.$disconnect();
          return c.json({ success: false, message: '존재하지 않는 카테고리입니다.' }, 400);
        }
      }

      // 익명 게시글인 경우 비밀번호 필수
      if (isAnonymous && !password) {
        await prisma.$disconnect();
        return c.json({ success: false, message: '익명 게시글은 비밀번호가 필요합니다.' }, 400);
      }

      // 로그인한 사용자 정보 가져오기
      let user = null;
      let authorId = null;
      let authorName = '익명';

      if (!isAnonymous) {
        user = await getUserFromToken(c);
        if (!user) {
          await prisma.$disconnect();
          return c.json({ success: false, message: '로그인이 필요합니다.' }, 401);
        }
        authorId = user.id;
        
        // 사용자 정보 조회
        const userInfo = await prisma.user.findUnique({
          where: { id: user.id },
          select: { name: true, userName: true }
        });
        authorName = userInfo?.userName || userInfo?.name || '사용자';
      }

      // 게시글 생성
      const post = await prisma.post.create({
        data: {
          title,
          content,
          boardId,
          categoryId: categoryId || 1, // 기본 카테고리
          authorId,
          authorName,
          password: isAnonymous ? password : null,
          viewCount: 0,
          likeCount: 0,
          commentCount: 0,
          isDeleted: false
        }
      });

      // 태그 처리
      if (tags.length > 0) {
        for (const tagName of tags) {
          // 태그가 없으면 생성
          let tag = await prisma.tag.findUnique({
            where: { name: tagName }
          });

          if (!tag) {
            tag = await prisma.tag.create({
              data: { name: tagName }
            });
          }

          // 게시글과 태그 연결
          await prisma.postTag.create({
            data: {
              postId: post.id,
              tagId: tag.id
            }
          });
        }
      }

      await prisma.$disconnect();

      return c.json({
        success: true,
        data: {
          id: post.id,
          title: post.title,
          content: post.content,
          authorName: post.authorName,
          isAnonymous: !post.authorId,
          tags,
          createdAt: post.createdAt
        }
      }, 201);
    } catch (error) {
      console.error('게시글 작성 오류:', error);
      return c.json({ success: false, message: '서버 오류가 발생했습니다.' }, 500);
    }
  },

  // 게시글 수정
  async updatePost(c: Context) {
    try {
      const { id } = c.req.param();
      const body = await c.req.json();
      const { title, content, categoryId, password, tags } = body;

      const prisma = createPrismaClient(c.env.DB);

      const post = await prisma.post.findUnique({
        where: { id: parseInt(id), isDeleted: false }
      });

      if (!post) {
        await prisma.$disconnect();
        return c.json({ success: false, message: '게시글을 찾을 수 없습니다.' }, 404);
      }

      // 권한 확인
      const user = await getUserFromToken(c);
      const isAdmin = user?.role === 'admin';
      const isAuthor = user && post.authorId === user.id;

      if (!isAuthor && !isAdmin) {
        // 익명 게시글인 경우 비밀번호 확인
        if (!post.authorId && post.password !== password) {
          await prisma.$disconnect();
          return c.json({ success: false, message: '비밀번호가 일치하지 않습니다.' }, 403);
        }
        
        if (!post.authorId && !password) {
          await prisma.$disconnect();
          return c.json({ success: false, message: '권한이 없습니다.' }, 403);
        }
      }

      // 카테고리 존재 확인 (선택사항)
      if (categoryId) {
        const category = await prisma.boardCategory.findUnique({
          where: { id: categoryId, boardId: post.boardId, isActive: true }
        });

        if (!category) {
          await prisma.$disconnect();
          return c.json({ success: false, message: '존재하지 않는 카테고리입니다.' }, 400);
        }
      }

      // 게시글 수정
      const updatedPost = await prisma.post.update({
        where: { id: parseInt(id) },
        data: {
          ...(title && { title }),
          ...(content && { content }),
          ...(categoryId && { categoryId }),
          updatedAt: new Date()
        }
      });

      // 태그 처리
      if (tags) {
        // 기존 태그 연결 삭제
        await prisma.postTag.deleteMany({
          where: { postId: parseInt(id) }
        });

        // 새 태그 연결
        for (const tagName of tags) {
          let tag = await prisma.tag.findUnique({
            where: { name: tagName }
          });

          if (!tag) {
            tag = await prisma.tag.create({
              data: { name: tagName }
            });
          }

          await prisma.postTag.create({
            data: {
              postId: parseInt(id),
              tagId: tag.id
            }
          });
        }
      }

      await prisma.$disconnect();

      return c.json({
        success: true,
        data: {
          id: updatedPost.id,
          title: updatedPost.title,
          content: updatedPost.content,
          tags: tags || [],
          updatedAt: updatedPost.updatedAt
        }
      });
    } catch (error) {
      console.error('게시글 수정 오류:', error);
      return c.json({ success: false, message: '서버 오류가 발생했습니다.' }, 500);
    }
  },

  // 게시글 삭제
  async deletePost(c: Context) {
    try {
      const { id } = c.req.param();
      const body = await c.req.json();
      const { password } = body;

      const prisma = createPrismaClient(c.env.DB);

      const post = await prisma.post.findUnique({
        where: { id: parseInt(id), isDeleted: false }
      });

      if (!post) {
        await prisma.$disconnect();
        return c.json({ success: false, message: '게시글을 찾을 수 없습니다.' }, 404);
      }

      // 권한 확인
      const user = await getUserFromToken(c);
      const isAdmin = user?.role === 'admin';
      const isAuthor = user && post.authorId === user.id;

      if (!isAuthor && !isAdmin) {
        // 익명 게시글인 경우 비밀번호 확인
        if (!post.authorId && post.password !== password) {
          await prisma.$disconnect();
          return c.json({ success: false, message: '비밀번호가 일치하지 않습니다.' }, 403);
        }
        
        if (!post.authorId && !password) {
          await prisma.$disconnect();
          return c.json({ success: false, message: '권한이 없습니다.' }, 403);
        }
      }

      // 물리적 삭제가 아닌 비활성화
      await prisma.post.update({
        where: { id: parseInt(id) },
        data: { isDeleted: true }
      });

      await prisma.$disconnect();

      return c.json({
        success: true,
        message: '게시글이 삭제되었습니다.'
      });
    } catch (error) {
      console.error('게시글 삭제 오류:', error);
      return c.json({ success: false, message: '서버 오류가 발생했습니다.' }, 500);
    }
  },

  // 게시글 추천/취소
  async togglePostLike(c: Context) {
    try {
      const { id } = c.req.param();

      const prisma = createPrismaClient(c.env.DB);

      const post = await prisma.post.findUnique({
        where: { id: parseInt(id), isDeleted: false }
      });

      if (!post) {
        await prisma.$disconnect();
        return c.json({ success: false, message: '게시글을 찾을 수 없습니다.' }, 400);
      }

      // 로그인한 사용자 확인
      const user = await getUserFromToken(c);
      if (!user) {
        await prisma.$disconnect();
        return c.json({ success: false, message: '로그인이 필요합니다.' }, 401);
      }

      // 기존 추천 확인
      const existingLike = await prisma.postLike.findUnique({
        where: {
          postId_userId: {
            postId: parseInt(id),
            userId: user.id
          }
        }
      });

      if (existingLike) {
        // 추천 취소
        await prisma.postLike.delete({
          where: { id: existingLike.id }
        });

        await prisma.post.update({
          where: { id: parseInt(id) },
          data: { likeCount: { decrement: 1 } }
        });

        await prisma.$disconnect();

        return c.json({
          success: true,
          data: { liked: false }
        });
      } else {
        // 추천 추가
        await prisma.postLike.create({
          data: {
            postId: parseInt(id),
            userId: user.id
          }
        });

        await prisma.post.update({
          where: { id: parseInt(id) },
          data: { likeCount: { increment: 1 } }
        });

        await prisma.$disconnect();

        return c.json({
          success: true,
          data: { liked: true }
        });
      }
    } catch (error) {
      console.error('게시글 추천 오류:', error);
      return c.json({ success: false, message: '서버 오류가 발생했습니다.' }, 500);
    }
  },

  // 게시글 댓글 목록
  async getPostComments(c: Context) {
    try {
      const { id } = c.req.param();
      const { page = 1, limit = 50 } = c.req.query();

      const prisma = createPrismaClient(c.env.DB);

      const post = await prisma.post.findUnique({
        where: { id: parseInt(id), isDeleted: false }
      });

      if (!post) {
        await prisma.$disconnect();
        return c.json({ success: false, message: '게시글을 찾을 수 없습니다.' }, 400);
      }

      const pageNum = typeof page === 'string' ? parseInt(page) : page;
      const limitNum = typeof limit === 'string' ? parseInt(limit) : limit;
      const skip = (pageNum - 1) * limitNum;
      const take = limitNum;

      const [comments, total] = await Promise.all([
        prisma.comment.findMany({
          where: { postId: parseInt(id), isDeleted: false },
          orderBy: { createdAt: 'asc' },
          skip,
          take,
          include: {
            _count: {
              select: { commentLikes: true }
            }
          }
        }),
        prisma.comment.count({
          where: { postId: parseInt(id), isDeleted: false }
        })
      ]);

      const totalPages = Math.ceil(total / take);

      await prisma.$disconnect();

      return c.json({
        success: true,
        data: {
          comments: comments.map(comment => ({
            id: comment.id,
            content: comment.content,
            authorName: comment.authorName || '익명',
            authorImage: comment.authorImage,
            isAnonymous: !comment.authorId,
            likeCount: comment._count.commentLikes,
            createdAt: comment.createdAt,
            parentId: comment.parentId
          })),
          pagination: {
            page: pageNum,
            limit: take,
            total,
            totalPages
          }
        }
      });
    } catch (error) {
      console.error('댓글 목록 조회 오류:', error);
      return c.json({ success: false, message: '서버 오류가 발생했습니다.' }, 500);
    }
  },

  // 댓글 작성
  async createComment(c: Context) {
    try {
      const { postId } = c.req.param();
      const body = await c.req.json();
      const { content, parentId, isAnonymous = false, password, authorImage } = body;

      const prisma = createPrismaClient(c.env.DB);

      const post = await prisma.post.findUnique({
        where: { id: parseInt(postId), isDeleted: false }
      });

      if (!post) {
        await prisma.$disconnect();
        return c.json({ success: false, message: '게시글을 찾을 수 없습니다.' }, 404);
      }

      // 부모 댓글 존재 확인 (대댓글인 경우)
      if (parentId) {
        const parentComment = await prisma.comment.findUnique({
          where: { id: parentId, postId: parseInt(postId), isDeleted: false }
        });

        if (!parentComment) {
          await prisma.$disconnect();
          return c.json({ success: false, message: '부모 댓글을 찾을 수 없습니다.' }, 404);
        }
      }

      // 익명 댓글인 경우 비밀번호 필수
      if (isAnonymous && !password) {
        await prisma.$disconnect();
        return c.json({ success: false, message: '익명 댓글은 비밀번호가 필요합니다.' }, 400);
      }

      // 로그인한 사용자 정보 가져오기
      let user = null;
      let authorId = null;
      let authorName = '익명';

      if (!isAnonymous) {
        user = await getUserFromToken(c);
        if (!user) {
          await prisma.$disconnect();
          return c.json({ success: false, message: '로그인이 필요합니다.' }, 401);
        }
        authorId = user.id;
        
        // 사용자 정보 조회
        const userInfo = await prisma.user.findUnique({
          where: { id: user.id },
          select: { name: true, userName: true }
        });
        authorName = userInfo?.userName || userInfo?.name || '사용자';
      }

      const comment = await prisma.comment.create({
        data: {
          content,
          postId: parseInt(postId),
          parentId: parentId ? parseInt(parentId) : null,
          authorId,
          authorName,
          authorImage: isAnonymous ? null : authorImage, // 로그인 사용자의 이미지 URL
          password: isAnonymous ? password : null,
          likeCount: 0,
          isDeleted: false
        }
      });

      // 게시글 댓글 수 증가
      await prisma.post.update({
        where: { id: parseInt(postId) },
        data: { commentCount: { increment: 1 } }
      });

      await prisma.$disconnect();

      return c.json({
        success: true,
        data: {
          id: comment.id,
          content: comment.content,
          authorName: comment.authorName,
          authorImage: comment.authorImage,
          isAnonymous: !comment.authorId,
          createdAt: comment.createdAt
        }
      }, 201);
    } catch (error) {
      console.error('댓글 작성 오류:', error);
      return c.json({ success: false, message: '서버 오류가 발생했습니다.' }, 500);
    }
  },

  // 댓글 수정
  async updateComment(c: Context) {
    try {
      const { id } = c.req.param();
      const body = await c.req.json();
      const { content, password } = body;

      const prisma = createPrismaClient(c.env.DB);

      const comment = await prisma.comment.findUnique({
        where: { id: parseInt(id), isDeleted: false }
      });

      if (!comment) {
        await prisma.$disconnect();
        return c.json({ success: false, message: '댓글을 찾을 수 없습니다.' }, 404);
      }

      // 권한 확인
      const user = await getUserFromToken(c);
      const isAdmin = user?.role === 'admin';
      const isAuthor = user && comment.authorId === user.id;

      if (!isAuthor && !isAdmin) {
        // 익명 댓글인 경우 비밀번호 확인
        if (!comment.authorId && comment.password !== password) {
          await prisma.$disconnect();
          return c.json({ success: false, message: '비밀번호가 일치하지 않습니다.' }, 403);
        }
        
        if (!comment.authorId && !password) {
          await prisma.$disconnect();
          return c.json({ success: false, message: '권한이 없습니다.' }, 403);
        }
      }

      const updatedComment = await prisma.comment.update({
        where: { id: parseInt(id) },
        data: {
          content,
          updatedAt: new Date()
        }
      });

      await prisma.$disconnect();

      return c.json({
        success: true,
        data: {
          id: updatedComment.id,
          content: updatedComment.content,
          updatedAt: updatedComment.updatedAt
        }
      });
    } catch (error) {
      console.error('댓글 수정 오류:', error);
      return c.json({ success: false, message: '서버 오류가 발생했습니다.' }, 500);
    }
  },

  // 댓글 삭제
  async deleteComment(c: Context) {
    try {
      const { id } = c.req.param();
      const body = await c.req.json();
      const { password } = body;

      const prisma = createPrismaClient(c.env.DB);

      const comment = await prisma.comment.findUnique({
        where: { id: parseInt(id), isDeleted: false }
      });

      if (!comment) {
        await prisma.$disconnect();
        return c.json({ success: false, message: '댓글을 찾을 수 없습니다.' }, 404);
      }

      // 권한 확인
      const user = await getUserFromToken(c);
      const isAdmin = user?.role === 'admin';
      const isAuthor = user && comment.authorId === user.id;

      if (!isAuthor && !isAdmin) {
        // 익명 댓글인 경우 비밀번호 확인
        if (!comment.authorId && comment.password !== password) {
          await prisma.$disconnect();
          return c.json({ success: false, message: '비밀번호가 일치하지 않습니다.' }, 403);
        }
        
        if (!comment.authorId && !password) {
          await prisma.$disconnect();
          return c.json({ success: false, message: '권한이 없습니다.' }, 403);
        }
      }

      // 물리적 삭제가 아닌 비활성화
      await prisma.comment.update({
        where: { id: parseInt(id) },
        data: { isDeleted: true }
      });

      // 게시글 댓글 수 감소
      await prisma.post.update({
        where: { id: comment.postId },
        data: { commentCount: { decrement: 1 } }
      });

      await prisma.$disconnect();

      return c.json({
        success: true,
        message: '댓글이 삭제되었습니다.'
      });
    } catch (error) {
      console.error('댓글 삭제 오류:', error);
      return c.json({ success: false, message: '서버 오류가 발생했습니다.' }, 500);
    }
  },

  // 댓글 추천/취소
  async toggleCommentLike(c: Context) {
    try {
      const { id } = c.req.param();

      const prisma = createPrismaClient(c.env.DB);

      const comment = await prisma.comment.findUnique({
        where: { id: parseInt(id), isDeleted: false }
      });

      if (!comment) {
        await prisma.$disconnect();
        return c.json({ success: false, message: '댓글을 찾을 수 없습니다.' }, 400);
      }

      // 로그인한 사용자 확인
      const user = await getUserFromToken(c);
      if (!user) {
        await prisma.$disconnect();
        return c.json({ success: false, message: '로그인이 필요합니다.' }, 401);
      }

      // 기존 추천 확인
      const existingLike = await prisma.commentLike.findUnique({
        where: {
          commentId_userId: {
            commentId: parseInt(id),
            userId: user.id
          }
        }
      });

      if (existingLike) {
        // 추천 취소
        await prisma.commentLike.delete({
          where: { id: existingLike.id }
        });

        await prisma.$disconnect();

        return c.json({
          success: true,
          data: { liked: false }
        });
      } else {
        // 추천 추가
        await prisma.commentLike.create({
          data: {
            commentId: parseInt(id),
            userId: user.id
          }
        });

        await prisma.$disconnect();

        return c.json({
          success: true,
          data: { liked: true }
        });
      }
    } catch (error) {
      console.error('댓글 추천 오류:', error);
      return c.json({ success: false, message: '서버 오류가 발생했습니다.' }, 500);
    }
  }
}; 