import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";
import { Context } from "hono";
import { getUserFromToken } from "./utils";

export const createPrismaClient = (db: D1Database) => {
  const adapter = new PrismaD1(db);
  const client = new PrismaClient({
    adapter,
    log: ["error"], // 에러만 로깅
  });
  // Cloudflare Workers 환경에서 Node 엔진 경로로 $disconnect가 setImmediate를 참조하며
  // 오류가 발생할 수 있어 안전하게 no-op으로 우회
  // Driver Adapter(D1) 사용 시 연결 해제는 의미가 없으므로 무시해도 무방
  (client as any).$disconnect = async () => {};
  return client;
};

// 관리자 권한 체크
export const isAdmin = async (c: Context): Promise<boolean> => {
  const user = await getUserFromToken(c);
  if (!user) return false;

  // 토큰에서 role 확인하거나, DB에서 재확인
  if (user.role === "admin" || user.email === "deerox999@gmail.com") return true;

  // DB에서 재확인 (토큰이 오래된 경우 대비)
  try {
    const prisma = createPrismaClient(c.env.DB);
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true },
    });
    await prisma.$disconnect();
    return dbUser?.role === "admin";
  } catch {
    return false;
  }
};
