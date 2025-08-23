import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from './prismaUtils';
import { buildPaginationMeta } from './paginationUtils';

// 구독 관련 상수
export const SUBSCRIPTION_PRICE_PER_MONTH = 900; // 900 포인트 = 1개월
export const DAYS_PER_SUBSCRIPTION_MONTH = 30; // 정확히 30일 기준

// analysisType과 요청 type(individual/compatibility)에 따른 포인트 계산 함수
export function getAnalysisTypePoints(analysisType: string, type?: string): number {
  if (type === "compatibility") return 600;
  switch (analysisType) {
    case "연간운세": return 150;
    case "종합운세": return 500;
    default: return 300;
  }
}

// 포인트 관련 인터페이스
export interface PointTransaction {
  userId: number;
  amount: number; // 양수: 증가, 음수: 차감
  description: string;
  type: "DEBIT" | "CREDIT"; // DEBIT: 차감, CREDIT: 증가
  reference?: string; // 참조 정보 (예: 사주 분석 ID)
  analysisId?: number | null; // 분석 결과 ID (새로 추가)
}

export interface PointValidationResult {
  isValid: boolean;
  currentPoints: number;
  requiredPoints: number;
  remainingPoints: number;
  message?: string;
  // i18n을 위한 구조화된 데이터 추가
  data?: {
    current: number;
    required: number;
    remaining: number;
    shortage: number;
    isAdmin?: boolean; // 관리자 여부
  };
}

// 포인트 거래 기록 저장
async function savePointTransaction(
  prisma: PrismaClient,
  transaction: PointTransaction
): Promise<boolean> {
  try {
    await prisma.pointTransaction.create({
      data: {
        userId: transaction.userId,
        amount: transaction.amount,
        description: transaction.description,
        type: transaction.type,
        reference: transaction.reference || null,
        analysisId: transaction.analysisId || null,
      },
    });

    return true;
  } catch (error) {
    console.error("Point transaction save error:", error);
    return false;
  }
}

// 사용자 포인트 조회
export async function getUserPoints(db: D1Database, userId: number): Promise<number> {
  const prisma = createPrismaClient(db);
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { point: true },
    });
    return user ? user.point : 0;
  } catch (error) {
    console.error("Get user points error:", error);
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

// 구독 활성 여부 및 잔여 기간 계산
export async function isSubscriptionActive(
  db: D1Database,
  userId: number
): Promise<{ active: boolean; subscriptionUntil: Date | null; remainingDays: number; remainingMonths: number }> {
  const prisma = createPrismaClient(db);
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionUntil: true },
    });
    const until = user?.subscriptionUntil ?? null;
    if (!until) {
      return { active: false, subscriptionUntil: null, remainingDays: 0, remainingMonths: 0 };
    }
    const now = new Date();
    const ms = until.getTime() - now.getTime();
    const remainingDays = Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
    const remainingMonths = Math.floor(remainingDays / DAYS_PER_SUBSCRIPTION_MONTH);
    return { active: ms > 0, subscriptionUntil: until, remainingDays, remainingMonths };
  } catch (error) {
    console.error("Check subscription error:", error);
    return { active: false, subscriptionUntil: null, remainingDays: 0, remainingMonths: 0 };
  } finally {
    await prisma.$disconnect();
  }
}

// 포인트 검증 (충분한 포인트가 있는지 확인)
export async function validatePoints(
  db: D1Database,
  userId: number,
  requiredPoints: number
): Promise<PointValidationResult> {
  const prisma = createPrismaClient(db);
  try {
    const currentPoints = await getUserPoints(db, userId);
    const remainingPoints = currentPoints - requiredPoints;

    return {
      isValid: remainingPoints >= 0,
      currentPoints,
      requiredPoints,
      remainingPoints,
      message:
        remainingPoints >= 0
          ? `포인트가 충분합니다. (현재: ${currentPoints}, 필요: ${requiredPoints}, 잔여: ${remainingPoints})`
          : `포인트가 부족합니다. (현재: ${currentPoints}, 필요: ${requiredPoints}, 부족: ${Math.abs(
              remainingPoints
            )})`,
      data: {
        current: currentPoints,
        required: requiredPoints,
        remaining: remainingPoints,
        shortage: Math.abs(Math.min(0, remainingPoints)),
      },
    };
  } catch (error) {
    console.error("Validate points error:", error);
    return {
      isValid: false,
      currentPoints: 0,
      requiredPoints,
      remainingPoints: -requiredPoints,
      message: "포인트 검증 중 오류가 발생했습니다.",
      data: {
        current: 0,
        required: requiredPoints,
        remaining: -requiredPoints,
        shortage: requiredPoints,
      },
    };
  } finally {
    await prisma.$disconnect();
  }
}

