import { Context } from "hono";
import { createPrismaClient } from "../../common/prismaUtils";
import { getUserFromToken } from "../../common/utils";
import { deleteImagesFromR2, deleteR2Object, extractR2ImageUrls } from '../user/r2Api';
import { addPoints, deductPoints } from "../../common/paymentUtils";

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
        orderBy: [
          { sortOrder: 'asc' },
          { createdAt: 'asc' }
        ]
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
          authorImage: post.authorImage,
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
            sortOrder: board.sortOrder,
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
            authorImage: post.authorImage,
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
            authorImage: post.authorImage,
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

  // 게시판 목록 조회 (카테고리 포함)
  async getBoards(c: Context) {
    try {
      const prisma = createPrismaClient(c.env.DB);
      
      const boards = await prisma.board.findMany({
        where: { isActive: true },
        include: {
          categories: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' }
          }
        },
        orderBy: [
          { sortOrder: 'asc' },
          { createdAt: 'asc' }
        ]
      });

      await prisma.$disconnect();

      return c.json({
        success: true,
        data: boards.map(board => ({
          id: board.id,
          name: board.name,
          displayName: board.displayName,
          description: board.description,
          sortOrder: board.sortOrder,
          isActive: board.isActive,
          createdAt: board.createdAt,
          updatedAt: board.updatedAt,
          categories: board.categories.map(category => ({
            id: category.id,
            name: category.name,
            sortOrder: category.sortOrder,
            isActive: category.isActive
          }))
        }))
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
            sortOrder: board.sortOrder,
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
            authorImage: post.authorImage,
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
            authorImage: post.authorImage,
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
              displayName: post.board.displayName,
              sortOrder: post.board.sortOrder
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

      // 현재 사용자 정보 확인 (로그인 여부 확인, 필수 아님)
      const currentUser = await getUserFromToken(c);

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

      // 현재 사용자가 로그인한 경우 추천 여부 확인
      let isLiked = false;
      if (currentUser) {
        const existingLike = await prisma.postLike.findUnique({
          where: {
            postId_userId: {
              postId: parseInt(id),
              userId: currentUser.id
            }
          }
        });
        isLiked = !!existingLike;
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
          authorImage: post.authorImage,
          isAnonymous: !post.authorId,
          tags: post.postTags.map(pt => pt.tag.name),
          viewCount: post.viewCount + 1, // 증가된 조회수 반영
          likeCount: post.likeCount,
          commentCount: post._count.comments,
          isLiked: isLiked, // 현재 사용자의 추천 여부
          createdAt: post.createdAt,
          updatedAt: post.updatedAt,
          board: {
            id: post.board.id,
            name: post.board.name,
            displayName: post.board.displayName,
            sortOrder: post.board.sortOrder
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
      let authorImage = null;

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
          select: { name: true, userName: true, picture: true }
        });
        authorName = userInfo?.userName || userInfo?.name || '사용자';
        authorImage = userInfo?.picture;
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
          authorImage: isAnonymous ? null : authorImage, // 로그인 사용자의 이미지 URL
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

      // 로그인한 사용자의 경우 포인트 증가 (익명 게시글 제외, 이미지 없는 순수 텍스트만, 100자 이상)
      if (!isAnonymous && authorId) {
        // 이미지가 포함되어 있는지 확인 (R2 URL 패턴 체크)
        const hasImages = content.includes(c.env.R2_PUBLIC_URL);
        
        // 순수 텍스트 길이 계산 (HTML 태그 제거)
        const textContent = content.replace(/<[^>]*>/g, '').trim();
        const textLength = textContent.length;
        
        if (!hasImages && textLength >= 100) {
          try {
            const pointResult = await addPoints(
              c.env.DB,
              authorId,
              300, // 순수 텍스트 게시글 작성 시 300포인트 증가 (100자 이상)
              "커뮤니티 순수 텍스트 게시글 작성",
              `post_${post.id}`
            );
            
            if (pointResult.success) {
              // 포인트 증가 성공
            } else {
              console.error(`순수 텍스트 게시글 작성 포인트 증가 실패: ${pointResult.message}`);
            }
          } catch (error) {
            console.error('순수 텍스트 게시글 작성 포인트 증가 중 오류:', error);
          }
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
          authorImage: post.authorImage,
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

      // 기존 이미지와 새 이미지 비교하여 삭제된 이미지만 R2에서 삭제
      if (content && post.content !== content) {
        try {
          // 기존 이미지 URL 추출
          const oldImages = extractR2ImageUrls(post.content, c.env.R2_PUBLIC_URL);
          
          // 새 이미지 URL 추출
          const newImages = extractR2ImageUrls(content, c.env.R2_PUBLIC_URL);
          
          // 삭제된 이미지 찾기 (기존에 있지만 새 내용에는 없는 이미지)
          const deletedImages = oldImages.filter(oldImg => !newImages.includes(oldImg));
          
          if (deletedImages.length > 0) {
            // 삭제된 이미지들을 R2에서 삭제
            for (const imageUrl of deletedImages) {
              try {
                const filePath = imageUrl.replace(c.env.R2_PUBLIC_URL + '/', '');
                await deleteR2Object(filePath, c.env);
              } catch (error) {
                console.error(`삭제된 이미지 R2 제거 실패: ${imageUrl}`, error);
              }
            }
          }
        } catch (error) {
          console.error('게시글 수정 시 이미지 비교 중 오류:', error);
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
      
      // query parameter에서 password 확인
      const { password } = c.req.query();

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

      // 게시글에 포함된 이미지 URL들을 추출하여 R2에서 삭제
      if (post.content && post.content.includes(c.env.R2_PUBLIC_URL)) {
        try {
          await deleteImagesFromR2(post.content, c.env);
        } catch (error) {
          console.error('게시글 삭제 시 R2 이미지 삭제 실패:', error);
        }
      }

      // 물리적 삭제가 아닌 비활성화
      await prisma.post.update({
        where: { id: parseInt(id) },
        data: { isDeleted: true }
      });

      // 로그인한 사용자의 경우 포인트 차감 (익명 게시글 제외, 이미지 없는 순수 텍스트만, 100자 이상)
      if (post.authorId) {
        // 이미지가 포함되어 있는지 확인 (R2 URL 패턴 체크)
        const hasImages = post.content.includes(c.env.R2_PUBLIC_URL);
        
        // 순수 텍스트 길이 계산 (HTML 태그 제거)
        const textContent = post.content.replace(/<[^>]*>/g, '').trim();
        const textLength = textContent.length;
        
        if (!hasImages && textLength >= 100) {
          try {
            const pointResult = await deductPoints(
              c.env.DB,
              post.authorId,
              300, // 순수 텍스트 게시글 삭제 시 300포인트 차감 (100자 이상)
              "커뮤니티 순수 텍스트 게시글 삭제",
              `post_${post.id}`
            );
            
            if (pointResult.success) {
              // 포인트 차감 성공
            } else {
              console.error(`순수 텍스트 게시글 삭제 포인트 차감 실패: ${pointResult.message}`);
            }
          } catch (error) {
            console.error('순수 텍스트 게시글 삭제 포인트 차감 중 오류:', error);
          }
        }
      }

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

        // 게시글 작성자에게 포인트 지급 (익명 게시글 제외, 자신이 추천한 경우 제외)
        if (post.authorId && post.authorId !== user.id) {
          try {
            const pointResult = await addPoints(
              c.env.DB,
              post.authorId,
              100, // 게시글 추천 받을 시 100포인트 증가
              "게시글 추천 받음",
              `post_like_${post.id}_${user.id}`
            );
            
            if (pointResult.success) {
              // 포인트 지급 성공
            } else {
              console.error(`게시글 추천 포인트 지급 실패: ${pointResult.message}`);
            }
          } catch (error) {
            console.error('게시글 추천 포인트 지급 중 오류:', error);
          }
        }

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

      // 현재 사용자 정보 확인 (로그인 여부 확인, 필수 아님)
      const currentUser = await getUserFromToken(c);

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

      // 현재 사용자가 로그인한 경우 댓글 추천 정보 조회
      let userCommentLikes: Set<number> = new Set();
      if (currentUser) {
        const commentIds = comments.map(comment => comment.id);
        const likes = await prisma.commentLike.findMany({
          where: {
            userId: currentUser.id,
            commentId: { in: commentIds }
          },
          select: { commentId: true }
        });
        userCommentLikes = new Set(likes.map(like => like.commentId));
      }

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
            isLiked: userCommentLikes.has(comment.id), // 현재 사용자의 추천 여부
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
      let commentAuthorImage = null;

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
          select: { name: true, userName: true, picture: true }
        });
        authorName = userInfo?.userName || userInfo?.name || '사용자';
        commentAuthorImage = userInfo?.picture;
      }

      const comment = await prisma.comment.create({
        data: {
          content,
          postId: parseInt(postId),
          parentId: parentId ? parseInt(parentId) : null,
          authorId,
          authorName,
          authorImage: isAnonymous ? null : commentAuthorImage, // 로그인 사용자의 이미지 URL
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

      // 로그인한 사용자의 경우 포인트 증가 (익명 댓글 제외, 20자 이상)
      if (!isAnonymous && authorId) {
        // 순수 텍스트 길이 계산 (HTML 태그 제거)
        const textContent = content.replace(/<[^>]*>/g, '').trim();
        const textLength = textContent.length;
        
        if (textLength >= 20) {
          try {
            const pointResult = await addPoints(
              c.env.DB,
              authorId,
              50, // 댓글 작성 시 50포인트 증가 (20자 이상)
              "커뮤니티 댓글 작성",
              `comment_${comment.id}`
            );
            
            if (pointResult.success) {
              // 포인트 증가 성공
            } else {
              console.error(`댓글 작성 포인트 증가 실패: ${pointResult.message}`);
            }
          } catch (error) {
            console.error('댓글 작성 포인트 증가 중 오류:', error);
          }
        }
      }

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

      // 기존 이미지와 새 이미지 비교하여 삭제된 이미지만 R2에서 삭제
      if (content && comment.content !== content) {
        try {
          // 기존 이미지 URL 추출
          const oldImages = extractR2ImageUrls(comment.content, c.env.R2_PUBLIC_URL);
          
          // 새 이미지 URL 추출
          const newImages = extractR2ImageUrls(content, c.env.R2_PUBLIC_URL);
          
          // 삭제된 이미지 찾기 (기존에 있지만 새 내용에는 없는 이미지)
          const deletedImages = oldImages.filter(oldImg => !newImages.includes(oldImg));
          
          if (deletedImages.length > 0) {
            // 삭제된 이미지들을 R2에서 삭제
            for (const imageUrl of deletedImages) {
              try {
                const filePath = imageUrl.replace(c.env.R2_PUBLIC_URL + '/', '');
                await deleteR2Object(filePath, c.env);
              } catch (error) {
                console.error(`삭제된 이미지 R2 제거 실패: ${imageUrl}`, error);
              }
            }
          }
        } catch (error) {
          console.error('댓글 수정 시 이미지 비교 중 오류:', error);
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
      
      // query parameter에서 password 확인
      const { password } = c.req.query();

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

      // 댓글에 포함된 이미지 URL들을 추출하여 R2에서 삭제
      if (comment.content && comment.content.includes(c.env.R2_PUBLIC_URL)) {
        try {
          await deleteImagesFromR2(comment.content, c.env);
        } catch (error) {
          console.error('댓글 삭제 시 R2 이미지 삭제 실패:', error);
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

      // 로그인한 사용자의 경우 포인트 차감 (익명 댓글 제외, 20자 이상)
      if (comment.authorId) {
        // 순수 텍스트 길이 계산 (HTML 태그 제거)
        const textContent = comment.content.replace(/<[^>]*>/g, '').trim();
        const textLength = textContent.length;
        
        if (textLength >= 20) {
          try {
            const pointResult = await deductPoints(
              c.env.DB,
              comment.authorId,
              50, // 댓글 삭제 시 50포인트 차감 (20자 이상)
              "커뮤니티 댓글 삭제",
              `comment_${comment.id}`
            );
            
            if (pointResult.success) {
              // 포인트 차감 성공
            } else {
              console.error(`댓글 삭제 포인트 차감 실패: ${pointResult.message}`);
            }
          } catch (error) {
            console.error('댓글 삭제 포인트 차감 중 오류:', error);
          }
        }
      }

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

        // 댓글 작성자에게 포인트 지급 (익명 댓글 제외, 자신이 추천한 경우 제외)
        if (comment.authorId && comment.authorId !== user.id) {
          try {
            const pointResult = await addPoints(
              c.env.DB,
              comment.authorId,
              50, // 댓글 추천 받을 시 50포인트 증가
              "댓글 추천 받음",
              `comment_like_${comment.id}_${user.id}`
            );
            
            if (pointResult.success) {
              // 포인트 지급 성공
            } else {
              console.error(`댓글 추천 포인트 지급 실패: ${pointResult.message}`);
            }
          } catch (error) {
            console.error('댓글 추천 포인트 지급 중 오류:', error);
          }
        }

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
  },

  // 일반 사용자용 샘플 데이터 생성 (익명 접근 가능)
  async createSampleData(c: Context) {
    try {
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
}; 