
import { isAdmin, createPrismaClient } from "../../../common/prismaUtils";
import { paginate } from "../../../common/paginationUtils";
import { Context } from "hono";

// [Admin] 유명인물 대량 생성
export async function createCelebritiesBatch(
  c: Context,
): Promise<Response> {
  try {
    if (!(await isAdmin(c))) {
      return c.json({ error: "관리자 권한이 필요합니다." }, 403);
    }

    const body = (await c.req.json()) as any;
    const { celebrities } = body;

    // 배열 데이터 검증
    if (!Array.isArray(celebrities) || celebrities.length === 0) {
      return c.json({ error: "유명인물 배열 데이터가 필요합니다." }, 400);
    }

    // 각 유명인물 데이터 검증
    const validationErrors: string[] = [];
    const validCelebrities: any[] = [];
    const allTranslations: any[] = [];

    celebrities.forEach((celebrity, index) => {
      const {
        id,
        birthYear,
        birthMonth,
        birthDay,
        calendar,
        gender,
        translations,
      } = celebrity;

      if (
        !id ||
        !birthYear ||
        !birthMonth ||
        !birthDay ||
        !calendar ||
        !gender ||
        !translations?.length
      ) {
        validationErrors.push(`${index + 1}번째 유명인물: 필수 데이터가 누락되었습니다.`);
        return;
      }

      validCelebrities.push({
        id,
        birthYear: parseInt(birthYear),
        birthMonth: parseInt(birthMonth),
        birthDay: parseInt(birthDay),
        birthHour: celebrity.birthHour ? parseInt(celebrity.birthHour) : null,
        birthMinute: celebrity.birthMinute ? parseInt(celebrity.birthMinute) : null,
        calendar, // "SOLAR" | "LUNAR"
        gender, // "MALE" | "FEMALE"
        imageUrl: celebrity.imageUrl,
      });

      // 번역 데이터 추가
      translations.forEach((t: any) => {
        allTranslations.push({
          celebrityId: id,
          languageCode: t.languageCode,
          name: t.name,
          occupation: t.occupation,
          description: t.description,
        });
      });
    });

    if (validationErrors.length > 0) {
      return c.json({ 
        error: "데이터 검증 실패", 
        details: validationErrors 
      }, 400);
    }

    const prisma = createPrismaClient(c.env.DB);

    try {
      // 대량 생성을 위한 트랜잭션
      await prisma.$transaction([
        // 1. 모든 Celebrity 생성
        prisma.celebrity.createMany({
          data: validCelebrities,
        }),
        // 2. 모든 Translation 생성
        prisma.celebrityTranslation.createMany({
          data: allTranslations,
        }),
      ]);

      await prisma.$disconnect();

      return c.json(
        { 
          success: true, 
          message: `${validCelebrities.length}명의 유명인물이 생성되었습니다.`,
          createdCount: validCelebrities.length
        },
        201
      );
    } catch (error) {
      await prisma.$disconnect();
      throw error;
    }
  } catch (error) {
    return c.json(
      {
        error: "유명인물 대량 생성 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

// [Admin] 유명인물 생성
export async function createCelebrity(
  c: Context,
): Promise<Response> {
  try {
    if (!(await isAdmin(c))) {
      return c.json({ error: "관리자 권한이 필요합니다." }, 403);
    }

    const body = (await c.req.json()) as any;

    // 필수 데이터 검증
    const {
      id,
      birthYear,
      birthMonth,
      birthDay,
      calendar,
      gender,
      translations,
    } = body;
    if (
      !id ||
      !birthYear ||
      !birthMonth ||
      !birthDay ||
      !calendar ||
      !gender ||
      !translations?.length
    ) {
      return c.json({ error: "필수 데이터가 누락되었습니다." }, 400);
    }

    const prisma = createPrismaClient(c.env.DB);

    // batch transaction 사용
    await prisma.$transaction([
      // 1. Celebrity 생성
      prisma.celebrity.create({
        data: {
          id,
          birthYear: parseInt(birthYear),
          birthMonth: parseInt(birthMonth),
          birthDay: parseInt(birthDay),
          birthHour: body.birthHour ? parseInt(body.birthHour) : null,
          birthMinute: body.birthMinute ? parseInt(body.birthMinute) : null,
          calendar, // "SOLAR" | "LUNAR"
          gender, // "MALE" | "FEMALE"
          imageUrl: body.imageUrl,
        },
      }),
      // 2. 다국어 정보(Translations) 생성
      prisma.celebrityTranslation.createMany({
        data: translations.map((t: any) => ({
          celebrityId: id,
          languageCode: t.languageCode,
          name: t.name,
          occupation: t.occupation,
          description: t.description,
        })),
      }),
    ]);

    await prisma.$disconnect();

    return c.json(
      { success: true, message: "유명인물이 생성되었습니다." },
      201
    );
  } catch (error) {
    return c.json(
      {
        error: "유명인물 생성 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

// [Admin] 유명인물 수정
export async function updateCelebrity(
  c: Context,
): Promise<Response> {
  try {
    if (!(await isAdmin(c))) {
      return c.json({ error: "관리자 권한이 필요합니다." }, 403);
    }

    const celebrityId = c.req.param("id");
    if (!celebrityId) {
      return c.json({ error: "유명인물 ID가 필요합니다." }, 400);
    }

    const body = (await c.req.json()) as any;
    const { translations, ...celebrityData } = body;

    const prisma = createPrismaClient(c.env.DB);
    
    const transactionQueries = [];

    // 1. Celebrity 기본 정보 업데이트 (업데이트할 필드가 있는 경우)
    if (Object.keys(celebrityData).length > 0) {
      transactionQueries.push(
        prisma.celebrity.update({
          where: { id: celebrityId },
          data: celebrityData,
        })
      );
    }

    // 2. Translations 정보 업데이트
    if (translations?.length) {
      // 기존 번역 데이터 삭제
      transactionQueries.push(
        prisma.celebrityTranslation.deleteMany({
          where: { celebrityId },
        })
      );
      
      // 새로운 번역 데이터 생성
      transactionQueries.push(
        prisma.celebrityTranslation.createMany({
          data: translations.map((t: any) => ({
            celebrityId,
            languageCode: t.languageCode,
            name: t.name,
            occupation: t.occupation,
            description: t.description,
          })),
        })
      );
    }

    if (transactionQueries.length > 0) {
      await prisma.$transaction(transactionQueries);
    }

    await prisma.$disconnect();

    return c.json({
      success: true,
      message: "유명인물 정보가 수정되었습니다.",
    });
  } catch (error) {
    return c.json(
      {
        error: "유명인물 수정 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

// [Admin] 유명인물 삭제
export async function deleteCelebrity(
  c: Context
): Promise<Response> {
  try {
    if (!(await isAdmin(c))) {
      return c.json({ error: "관리자 권한이 필요합니다." }, 403);
    }

    const celebrityId = c.req.param("id");
    if (!celebrityId) {
      return c.json({ error: "유명인물 ID가 필요합니다." }, 400);
    }

    const prisma = createPrismaClient(c.env.DB);

    await prisma.celebrity.delete({
      where: { id: celebrityId },
    });

    await prisma.$disconnect();

    return c.json({
      success: true,
      message: "유명인물이 삭제되었습니다.",
    });
  } catch (error) {
    return c.json(
      {
        error: "유명인물 삭제 실패",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}


/**
 * 유명인물 요청 목록 조회 (관리자용)
 */
export async function getCelebrityRequests(
  c: Context,
): Promise<Response> {
  try {
    return await paginate(c, c.env.DB, {
      tableName: "celebrity_requests",
      searchField: "name",
      defaultLimit: 10,
    });
  } catch (error) {
    console.error("Celebrity requests fetch error:", error);
    return c.json(
      {
        error: "유명인물 요청 목록 조회 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "알 수 없는 오류",
      },
      500
    );
  }
}

/**
 * 유명인물 목록 조회
 */
export async function getCelebrities(
  c: Context,
): Promise<Response> {
  try {
    const prisma = createPrismaClient(c.env.DB);
    const { searchParams } = new URL(c.req.url);

    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const skip = Number((page - 1) * limit);
    const sort = searchParams.get("sort") || "createdAt";
    const order = searchParams.get("order")?.toLowerCase() || "desc";
    const id = searchParams.get("id") || "";
    const search = searchParams.get("search") || "";
    
    let where = {};
    
    if (id) {
      where = {
        id: {
          contains: id,
        },
      };
    } else if (search) {
      where = {
        OR: [
          {
            id: {
              contains: search,
            },
          },
          {
            translations: {
              some: {
                OR: [
                  {
                    name: {
                      contains: search,
                    },
                  },
                  {
                    occupation: {
                      contains: search,
                    },
                  },
                  {
                    description: {
                      contains: search,
                    },
                  },
                ],
              },
            },
          },
        ],
      };
    }

    const queryOptions = {
      where,
      include: {
        translations: true,
      },
      orderBy: {
        [sort]: order,
      },
      skip,
      take: limit,
    };
    
    const [celebrities, totalCount] = await Promise.all([
      prisma.celebrity.findMany(queryOptions),
      prisma.celebrity.count({ where }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    await prisma.$disconnect();

    return c.json({
      data: celebrities,
      pagination: {
        totalItems: totalCount,
        totalPages:totalPages,
        currentPage: page,
        pageSize: limit,
      },
    });
  } catch (error) {
    console.error("Celebrities fetch error:", error);
    return c.json(
      {
        error: "유명인물 목록 조회 실패",
        details: error instanceof Error ? error.message : "알 수 없는 오류",
      },
      500
    );
  }
}