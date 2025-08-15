import { Context } from "hono";
import { createPrismaClient } from "../../common/prismaUtils";

export async function getErrorLogs(c: Context) {
  const prisma = createPrismaClient(c.env.DB);
  try {
    const page = Number(c.req.query("page") ?? 1);
    const limit = Number(c.req.query("limit") ?? 20);
    const urlContains = c.req.query("urlContains");
    const from = c.req.query("from");
    const to = c.req.query("to");

    const where: any = { statusCode: { gte: 400 } };
    if (urlContains) where.url = { contains: urlContains };
    if (from || to) {
      where.createdAt = {} as any;
      if (from) (where.createdAt as any).gte = new Date(from);
      if (to) (where.createdAt as any).lte = new Date(to);
    }

    const [totalItems, items] = await Promise.all([
      prisma.apiLog.count({ where }),
      prisma.apiLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
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
          userJson: true,
        },
      }),
    ]);

    const logs = items.map((it) => ({
      id: it.id,
      method: it.method,
      url: it.url,
      statusCode: it.statusCode ?? null,
      durationMs: it.durationMs ?? null,
      ip: it.ip ?? null,
      userAgent: it.userAgent ?? null,
      notes: it.notes ?? null,
      createdAt: it.createdAt,
      user: safeParseJson(it.userJson),
    }));

    const pageSize = limit;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = Math.min(page, totalPages);

    return c.json({
      success: true,
      logs,
      pagination: {
        totalItems,
        totalPages,
        currentPage,
        pageSize,
      },
    });
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message ?? "Internal error" },
      500
    );
  } finally {
    await prisma.$disconnect();
  }
}

function safeParseJson(text?: string | null) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
