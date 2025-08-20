import { PrismaClient } from "@prisma/client";
export type ApiLogInput = {
  method: string;
  url: string;
  statusCode?: number;
  durationMs?: number;
  user?: unknown; // 사용자 객체 스냅샷(JSON 직렬화됨)
  params?: unknown; // 통합 파라미터(JSON 직렬화됨)
  response?: unknown; // 응답(JSON 직렬화됨)
  ip?: string;
  userAgent?: string;
  notes?: string;
};

export async function logApi(
  prisma: PrismaClient,
  input: ApiLogInput
): Promise<void> {
  const toJson = (v: unknown) => (v === undefined ? null : JSON.stringify(v));
  await prisma.apiLog.create({
    data: {
      method: input.method,
      url: input.url,
      statusCode: input.statusCode ?? null,
      durationMs: input.durationMs ?? null,
      userJson: toJson(input.user),
      paramsJson: toJson(input.params),
      responseJson: toJson(input.response),
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      notes: input.notes ?? null,
    },
  });
}

// Hono 컨텍스트 래퍼: 에러 발생 시 자동 로깅
export function withErrorHistory(
  handler: (c: any) => Promise<any>
) {
  return async (c: any) => {
    const startedAt = Date.now();
    try {
      const res = await handler(c);
      return res;
    } catch (err: any) {
      const durationMs = Date.now() - startedAt;
      try {
        const prisma = (await import("./prismaUtils")).createPrismaClient(c.env.DB);
        const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for");
        const userAgent = c.req.header("user-agent");
        await logApi(prisma as any, {
          method: c.req.method,
          url: c.req.url,
          statusCode: 500,
          durationMs,
          user: c.get?.("user") ?? undefined,
          params: { params: c.req.param?.(), query: c.req.query() },
          ip,
          userAgent,
          notes: "auto-error",
        });
        await (prisma as any).$disconnect?.();
      } catch (_) {}
      throw err;
    }
  };
}


