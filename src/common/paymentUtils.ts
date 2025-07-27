import { Context } from "hono";

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
  db: any,
  transaction: PointTransaction
): Promise<boolean> {
  try {
    const stmt = db.prepare(`
      INSERT INTO point_transactions (user_id, amount, description, type, reference, analysis_id, created_at) 
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    await stmt
      .bind(
        transaction.userId,
        transaction.amount,
        transaction.description,
        transaction.type,
        transaction.reference || null,
        transaction.analysisId || null
      )
      .run();

    return true;
  } catch (error) {
    console.error("Point transaction save error:", error);
    return false;
  }
}

// 사용자 포인트 조회
export async function getUserPoints(db: any, userId: number): Promise<number> {
  try {
    const stmt = db.prepare("SELECT point FROM users WHERE id = ?");
    const result = await stmt.bind(userId).first();
    return result ? result.point : 0;
  } catch (error) {
    console.error("Get user points error:", error);
    return 0;
  }
}

// 포인트 검증 (충분한 포인트가 있는지 확인)
export async function validatePoints(
  db: any,
  userId: number,
  requiredPoints: number
): Promise<PointValidationResult> {
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
  }
}

// 포인트 차감
export async function deductPoints(
  db: any,
  userId: number,
  amount: number,
  description: string,
  reference?: string,
  analysisId?: number
): Promise<{ success: boolean; message: string; remainingPoints?: number }> {
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
    const stmt = db.prepare(`
      UPDATE users 
      SET point = point - ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);

    const result = await stmt.bind(amount, userId).run();

    if (result.changes === 0) {
      return {
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      };
    }

    // 거래 기록 저장
    const transaction: PointTransaction = {
      userId,
      amount: -amount, // 음수로 저장
      description,
      type: "DEBIT",
      reference,
      analysisId,
    };

    await savePointTransaction(db, transaction);

    // 잔여 포인트 조회
    const remainingPoints = await getUserPoints(db, userId);

    return {
      success: true,
      message: `포인트가 성공적으로 차감되었습니다. (차감: ${amount}, 잔여: ${remainingPoints})`,
      remainingPoints,
    };
  } catch (error) {
    console.error("Deduct points error:", error);
    return {
      success: false,
      message: "포인트 차감 중 오류가 발생했습니다.",
    };
  }
}

// 포인트 증가
export async function addPoints(
  db: any,
  userId: number,
  amount: number,
  description: string,
  reference?: string,
  analysisId?: number
): Promise<{ success: boolean; message: string; newPoints?: number }> {
  try {
    // 포인트 증가
    const stmt = db.prepare(`
      UPDATE users 
      SET point = point + ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);

    const result = await stmt.bind(amount, userId).run();

    if (result.changes === 0) {
      return {
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      };
    }

    // 거래 기록 저장
    const transaction: PointTransaction = {
      userId,
      amount, // 양수로 저장
      description,
      type: "CREDIT",
      reference,
      analysisId,
    };

    await savePointTransaction(db, transaction);

    // 새로운 포인트 조회
    const newPoints = await getUserPoints(db, userId);

    return {
      success: true,
      message: `포인트가 성공적으로 증가되었습니다. (증가: ${amount}, 총 포인트: ${newPoints})`,
      newPoints,
    };
  } catch (error) {
    console.error("Add points error:", error);
    return {
      success: false,
      message: "포인트 증가 중 오류가 발생했습니다.",
    };
  }
}

// 포인트 거래 내역 조회
export async function getPointTransactions(
  db: any,
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
  try {
    const stmt = db.prepare(`
      SELECT id, amount, description, type, reference, analysis_id, created_at 
      FROM point_transactions 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `);

    const result = await stmt.bind(userId, limit, offset).all();
    return result.results || [];
  } catch (error) {
    console.error("Get point transactions error:", error);
    return [];
  }
}

// 포인트 사용 (차감 + 검증을 한번에)
export async function usePoints(
  db: any,
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
  // 사용자 역할 확인
  const userStmt = db.prepare("SELECT role, point FROM users WHERE id = ?");
  const user = await userStmt.bind(userId).first();
  
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
  const result = await deductPoints(db, userId, requiredPoints, description, reference, analysisId);
  
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
}

// 포인트 환불 (차감된 포인트를 다시 돌려줌)
export async function refundPoints(
  db: any,
  userId: number,
  amount: number,
  description: string,
  reference?: string,
  analysisId?: number
): Promise<{ success: boolean; message: string; newPoints?: number }> {
  return await addPoints(db, userId, amount, description, reference, analysisId);
}

/**
 * 포인트 거래의 analysis_id를 업데이트합니다.
 */
export async function updatePointTransactionAnalysisId(
  db: any,
  userId: number,
  reference: string,
  analysisId: number
): Promise<boolean> {
  try {
    const stmt = db.prepare(`
      UPDATE point_transactions 
      SET analysis_id = ? 
      WHERE user_id = ? AND reference = ? AND analysis_id IS NULL
    `);

    const result = await stmt.bind(analysisId, userId, reference).run();
    return result.changes > 0;
  } catch (error) {
    console.error("Update point transaction analysis_id error:", error);
    return false;
  }
}
