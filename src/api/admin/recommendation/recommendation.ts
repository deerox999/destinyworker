import { z } from "@hono/zod-openapi";
import { Context } from "hono";
import { deleteImagesFromR2 } from "../../common/r2Api";
import { createPrismaClient, isAdmin } from "../../../common/prismaUtils";

export const RecommendationInputSchema = z
  .object({
    id: z.string().min(1).openapi({ example: "charm-points" }),
    title: z.string().min(1).openapi({ example: "타고난 매력 어필 포인트" }),
    subtitle: z
      .string()
      .optional()
      .openapi({ example: "당신만의 매력을 발견하세요" }),
    badge: z.string().optional().openapi({ example: "NEW" }),
    bannerImage: z.string().min(1).openapi({
      description: "프론트엔드가 R2에 업로드한 배너 이미지 URL",
      example: "https://cdn.example.com/uploads/recommendations/banner.png",
    }),
    point: z.number().int().nonnegative().openapi({ example: 300 }),
    type: z
      .enum(["individual", "compatibility"])
      .openapi({ example: "individual" }),
    analysisType: z.string().min(1).openapi({ example: "매력 분석" }),
    descriptionHtml: z.string().openapi({ example: "<p>분석 설명</p>" }),
    questions: z.array(z.string()).openapi({ type: "array" }),
    galleryImages: z.array(z.string()).openapi({
      description: "프론트엔드가 R2에 업로드한 갤러리 이미지 URL 목록",
      type: "array",
    }),
  })
  .openapi({ type: "object" });

export const RecommendationSchema = RecommendationInputSchema;
export const UpdateRecommendationSchema = RecommendationInputSchema
  .omit({ id: true })
  .partial()
  .openapi({ type: "object" });

export type RecommendationInput = z.infer<typeof RecommendationInputSchema>;
type RecommendationUpdate = Partial<Omit<RecommendationInput, "id">>;

type RecommendationRow = {
  id: string;
  title: string;
  subtitle: string | null;
  badge: string | null;
  bannerImage: string;
  point: number;
  type: string;
  analysisType: string;
  descriptionHtml: string;
  questionsJson: string;
  galleryImagesJson: string;
};

function serializeRecommendation(row: RecommendationRow) {
  return {
    id: row.id,
    title: row.title,
    ...(row.subtitle === null ? {} : { subtitle: row.subtitle }),
    ...(row.badge === null ? {} : { badge: row.badge }),
    bannerImage: row.bannerImage,
    point: row.point,
    type: row.type,
    analysisType: row.analysisType,
    descriptionHtml: row.descriptionHtml,
    questions: JSON.parse(row.questionsJson) as string[],
    galleryImages: JSON.parse(row.galleryImagesJson) as string[],
  };
}

function toDatabaseData(input: RecommendationUpdate) {
  const { questions, galleryImages, ...fields } = input;
  return {
    ...fields,
    ...(questions === undefined
      ? {}
      : { questionsJson: JSON.stringify(questions) }),
    ...(galleryImages === undefined
      ? {}
      : { galleryImagesJson: JSON.stringify(galleryImages) }),
  };
}

