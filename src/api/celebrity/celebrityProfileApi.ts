import { PrismaClient } from "@prisma/client";
import { createPrismaClient, isAdmin } from "../../common/prismaUtils";
import { Context } from "hono";
import { getUserFromToken } from "../../common/utils";

// 중첩된 댓글에서 모든 댓글 ID 추출
const getAllCommentIds = (comments: any[]): number[] => {
  const ids: number[] = [];
  const extractIds = (comment: any) => {
    ids.push(comment.id);
    if (comment.replies) {
      comment.replies.forEach(extractIds);
    }
  };
  comments.forEach(extractIds);
  return ids;
};

// 댓글 데이터 변환 (사용자의 추천 여부 포함)
const toCommentFields = (comment: any, userLikes?: Set<number>) => ({
  id: comment.id,
  내용: comment.content,
  작성자: comment.user?.userName || comment.user?.name || "알 수 없음", // 프로필 이름 우선, 없으면 실제 이름
  작성자ID: comment.userId,
  부모댓글ID: comment.parentId,
  추천수: comment.likeCount || 0,
  내가추천함: userLikes ? userLikes.has(comment.id) : false,
  답글:
    comment.replies?.map((reply: any) => toCommentFields(reply, userLikes)) ||
    [],
  작성일: comment.createdAt,
  수정일: comment.updatedAt,
});

// 댓글 데이터 검증
const validateCommentData = (data: any): boolean => {
  return data?.내용?.trim();
};

// 클라이언트 식별자 생성
const getClientFingerprint = (c: Context): string => {
  const ip =
    c.req.header("CF-Connecting-IP") ||
    c.req.header("X-Forwarded-For") ||
    c.req.header("X-Real-IP") ||
    "unknown";
  const userAgent = c.req.header("User-Agent") || "unknown";
  return `${ip}:${userAgent.substring(0, 50)}`;
};

// wrangler kv namespace create VIEW_CACHE_KV --preview

// 조회수 증가 함수 (Cloudflare KV 사용)
const incrementViewCount = async (
  prisma: PrismaClient,
  celebrityId: string,
  c: Context,
  env: any
): Promise<number> => {
  try {
    // KV 바인딩이 없으면, 중복 체크 없이 단순 증가 처리 (개발 환경 등)
    if (!env.VIEW_CACHE_KV) {
      console.warn("VIEW_CACHE_KV is not bound. View count will be incremented without duplication check.");
      const viewCount = await prisma.celebrityViewCount.upsert({
        where: { celebrityId },
        update: { viewCount: { increment: 1 } },
        create: { celebrityId, viewCount: 1 },
      });
      return viewCount.viewCount;
    }

    const fingerprint = getClientFingerprint(c);
    const cacheKey = `view:${celebrityId}:${fingerprint}`;

    // KV에서 최근 조회 기록 확인
    const alreadyViewed = await env.VIEW_CACHE_KV.get(cacheKey);
    if (alreadyViewed) {
      // 30분 이내 동일 사용자의 조회는 조회수 증가 안함
      return await getViewCount(prisma, celebrityId);
    }
    
    // 조회수 증가
    const updatedView = await prisma.celebrityViewCount.upsert({
      where: { celebrityId },
      update: { viewCount: { increment: 1 } },
      create: { celebrityId, viewCount: 1 },
    });
    
    // KV에 조회 기록 저장 (TTL: 1일)
    await env.VIEW_CACHE_KV.put(cacheKey, "1", { expirationTtl: 60 * 60 * 24 });

    return updatedView.viewCount;
    
  } catch (error) {
    console.error("Failed to increment view count with KV:", error);
    // 오류 발생 시, 기능 장애를 막기 위해 현재 조회수라도 반환
    return await getViewCount(prisma, celebrityId);
  }
};


// 조회수 조회 함수
const getViewCount = async (
  prisma: PrismaClient,
  celebrityId: string
): Promise<number> => {
  try {
    const viewCount = await prisma.celebrityViewCount.findUnique({
      where: { celebrityId },
      select: { viewCount: true },
    });
    return viewCount?.viewCount || 0;
  } catch (error) {
    console.error("Failed to get view count:", error);
    return 0;
  }
};