// 포인트 차감
export async function deductPoints(
  db: D1Database,
  userId: number,
  amount: number,
  description: string,
  reference?: string,
  analysisId?: number
): Promise<{ success: boolean; message: string; remainingPoints?: number }> {
  const prisma = createPrismaClient(db);
  try {
    // 포인트 검증
    const validation = await validatePoints(db, userId, amount);
    if (!validation.isValid) {
      return {
        success: false,
        message: validation.message || "포인트가 부족합니다.",
      };
    }

    // 포인트 차감
    const result = await prisma.user.update({
      where: { id: userId },
      data: { 
        point: { decrement: amount },
        updatedAt: new Date(),
      },
      select: { point: true },
    });

    // 거래 기록 저장
    const transaction: PointTransaction = {
      userId,
      amount: -amount, // 음수로 저장
      description,
      type: "DEBIT",
      reference,
      analysisId: analysisId || null,
    };

    await savePointTransaction(prisma, transaction);

    return {
      success: true,
      message: `포인트가 성공적으로 차감되었습니다. (차감: ${amount}, 잔여: ${result.point})`,
      remainingPoints: result.point,
    };
  } catch (error) {
    console.error("Deduct points error:", error);
    return {
      success: false,
      message: "포인트 차감 중 오류가 발생했습니다.",
    };
  } finally {
    await prisma.$disconnect();
  }
}

// 포인트 증가
export async function addPoints(
  db: D1Database,
  userId: number,
  amount: number,
  description: string,
  reference?: string,
  analysisId?: number
): Promise<{ success: boolean; message: string; newPoints?: number }> {
  const prisma = createPrismaClient(db);
  try {
    // 포인트 증가
    const result = await prisma.user.update({
      where: { id: userId },
      data: { 
        point: { increment: amount },
        updatedAt: new Date(),
      },
      select: { point: true },
    });

    // 거래 기록 저장
    const transaction: PointTransaction = {
      userId,
      amount, // 양수로 저장
      description,
      type: "CREDIT",
      reference,
      analysisId: analysisId || null,
    };

    await savePointTransaction(prisma, transaction);

    return {
      success: true,
      message: `포인트가 성공적으로 증가되었습니다. (증가: ${amount}, 총 포인트: ${result.point})`,
      newPoints: result.point,
    };
  } catch (error) {
    console.error("Add points error:", error);
    return {
      success: false,
      message: "포인트 증가 중 오류가 발생했습니다.",
    };
  } finally {
    await prisma.$disconnect();
  }
}

// 포인트 증가(멱등): 동일 (userId, reference) 거래가 이미 있으면 중복 증가를 방지
export async function addPointsIdempotent(
  db: D1Database,
  userId: number,
  amount: number,
  description: string,
  reference?: string,
  analysisId?: number
): Promise<{ success: boolean; message: string; newPoints?: number }> {
  const prisma = createPrismaClient(db);
  try {
    // reference 없으면 일반 증가 사용
    if (!reference) {
      return await addPoints(db, userId, amount, description, reference, analysisId);
    }

    // 이미 동일 거래가 존재하면 현재 포인트 반환하며 성공 처리
    const existing = await prisma.pointTransaction.findFirst({
      where: { userId, reference },
      select: { id: true },
    });
    if (existing) {
      const current = await prisma.user.findUnique({ where: { id: userId }, select: { point: true } });
      return {
        success: true,
        message: "이미 처리된 거래입니다.",
        newPoints: current?.point,
      };
    }

    // 증가와 거래기록을 하나의 트랜잭션으로 처리
    const [updated] = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { point: { increment: amount }, updatedAt: new Date() },
        select: { point: true },
      }),
      prisma.pointTransaction.create({
        data: {
          userId,
          amount,
          description,
          type: "CREDIT",
          reference,
          analysisId: analysisId ?? null,
        },
      }),
    ]);

    return {
      success: true,
      message: `포인트가 성공적으로 증가되었습니다. (증가: ${amount}, 총 포인트: ${updated.point})`,
      newPoints: updated.point,
    };
  } catch (error) {
    console.error("Add points idempotent error:", error);
    return {
      success: false,
      message: "포인트 증가 중 오류가 발생했습니다.",
    };
  } finally {
    await prisma.$disconnect();
  }
}