async function deleteRecommendationImages(
  imageUrls: string[],
  c: Context
): Promise<void> {
  const r2PublicUrl = c.env.R2_PUBLIC_URL;
  if (!r2PublicUrl) {
    console.error("추천 상품 이미지 삭제 실패: R2_PUBLIC_URL이 설정되지 않았습니다.");
    return;
  }

  const r2ImageUrls = [...new Set(imageUrls)].filter(
    (url) =>
      url.startsWith(`${r2PublicUrl}/`) && !/[<>"]/.test(url)
  );
  if (r2ImageUrls.length === 0) return;

  const imageContent = r2ImageUrls
    .map((url) => `<img src="${url}">`)
    .join("");

  try {
    await deleteImagesFromR2(imageContent, c.env);
  } catch (error) {
    console.error("추천 상품 이미지 R2 삭제 실패:", error);
  }
}

export async function getRecommendations(c: Context): Promise<Response> {
  if (!(await isAdmin(c))) {
    return c.json({ error: "관리자 권한이 필요합니다." }, 403);
  }

  const prisma = createPrismaClient(c.env.DB);
  try {
    const recommendations = await prisma.recommendation.findMany({
      orderBy: { createdAt: "desc" },
    });
    return c.json({
      success: true,
      recommendations: recommendations.map(serializeRecommendation),
    });
  } catch (error) {
    console.error("추천 상품 목록 조회 실패:", error);
    return c.json({ error: "추천 상품 목록 조회 실패" }, 500);
  } finally {
    await prisma.$disconnect();
  }
}

export async function getRecommendation(c: Context): Promise<Response> {
  // if (!(await isAdmin(c))) {
  //   return c.json({ error: "관리자 권한이 필요합니다." }, 403);
  // }

  const id = c.req.param("id");
  const prisma = createPrismaClient(c.env.DB);
  try {
    const recommendation = await prisma.recommendation.findUnique({
      where: { id },
    });
    if (!recommendation) {
      return c.json({ error: "추천 상품을 찾을 수 없습니다." }, 404);
    }
    return c.json({
      success: true,
      recommendation: serializeRecommendation(recommendation),
    });
  } catch (error) {
    console.error("추천 상품 조회 실패:", error);
    return c.json({ error: "추천 상품 조회 실패" }, 500);
  } finally {
    await prisma.$disconnect();
  }
}

export async function createRecommendation(c: Context): Promise<Response> {
  if (!(await isAdmin(c))) {
    return c.json({ error: "관리자 권한이 필요합니다." }, 403);
  }

  const input = RecommendationInputSchema.parse(await c.req.json());
  const prisma = createPrismaClient(c.env.DB);
  try {
    const recommendation = await prisma.recommendation.create({
      data: {
        id: input.id,
        title: input.title,
        subtitle: input.subtitle,
        badge: input.badge,
        bannerImage: input.bannerImage,
        point: input.point,
        type: input.type,
        analysisType: input.analysisType,
        descriptionHtml: input.descriptionHtml,
        questionsJson: JSON.stringify(input.questions),
        galleryImagesJson: JSON.stringify(input.galleryImages),
      },
    });
    return c.json(
      {
        success: true,
        recommendation: serializeRecommendation(recommendation),
      },
      201
    );
  } catch (error) {
    console.error("추천 상품 등록 실패:", error);
    return c.json({ error: "추천 상품 등록 실패" }, 500);
  } finally {
    await prisma.$disconnect();
  }
}

export async function updateRecommendation(c: Context): Promise<Response> {
  if (!(await isAdmin(c))) {
    return c.json({ error: "관리자 권한이 필요합니다." }, 403);
  }

  const id = c.req.param("id");
  const input = UpdateRecommendationSchema.parse(await c.req.json());
  const prisma = createPrismaClient(c.env.DB);
  try {
    const existing = await prisma.recommendation.findUnique({ where: { id } });
    if (!existing) {
      return c.json({ error: "추천 상품을 찾을 수 없습니다." }, 404);
    }
    const oldGalleryImages = JSON.parse(existing.galleryImagesJson) as string[];
    const newImageUrls = [
      input.bannerImage ?? existing.bannerImage,
      ...(input.galleryImages ?? oldGalleryImages),
    ];
    const newImageUrlSet = new Set(newImageUrls);
    const removedImageUrls = [
      existing.bannerImage,
      ...oldGalleryImages,
    ].filter((url) => !newImageUrlSet.has(url));
    const recommendation = await prisma.recommendation.update({
      where: { id },
      data: toDatabaseData(input),
    });
    await deleteRecommendationImages(removedImageUrls, c);

    return c.json({
      success: true,
      recommendation: serializeRecommendation(recommendation),
    });
  } catch (error) {
    console.error("추천 상품 수정 실패:", error);
    return c.json({ error: "추천 상품 수정 실패" }, 500);
  } finally {
    await prisma.$disconnect();
  }
}

export async function deleteRecommendation(c: Context): Promise<Response> {
  if (!(await isAdmin(c))) {
    return c.json({ error: "관리자 권한이 필요합니다." }, 403);
  }

  const id = c.req.param("id");
  const prisma = createPrismaClient(c.env.DB);
  try {
    const existing = await prisma.recommendation.findUnique({ where: { id } });
    if (!existing) {
      return c.json({ error: "추천 상품을 찾을 수 없습니다." }, 404);
    }
    const galleryImages = JSON.parse(existing.galleryImagesJson) as string[];
    await prisma.recommendation.delete({ where: { id } });
    await deleteRecommendationImages(
      [existing.bannerImage, ...galleryImages],
      c
    );
    return c.json({ success: true, message: "추천 상품이 삭제되었습니다." });
  } catch (error) {
    console.error("추천 상품 삭제 실패:", error);
    return c.json({ error: "추천 상품 삭제 실패" }, 500);
  } finally {
    await prisma.$disconnect();
  }
}
