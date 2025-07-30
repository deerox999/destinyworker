import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from './prismaUtils';

// 포인트 상수 정의
export const POINT_COSTS = {
  SAJU_ANALYSIS: 1000,
  COMPATIBILITY_ANALYSIS: 1500,
  YEARLY_FORTUNE: 200,
} as const;

// 포인트 관련 인터페이스
export interface PointTransaction {
  userId: number;
  amount: number; // 양수: 증가, 음수: 차감
  description: string;
  type: "DEBIT" | "CREDIT"; // DEBIT: 차감, CREDIT: 증가
  reference?: string; // 참조 정보 (예: 사주 분석 ID)
  analysisId?: number; // 분석 결과 ID (새로 추가)
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
      analysisId,
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
      analysisId,
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

// 포인트 거래 내역 조회
export async function getPointTransactions(
  db: D1Database,
  userId: number,
  limit: number = 20,
  offset: number = 0
): Promise<
  Array<{
    id: number;
    amount: number;
    description: string;
    type: string;
    reference?: string;
    analysis_id?: number;
    created_at: string;
  }>
> {
  const prisma = createPrismaClient(db);
  try {
    const transactions = await prisma.pointTransaction.findMany({
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
      take: limit,
      skip: offset,
    });

    return transactions.map(t => ({
      id: t.id,
      amount: t.amount,
      description: t.description,
      type: t.type,
      reference: t.reference || undefined,
      analysis_id: t.analysisId || undefined,
      created_at: t.createdAt.toISOString(),
    }));
  } catch (error) {
    console.error("Get point transactions error:", error);
    return [];
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
 * 포인트 거래의 analysis_id를 업데이트합니다.
 */
export async function updatePointTransactionAnalysisId(
  db: D1Database,
  userId: number,
  reference: string,
  analysisId: number
): Promise<boolean> {
  const prisma = createPrismaClient(db);
  try {
    const result = await prisma.pointTransaction.updateMany({
      where: {
        userId,
        reference,
        analysisId: null,
      },
      data: {
        analysisId,
      },
    });

    return result.count > 0;
  } catch (error) {
    console.error("Update point transaction analysis_id error:", error);
    return false;
  } finally {
    await prisma.$disconnect();
  }
}
