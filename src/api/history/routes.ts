import { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import { createPrismaClient } from "../../common/prismaUtils";
import { Context } from "hono";

const LogInputSchema = z.object({
  method: z.string(),
  url: z.string(),
  statusCode: z.number().int().optional(),
  durationMs: z.number().int().optional(),
  user: z.any().optional(),
  params: z.any().optional(),
  response: z.any().optional(),
  ip: z.string().optional(),
  userAgent: z.string().optional(),
  notes: z.string().optional(),
});

export function createHistoryRouter(): OpenAPIHono {
  const app = new OpenAPIHono();

  // POST /api/history/logs - 기록 저장
  app.post("/logs", async (c:Context) => {
    const prisma = createPrismaClient(c.env.DB);
    try {
      const body = await c.req.json();
      const parsed = LogInputSchema.parse(body);

      const toJson = (v: unknown) => (v === undefined ? null : JSON.stringify(v));

      // IP/UA 자동 보강(헤더 기준) - 사용자가 직접 넣은 값이 우선
      const ip = parsed.ip ?? c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? undefined;
      const userAgent = parsed.userAgent ?? c.req.header("user-agent") ?? undefined;

      const created = await prisma.apiLog.create({
        data: {
          method: parsed.method,
          url: parsed.url,
          statusCode: parsed.statusCode ?? null,
          durationMs: parsed.durationMs ?? null,
          userJson: toJson(parsed.user),
          paramsJson: toJson(parsed.params),
          responseJson: toJson(parsed.response),
          ip: ip ?? null,
          userAgent: userAgent ?? null,
          notes: parsed.notes ?? null,
        },
      });

      await prisma.$disconnect();
      return c.json({ success: true, id: created.id });
    } catch (err: any) {
      await prisma.$disconnect();
      return c.json({ success: false, error: err?.message ?? "Invalid request" }, 400);
    }
  });

  // GET /api/history/logs - 간단 조회
  app.get("/logs", async (c:Context) => {
    const prisma = createPrismaClient(c.env.DB);
    try {
      const isErrorParam = c.req.query("isError"); // statusCode 기반 필터(400+)
      const statusCode = c.req.query("statusCode");
      const urlContains = c.req.query("urlContains");
      const from = c.req.query("from");
      const to = c.req.query("to");
      const page = Number(c.req.query("page") ?? 1);
      const pageSize = Math.min(100, Number(c.req.query("pageSize") ?? 20));

      const where: any = {};
      if (statusCode) where.statusCode = Number(statusCode);
      if (urlContains) where.url = { contains: urlContains };
      if (from || to) {
        where.createdAt = {} as any;
        if (from) (where.createdAt as any).gte = new Date(from);
        if (to) (where.createdAt as any).lte = new Date(to);
      }
      if (isErrorParam === "true") {
        where.statusCode = { gte: 400 };
      } else if (isErrorParam === "false") {
        where.statusCode = { lt: 400 };
      }

      const [total, items] = await Promise.all([
        prisma.apiLog.count({ where }),
        prisma.apiLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            method: true,
            url: true,
            statusCode: true,
            durationMs: true,
            ip: true,
            userAgent: true,
            notes: true,
            createdAt: true,
          },
        }),
      ]);

      await prisma.$disconnect();
      return c.json({ success: true, total, page, pageSize, items });
    } catch (err: any) {
      await prisma.$disconnect();
      return c.json({ success: false, error: err?.message ?? "Invalid request" }, 400);
    }
  });

  return app;
}


