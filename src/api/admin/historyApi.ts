import { Context } from "hono";
import { createPrismaClient } from "../../common/prismaUtils";

export async function getErrorLogs(c: Context) {
  const prisma = createPrismaClient(c.env.DB);
  try {
    const page = Number(c.req.query("page") ?? 1);
    const limit = Number(c.req.query("limit") ?? 20);
    const urlContains = normalizeQueryString(c.req.query("urlContains"));
    const fromDate = parseDateParam(c.req.query("from"));
    const toDate = parseDateParam(c.req.query("to"));

    const where: any = { statusCode: { gte: 400 } };
    if (urlContains) where.url = { contains: urlContains };
    if (fromDate || toDate) {
      where.createdAt = {} as any;
      if (fromDate) (where.createdAt as any).gte = fromDate;
      if (toDate) (where.createdAt as any).lte = toDate;
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

function normalizeQueryString(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed.toLowerCase() === "undefined" || trimmed.toLowerCase() === "null") {
    return undefined;
  }
  return trimmed;
}

function parseDateParam(value?: string | null): Date | undefined {
  const normalized = normalizeQueryString(value);
  if (!normalized) return undefined;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// --- 아래부터 History 라우터의 비즈니스 로직 분리 ---

export async function createApiLog(c: Context) {
  const prisma = createPrismaClient(c.env.DB);
  try {
    const body = await c.req.json();

    const toJson = (v: unknown) => (v === undefined ? null : JSON.stringify(v));

    const ip =
      (body?.ip as string | undefined) ??
      c.req.header("cf-connecting-ip") ??
      c.req.header("x-forwarded-for") ??
      undefined;
    const userAgent = (body?.userAgent as string | undefined) ?? c.req.header("user-agent") ?? undefined;

    const created = await prisma.apiLog.create({
      data: {
        method: body?.method,
        url: body?.url,
        statusCode: body?.statusCode ?? null,
        durationMs: body?.durationMs ?? null,
        userJson: toJson(body?.user),
        paramsJson: toJson(body?.params),
        responseJson: toJson(body?.response),
        ip: ip ?? null,
        userAgent: userAgent ?? null,
        notes: body?.notes ?? null,
      },
    });

    await prisma.$disconnect();
    return c.json({ success: true, id: created.id });
  } catch (err: any) {
    await prisma.$disconnect();
    return c.json({ success: false, error: err?.message ?? "Invalid request" }, 400 as any);
  }
}

export async function getApiLogs(c: Context) {
  const prisma = createPrismaClient(c.env.DB);
  try {
    const isErrorParam = c.req.query("isError");
    const statusCodeRaw = c.req.query("statusCode");
    const urlContains = normalizeQueryString(c.req.query("urlContains"));
    const fromDate = parseDateParam(c.req.query("from"));
    const toDate = parseDateParam(c.req.query("to"));
    const page = Number(c.req.query("page") ?? 1);
    const pageSize = Math.min(100, Number(c.req.query("pageSize") ?? 20));

    const where: any = {};
    const parsedStatusCode = parseInt(String(statusCodeRaw ?? ""), 10);
    if (!Number.isNaN(parsedStatusCode)) where.statusCode = parsedStatusCode;
    if (urlContains) where.url = { contains: urlContains };
    if (fromDate || toDate) {
      where.createdAt = {} as any;
      if (fromDate) (where.createdAt as any).gte = fromDate;
      if (toDate) (where.createdAt as any).lte = toDate;
    }
    if (isErrorParam === "true") {
      where.statusCode = { gte: 400 };
    } else if (isErrorParam === "false") {
      where.statusCode = { lt: 400 };
    }

    console.log(where)

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
    return c.json({ success: false, error: err?.message ?? "Invalid request" }, 400 as any);
  }
}

export async function getApiStats(c: Context) {
  const prisma = createPrismaClient(c.env.DB);
  try {
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    let from = parseDateParam(c.req.query("from")) ?? defaultFrom;
    let to = parseDateParam(c.req.query("to")) ?? now;
    const topNRaw = Number(c.req.query("top") ?? 10);
    const topN = Number.isFinite(topNRaw) && topNRaw > 0 ? topNRaw : 10;

    if (from > to) {
      const tmp = from;
      from = to;
      to = tmp;
    }

    const where: any = { createdAt: { gte: from, lte: to } };

    const [total, errorCount, s2xx, s3xx, s4xx, s5xx, topUrlsRaw, byMethodRaw, recentTimestamps] =
      await Promise.all([
        prisma.apiLog.count({ where }),
        prisma.apiLog.count({ where: { ...where, statusCode: { gte: 400 } } }),
        prisma.apiLog.count({ where: { ...where, statusCode: { gte: 200, lt: 300 } } }),
        prisma.apiLog.count({ where: { ...where, statusCode: { gte: 300, lt: 400 } } }),
        prisma.apiLog.count({ where: { ...where, statusCode: { gte: 400, lt: 500 } } }),
        prisma.apiLog.count({ where: { ...where, statusCode: { gte: 500 } } }),
        prisma.apiLog.groupBy({
          by: ["url"],
          where,
          _count: { url: true },
          orderBy: { _count: { url: "desc" } },
          take: topN,
        }),
        prisma.apiLog.groupBy({
          by: ["method"],
          where,
          _count: { method: true },
          orderBy: { _count: { method: "desc" } },
          take: topN,
        }),
        prisma.apiLog.findMany({ where, select: { createdAt: true, statusCode: true } }),
      ]);

    const dateKey = (d: Date) => d.toISOString().slice(0, 10);
    const dailyMap = new Map<string, { count: number; errorCount: number }>();
    for (const row of recentTimestamps) {
      const key = dateKey(new Date(row.createdAt));
      const prev = dailyMap.get(key) ?? { count: 0, errorCount: 0 };
      prev.count += 1;
      if ((row as any).statusCode && (row as any).statusCode >= 400) prev.errorCount += 1;
      dailyMap.set(key, prev);
    }
    const dailyCounts = Array.from(dailyMap.entries())
      .map(([date, v]) => ({ date, count: v.count, errorCount: v.errorCount }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    const topUrls = topUrlsRaw.map((r) => ({ url: r.url ?? "", count: (r as any)._count?.url ?? 0 }));
    const byMethod = byMethodRaw.map((r) => ({ method: r.method ?? "", count: (r as any)._count?.method ?? 0 }));

    await prisma.$disconnect();
    return c.json({
      success: true,
      total,
      errorCount,
      byStatus: { s2xx, s3xx, s4xx, s5xx },
      topUrls,
      byMethod,
      dailyCounts,
    });
  } catch (err: any) {
    await prisma.$disconnect();
    return c.json({ success: false, error: err?.message ?? "Invalid request" }, 400 as any);
  }
}