// 유명인물 목록 조회 (페이지네이션, 다국어 지원)
export async function getCelebrities(
  c: Context
): Promise<any> {
  try {
    const page = Math.max(1, parseInt(c.req.query("page") || "1"));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(c.req.query("limit") || "10"))
    );
    const lang = c.req.query("lang") || "ko";
    const skip = (page - 1) * limit;

    const prisma = createPrismaClient(c.env.DB);

    const [total, celebrities] = await Promise.all([
      prisma.celebrity.count(),
      prisma.celebrity.findMany({
        skip,
        take: limit,
        include: {
          translations: {
            where: { languageCode: lang },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    await prisma.$disconnect();

    const result = celebrities.map((celeb: any) => {
      const t = celeb.translations[0];
      return {
        id: celeb.id,
        이름: t?.name || "",
        성별: celeb.gender === "MALE" ? "남자" : "여자",
        직업: t?.occupation || "",
        설명: t?.description || "",
        이미지: celeb.imageUrl,
        년: celeb.birthYear,
        월: celeb.birthMonth,
        일: celeb.birthDay,
        달력: celeb.calendar === "SOLAR" ? "양력" : "음력",
      };
    });

    return {
      success: true,
      celebrities: result,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  } catch (error) {
    console.error("유명인물 목록 조회 실패:", error);
    return c.json(
      {
        error: "유명인물 목록 조회 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

// 특정 유명인물 상세 조회 (다국어 지원)
export async function getCelebrityById(
  c: Context
): Promise<any> {
  try {
    const celebrityId = c.req.param("id");
    if (!celebrityId) {
      return c.json({ error: "유명인물 ID가 필요합니다." }, 400);
    }

    const lang = c.req.query("lang") || "ko";

    const prisma = createPrismaClient(c.env.DB);

    const celebrity = await prisma.celebrity.findUnique({
      where: { id: celebrityId },
      include: {
        translations: {
          where: { languageCode: lang },
        },
      },
    });

    await prisma.$disconnect();

    if (!celebrity) {
      return c.json({ error: "유명인물을 찾을 수 없습니다." }, 404);
    }

    const t = celebrity.translations[0];
    const result = {
      id: celebrity.id,
      이름: t?.name || "",
      성별: celebrity.gender === "MALE" ? "남자" : "여자",
      직업: t?.occupation || "",
      설명: t?.description || "",
      이미지: celebrity.imageUrl,
      년: celebrity.birthYear,
      월: celebrity.birthMonth,
      일: celebrity.birthDay,
      달력: celebrity.calendar === "SOLAR" ? "양력" : "음력",
    };

    return {
      success: true,
      celebrity: result,
    }
  } catch (error) {
    console.error("유명인물 조회 실패:", error);
    return c.json(
      {
        error: "유명인물 조회 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}


// 유명인물 댓글 목록 조회 (페이징 지원, 계층 구조, 조회수 증가, 정렬 기능, 추천 여부 포함)
export async function getCelebrityComments(
  c: Context
): Promise<any> {
  try {
    const celebrityId = c.req.param("id");
    if (!celebrityId)
      return c.json({ error: "유명인물 ID가 필요합니다." }, 400);

    const prisma = createPrismaClient(c.env.DB);

    // celebrity 존재 여부 확인
    const celebrity = await prisma.celebrity.findUnique({
      where: { id: celebrityId },
    });
    if (!celebrity) {
      await prisma.$disconnect();
      return c.json({ error: "유명인물을 찾을 수 없습니다." }, 404);
    }

    const page = Math.max(1, parseInt(c.req.query("page") || "1"));
    const limit = Math.min(
      50,
      Math.max(1, parseInt(c.req.query("limit") || "20"))
    );
    const sort = c.req.query("sort") || "latest"; // latest, likes
    const skip = (page - 1) * limit;

    // 현재 사용자 정보 (로그인 여부 확인, 필수 아님)
    const currentUser = await getUserFromToken(c);

    // 정렬 옵션 설정
    let orderBy: any;
    switch (sort) {
      case "likes":
        orderBy = [{ likeCount: "desc" }, { createdAt: "desc" }];
        break;
      case "latest":
      default:
        orderBy = { createdAt: "desc" };
        break;
    }

    // 조회수 증가
    const viewCount = await incrementViewCount(prisma, celebrityId, c, c.env);

    // 최상위 댓글만 조회 (대댓글은 중첩으로 포함)
    const [total, comments] = await Promise.all([
      prisma.celebrityComment.count({
        where: { celebrityId, parentId: null },
      }),
      prisma.celebrityComment.findMany({
        where: { celebrityId, parentId: null },
        skip,
        take: limit,
        orderBy,
        include: {
          user: { select: { name: true, userName: true } },
          replies: {
            include: {
              user: { select: { name: true, userName: true } },
              replies: {
                include: {
                  user: { select: { name: true, userName: true } },
                  replies: {
                    include: {
                      user: { select: { name: true, userName: true } },
                    },
                    orderBy: { createdAt: "asc" },
                  }, // 3단계까지만 지원
                },
                orderBy: { createdAt: "asc" },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
    ]);

    // 현재 사용자가 로그인한 경우 추천 정보 조회
    let userLikes: Set<number> = new Set();
    if (currentUser) {
      const allCommentIds = getAllCommentIds(comments);
      const likes = await prisma.celebrityCommentLike.findMany({
        where: {
          userId: currentUser.id,
          commentId: { in: allCommentIds },
        },
        select: { commentId: true },
      });
      userLikes = new Set(likes.map((like: any) => like.commentId));
    }

    await prisma.$disconnect();

    return {
      success: true,
      celebrityId,
      조회수: viewCount,
      comments: comments.map((comment: any) =>
        toCommentFields(comment, userLikes)
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    }
  } catch (error) {
    console.error("댓글 조회 실패:", error);
    return c.json(
      {
        error: "댓글 조회 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

// 유명인물 댓글 작성 (로그인 필요)
export async function createCelebrityComment(
  c: Context
): Promise<any> {
  try {
    const user = await getUserFromToken(c);
    if (!user) return c.json({ error: "로그인이 필요합니다." }, 401);

    const celebrityId = c.req.param("id");
    if (!celebrityId)
      return c.json({ error: "유명인물 ID가 필요합니다." }, 400);

    const body = (await c.req.json()) as any;
    if (!validateCommentData(body)) {
      return c.json({ error: "댓글 내용이 필요합니다." }, 400);
    }

    const prisma = createPrismaClient(c.env.DB);

    // celebrity 존재 여부 확인
    const celebrity = await prisma.celebrity.findUnique({
      where: { id: celebrityId },
    });
    if (!celebrity) {
      await prisma.$disconnect();
      return c.json({ error: "유명인물을 찾을 수 없습니다." }, 404);
    }

    // 부모 댓글 존재 확인 (대댓글인 경우)
    if (body.부모댓글ID) {
      const parentComment = await prisma.celebrityComment.findUnique({
        where: { id: body.부모댓글ID },
        select: { celebrityId: true },
      });
      if (!parentComment || parentComment.celebrityId !== celebrityId) {
        await prisma.$disconnect();
        return c.json({ error: "부모 댓글을 찾을 수 없습니다." }, 404);
      }
    }

    const comment = await prisma.celebrityComment.create({
      data: {
        celebrityId,
        userId: user.id,
        content: body.내용,
        parentId: body.부모댓글ID || null,
      },
      include: {
        user: { select: { name: true, userName: true } },
      },
    });

    await prisma.$disconnect();

    return c.json(
      {
        success: true,
        comment: toCommentFields(comment, new Set()), // 새로 작성한 댓글은 추천하지 않은 상태
        message: "댓글이 작성되었습니다.",
      },
      201
    );
  } catch (error) {
    console.error("댓글 작성 실패:", error);
    return c.json(
      {
        error: "댓글 작성 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

// 유명인물 댓글 수정 (본인만)
export async function updateCelebrityComment(
  c: Context
): Promise<any> {
  try {
    const user = await getUserFromToken(c);
    if (!user) return c.json({ error: "로그인이 필요합니다." }, 401);

    const commentId = parseInt(c.req.param("commentId") || "0");
    if (!commentId)
      return c.json({ error: "댓글 ID가 필요합니다." }, 400);

    const body = (await c.req.json()) as any;
    if (!validateCommentData(body)) {
      return c.json({ error: "댓글 내용이 필요합니다." }, 400);
    }

    const prisma = createPrismaClient(c.env.DB);

    // 댓글 존재 및 소유권 확인
    const comment = await prisma.celebrityComment.findUnique({
      where: { id: commentId },
      select: { userId: true },
    });
    if (!comment) {
      await prisma.$disconnect();
      return c.json({ error: "댓글을 찾을 수 없습니다." }, 404);
    }
    if (comment.userId !== user.id) {
      await prisma.$disconnect();
      return c.json({ error: "본인의 댓글만 수정할 수 있습니다." }, 403);
    }

    await prisma.celebrityComment.update({
      where: { id: commentId },
      data: { content: body.내용 },
    });

    await prisma.$disconnect();

    return c.json({ success: true, message: "댓글이 수정되었습니다." });
  } catch (error) {
    console.error("댓글 수정 실패:", error);
    return c.json(
      {
        error: "댓글 수정 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

// 유명인물 댓글 삭제 (본인 또는 관리자)
export async function deleteCelebrityComment(
  c: Context
): Promise<Response> {
  try {
    const user = await getUserFromToken(c);
    if (!user) return c.json({ error: "로그인이 필요합니다." }, 401);

    const commentId = parseInt(c.req.param("commentId") || "0");
    if (!commentId)
      return c.json({ error: "댓글 ID가 필요합니다." }, 400);

    const prisma = createPrismaClient(c.env.DB);

    // 댓글 존재 확인
    const comment = await prisma.celebrityComment.findUnique({
      where: { id: commentId },
      select: { userId: true },
    });
    if (!comment) {
      await prisma.$disconnect();
      return c.json({ error: "댓글을 찾을 수 없습니다." }, 404);
    }

    // 본인 또는 관리자인지 확인
    const isOwner = comment.userId === user.id;
    const isUserAdmin = await isAdmin(c);

    if (!isOwner && !isUserAdmin) {
      await prisma.$disconnect();
      return c.json({ error: "댓글을 삭제할 권한이 없습니다." }, 403);
    }

    await prisma.celebrityComment.delete({ where: { id: commentId } });
    await prisma.$disconnect();

    return c.json({ success: true, message: "댓글이 삭제되었습니다." });
  } catch (error) {
    console.error("댓글 삭제 실패:", error);
    return c.json(
      {
        error: "댓글 삭제 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

// 댓글 추천 토글 (추천 <-> 추천 취소)
export async function toggleCelebrityCommentLike(
  c: Context
): Promise<Response> {
  try {
    const user = await getUserFromToken(c);
    if (!user) return c.json({ error: "로그인이 필요합니다." }, 401);

    const commentId = parseInt(c.req.param("commentId") || "0");
    if (!commentId)
      return c.json({ error: "댓글 ID가 필요합니다." }, 400);

    const prisma = createPrismaClient(c.env.DB);

    // 댓글 존재 확인
    const comment = await prisma.celebrityComment.findUnique({
      where: { id: commentId },
      select: { id: true, likeCount: true },
    });
    if (!comment) {
      await prisma.$disconnect();
      return c.json({ error: "댓글을 찾을 수 없습니다." }, 404);
    }

    // 사용자가 이미 추천했는지 확인
    const existingLike = await prisma.celebrityCommentLike.findUnique({
      where: {
        userId_commentId: {
          userId: user.id,
          commentId: commentId,
        },
      },
    });

    let isLiked: boolean;
    let newLikeCount: number;

    if (existingLike) {
      // 이미 추천한 경우 - 추천 취소
      await prisma.celebrityCommentLike.delete({
        where: {
          userId_commentId: {
            userId: user.id,
            commentId: commentId,
          },
        },
      });

      // 추천수 감소
      const updatedComment = await prisma.celebrityComment.update({
        where: { id: commentId },
        data: { likeCount: { decrement: 1 } },
        select: { likeCount: true },
      });

      isLiked = false;
      newLikeCount = updatedComment.likeCount;
    } else {
      // 추천하지 않은 경우 - 추천 추가
      await prisma.celebrityCommentLike.create({
        data: {
          userId: user.id,
          commentId: commentId,
        },
      });

      // 추천수 증가
      const updatedComment = await prisma.celebrityComment.update({
        where: { id: commentId },
        data: { likeCount: { increment: 1 } },
        select: { likeCount: true },
      });

      isLiked = true;
      newLikeCount = updatedComment.likeCount;
    }

    await prisma.$disconnect();

    return c.json({
      success: true,
      message: isLiked ? "댓글을 추천했습니다." : "댓글 추천을 취소했습니다.",
      추천수: newLikeCount,
      내가추천함: isLiked,
    });
  } catch (error) {
    console.error("댓글 추천 처리 실패:", error);
    return c.json(
      {
        error: "댓글 추천 처리 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}