// 포인트 거래 내역 조회
export async function getPointTransactions(
  db: D1Database,
  userId: number,
  page: number = 1,
  limit: number = 20
): Promise<{
  transactions: Array<{
    id: number;
    amount: number;
    description: string;
    type: string;
    reference?: string;
    analysisId?: number;
    createdAt: string;
  }>;
  pagination: { totalItems: number; totalPages: number; currentPage: number; pageSize: number };
}> {
  const prisma = createPrismaClient(db);
  try {
    const take = Math.max(1, Math.floor(limit));
    const currentPage = Math.max(1, Math.floor(page));
    const skip = (currentPage - 1) * take;

    const [transactions, totalItems] = await Promise.all([
      prisma.pointTransaction.findMany({
        where: { userId },
        select: {
          id: true,
          amount: true,
          description: true,
          type: true,
          reference: true,
          analysisId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      prisma.pointTransaction.count({ where: { userId } }),
    ]);

    const mapped = transactions.map(t => ({
      id: t.id,
      amount: t.amount,
      description: t.description,
      type: t.type,
      reference: t.reference || undefined,
      analysisId: t.analysisId || undefined,
      createdAt: t.createdAt.toISOString(),
    }));

    return {
      transactions: mapped,
      pagination: buildPaginationMeta(totalItems, currentPage, take),
    };
  } catch (error) {
    console.error("Get point transactions error:", error);
    return { transactions: [], pagination: buildPaginationMeta(0, 1, Math.max(1, Math.floor(limit))) };
  } finally {
    await prisma.$disconnect();
  }
}

// 포인트 사용 (차감 + 검증을 한번에)
export async function usePoints(
  db: D1Database,
  userId: number,
  requiredPoints: number,
  description: string,
  reference?: string,
  analysisId?: number
): Promise<{
  success: boolean;
  message: string;
  remainingPoints?: number;
  data?: {
    current: number;
    required: number;
    remaining: number;
    shortage: number;
    isAdmin?: boolean;
  };
}> {
  const prisma = createPrismaClient(db);
  
  try {
    // 사용자 역할 확인
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, point: true },
    });

    if (!user) {
      return {
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      };
    }

    // 먼저 검증
    const validation = await validatePoints(db, userId, requiredPoints);
    if (!validation.isValid) {
      return {
        success: false,
        message: validation.message || "포인트가 부족합니다.",
        data: validation.data,
      };
    }

    // 차감 실행
    const result = await deductPoints(
      db,
      userId,
      requiredPoints,
      description,
      reference,
      analysisId
    );

    // 차감 성공 시 data 추가
    if (result.success && result.remainingPoints !== undefined) {
      return {
        ...result,
        data: {
          current: result.remainingPoints + requiredPoints, // 차감 전 포인트
          required: requiredPoints,
          remaining: result.remainingPoints,
          shortage: 0,
        },
      };
    }

    return result;
  } catch (error) {
    console.error("Use points error:", error);
    return {
      success: false,
      message: "포인트 사용 중 오류가 발생했습니다.",
    };
  } finally {
    // Prisma 클라이언트 정리
    try {
      await prisma.$disconnect();
    } catch (disconnectError) {
      console.error("Prisma disconnect error:", disconnectError);
    }
  }
}

// 포인트 환불 (차감된 포인트를 다시 돌려줌)
export async function refundPoints(
  db: D1Database,
  userId: number,
  amount: number,
  description: string,
  reference?: string,
  analysisId?: number
): Promise<{ success: boolean; message: string; newPoints?: number }> {
  return await addPoints(
    db,
    userId,
    amount,
    description,
    reference,
    analysisId
  );
}

/**
 * 포인트 거래의 analysisId를 업데이트합니다.
 * Prisma 대신 직접 D1 쿼리를 사용합니다.
 */
export async function updatePointTransactionAnalysisId(
  db: D1Database,
  userId: number,
  reference: string,
  analysisId: number
): Promise<boolean> {
  try {
    // 먼저 해당 거래가 존재하는지 확인
    const checkResult = await db
      .prepare(
        "SELECT id, analysisId FROM PointTransaction WHERE userId = ? AND reference = ?"
      )
      .bind(userId, reference)
      .first();

    if (!checkResult) {
      return false;
    }

    // 이미 analysisId가 설정되어 있는지 확인
    if (checkResult.analysisId !== null) {
      return true; // 이미 설정되어 있으면 성공으로 처리
    }

    // analysisId 업데이트
    const result = await db
      .prepare(
        "UPDATE PointTransaction SET analysisId = ? WHERE userId = ? AND reference = ? AND analysisId IS NULL"
      )
      .bind(analysisId, userId, reference)
      .run();

    return (result.meta?.changes ?? 0) > 0;
  } catch (error) {
    console.error("[PaymentUtils] Update point transaction analysisId error:", error);
    return false;
  }
}
