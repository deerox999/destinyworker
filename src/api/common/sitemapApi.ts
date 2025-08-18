import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { createPrismaClient } from "../../common/prismaUtils";
import { Context } from "hono";

export function createSitemapRouter(): OpenAPIHono {
  const app = new OpenAPIHono();

  const getFullSitemapRoute = createRoute({
    method: "get",
    path: "/full",
    summary: "전체 사이트맵 데이터 조회",
    description: "프론트에서 사용할 전체 사이트맵 데이터를 단일 요청으로 제공합니다. 유명인물과 커뮤니티 데이터만 포함됩니다.",
    tags: ["사이트맵"],
    responses: {
      200: {
        description: "성공",
        content: {
          "application/json": {
            schema: z
              .object({
                generatedAt: z.string().datetime(),
                celebrities: z.object({
                  items: z
                    .array(
                      z.object({
                        id: z.string(),
                        lastModified: z.string().datetime(),
                      })
                    )
                    .default([]),
                }),
                community: z.object({
                  items: z
                    .array(
                      z.object({
                        id: z.number().int(),
                        language: z.string(),
                        lastModified: z.string().datetime(),
                      })
                    )
                    .default([]),
                }),
              })
              .openapi({ type: "object" }),
          },
        },
      },
      500: { description: "서버 오류" },
    },
  });

  app.openapi(getFullSitemapRoute, async (c: Context) => {
    try {
      const prisma = createPrismaClient(c.env.DB);

      const [celebrities, posts] = await Promise.all([
        prisma.celebrity.findMany({
          select: { id: true, createdAt: true, updatedAt: true },
        }),
        prisma.post.findMany({
          where: {
            isDeleted: false,
            board: { isActive: true },
          },
          select: {
            id: true,
            language: true,
            createdAt: true,
            updatedAt: true,
            board: { select: { language: true } },
          },
        }),
      ]);

      const generatedAt = new Date().toISOString();

      const celebrityItems = celebrities.map((cItem) => ({
        id: cItem.id,
        lastModified: (cItem.updatedAt ?? cItem.createdAt).toISOString(),
      }));

      const communityItems = posts
        .filter((p) => p.language === p.board.language)
        .map((p) => ({
          id: p.id,
          language: p.language,
          lastModified: (p.updatedAt ?? p.createdAt).toISOString(),
        }));

      await prisma.$disconnect();

      return c.json({
        generatedAt,
        celebrities: { items: celebrityItems },
        community: { items: communityItems },
      });
    } catch (error) {
      console.error("Failed to build sitemap:", error);
      return c.json({ error: "서버 내부 오류가 발생했습니다." }, 500);
    }
  });

  return app;
}
