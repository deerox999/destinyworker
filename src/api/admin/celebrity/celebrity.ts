import { Context } from "hono";
import {
  buildPaginationMeta,
  parsePagination
} from "../../../common/paginationUtils";
import { createPrismaClient, isAdmin } from "../../../common/prismaUtils";
import { ensureCelebrityTranslationsForAllNonKo } from "../../saju/ai/utils";

// [Admin] 유명인물 대량 생성
export async function createCelebritiesBatch(c: Context): Promise<Response> {
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
        validationErrors.push(
          `${index + 1}번째 유명인물: 필수 데이터가 누락되었습니다.`
        );
        return;
      }

      validCelebrities.push({
        id,
        birthYear: parseInt(birthYear),
        birthMonth: parseInt(birthMonth),
        birthDay: parseInt(birthDay),
        birthHour: celebrity.birthHour ? parseInt(celebrity.birthHour) : null,
        birthMinute: celebrity.birthMinute
          ? parseInt(celebrity.birthMinute)
          : null,
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
          aiResponse: t.aiResponse || null,
        });
      });
    });

    if (validationErrors.length > 0) {
      return c.json(
        {
          error: "데이터 검증 실패",
          details: validationErrors,
        },
        400
      );
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

      // 생성된 각 인물에 대해 비한국어 번역 보장
      let createdTranslations = 0;
      let updatedTranslations = 0;
      for (const celeb of validCelebrities) {
        const res = await ensureCelebrityTranslationsForAllNonKo(c.env, celeb.id);
        createdTranslations += res.created;
        updatedTranslations += res.updated;
      }

      return c.json(
        {
          success: true,
          message: `${validCelebrities.length}명의 유명인물이 생성되었습니다.`,
          createdCount: validCelebrities.length,
          translationSummary: {
            created: createdTranslations,
            updated: updatedTranslations,
          },
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
export async function createCelebrity(c: Context): Promise<Response> {
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
          aiResponse: t.aiResponse || null,
        })),
      }),
    ]);

    await prisma.$disconnect();

    // 비한국어 번역 보장 처리
    const translationResult = await ensureCelebrityTranslationsForAllNonKo(
      c.env,
      id
    );

    return c.json(
      {
        success: true,
        message: "유명인물이 생성되었습니다.",
        translationSummary: translationResult,
      },
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
export async function updateCelebrity(c: Context): Promise<Response> {
  try {
    if (!(await isAdmin(c))) {
      return c.json({ error: "관리자 권한이 필요합니다." }, 403);
    }

    const celebrityId = c.req.param("id");
    if (!celebrityId) {
      return c.json({ error: "유명인물 ID가 필요합니다." }, 400);
    }

    const body = (await c.req.json()) as any;
    const { translations, ...rawCelebrityData } = body;

    const prisma = createPrismaClient(c.env.DB);

    const transactionQueries: any[] = [];

    // 1) Celebrity 기본 정보 업데이트: 허용된 필드만 선택적으로 반영(미전달 필드는 그대로 유지)
    const allowedFields = [
      "birthYear",
      "birthMonth",
      "birthDay",
      "birthHour",
      "birthMinute",
      "calendar",
      "gender",
      "imageUrl",
    ];

    const updateData: any = {};
    for (const key of allowedFields) {
      if (rawCelebrityData[key] !== undefined) {
        if (
          key === "birthYear" ||
          key === "birthMonth" ||
          key === "birthDay" ||
          key === "birthHour" ||
          key === "birthMinute"
        ) {
          // 숫자 필드 변환 (null 허용)
          updateData[key] =
            rawCelebrityData[key] === null || rawCelebrityData[key] === ""
              ? null
              : parseInt(rawCelebrityData[key]);
        } else {
          updateData[key] = rawCelebrityData[key];
        }
      }
    }

    if (Object.keys(updateData).length > 0) {
      transactionQueries.push(
        prisma.celebrity.update({
          where: { id: celebrityId },
          data: updateData,
        })
      );
    }

    // 2) Translations 업데이트: 삭제하지 않고 언어별 upsert로 갱신
    if (Array.isArray(translations) && translations.length > 0) {
      for (const t of translations) {
        if (!t?.languageCode) continue;
        transactionQueries.push(
          prisma.celebrityTranslation.upsert({
            where: {
              celebrityId_languageCode: {
                celebrityId,
                languageCode: t.languageCode,
              },
            },
            update: {
              name: t.name,
              occupation: t.occupation,
              description: t.description,
              // aiResponse 필드는 undefined일 때는 업데이트하지 않음(기존 값 보존)
              ...(t.aiResponse === undefined
                ? {}
                : { aiResponse: t.aiResponse }),
            },
            create: {
              celebrityId,
              languageCode: t.languageCode,
              name: t.name,
              occupation: t.occupation,
              description: t.description,
              aiResponse: t.aiResponse ?? null,
            },
          })
        );
      }
    }

    if (transactionQueries.length > 0) {
      await prisma.$transaction(transactionQueries);
    }

    
    // 비한국어 번역 보장 처리
    const translationResult = await ensureCelebrityTranslationsForAllNonKo(
      c.env,
      celebrityId
    );

    await prisma.$disconnect();

    return c.json({
      success: true,
      message: "유명인물 정보가 수정되었습니다.",
      translationSummary: translationResult,
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
export async function deleteCelebrity(c: Context): Promise<Response> {
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
 * 유명인물 목록 조회
 */
export async function getCelebrities(c: Context): Promise<Response> {
  try {
    const prisma = createPrismaClient(c.env.DB);
    const { searchParams } = new URL(c.req.url);

    const { page, take, skip } = parsePagination(c, {
      defaultLimit: 10,
      maxLimit: 100,
    });
    const sort = searchParams.get("sort") || "createdAt";
    const order = searchParams.get("order")?.toLowerCase() || "desc";
    const id = searchParams.get("id") || "";
    const search = searchParams.get("search") || "";
    const language = (searchParams.get("language") || "").toLowerCase();
    const allowedLanguages = new Set(["ko", "en", "ja", "zh", "vi"]);

    let where = {};

    if (id) {
      where = {
        id: {
          equals: id,
        },
      };
      await prisma.celebrity.update({
        where: { id: id },
        data: { viewCount: { increment: 1 } },
      });
    } else if (search) {
      where = {
        OR: [
          {
            id: {
              equals: search,
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
        translations: allowedLanguages.has(language)
          ? {
              where: { languageCode: { in: [language, "ko"] } },
              select: {
                id: true,
                celebrityId: true,
                languageCode: true,
                name: true,
                occupation: true,
                description: true,
                aiResponse: true,
              },
            }
          : {
              select: {
                id: true,
                celebrityId: true,
                languageCode: true,
                name: true,
                occupation: true,
                description: true,
                aiResponse: true,
              },
            },
      },
      orderBy: {
        [sort]: order,
      },
      skip,
      take,
    };

    const [celebrities, totalCount] = await Promise.all([
      prisma.celebrity.findMany(queryOptions),
      prisma.celebrity.count({ where }),
    ]);
    
    // 요청한 언어 번역이 없을 경우 ko 번역으로 폴백
    const normalizedCelebrities = allowedLanguages.has(language)
      ? celebrities.map((celeb: any) => {
          const translations = Array.isArray(celeb.translations)
            ? celeb.translations
            : [];
          const preferred = translations.find((t: any) => t.languageCode === language);
          const fallback = translations.find((t: any) => t.languageCode === "ko");
          return {
            ...celeb,
            translations: preferred ? [preferred] : fallback ? [fallback] : [],
          };
        })
      : celebrities;
    
    await prisma.$disconnect();

    return c.json({
      data: normalizedCelebrities,
      pagination: buildPaginationMeta(totalCount, page, take),
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
