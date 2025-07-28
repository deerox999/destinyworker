import { Context } from "hono";
import {
  addPoints,
  deductPoints,
  getUserPoints,
} from "../../../common/paymentUtils";
import { getUserFromToken } from "../../../common/utils";

// 포인트 조회 API
export async function getPointsApi(c: Context) {
  try {
    const user = await getUserFromToken(c);
    if (!user) return c.json({ error: "인증이 필요합니다." }, 401);

    const currentPoints = await getUserPoints(c.env.DB, user.id);

    return c.json({
      success: true,
      message: "포인트 조회 성공",
      data: {
        currentPoints,
      },
    });
  } catch (error) {
    console.error("Get points API error:", error);
    return c.json(
      {
        success: false,
        message: "포인트 조회 중 오류가 발생했습니다.",
      },
      500
    );
  }
}

// 결제 완료 후 포인트 처리 API
export async function completePaymentApi(c: Context) {
  try {
    const {
      amount,
      description,
      reference,
      type = "CREDIT", // CREDIT: 증가, DEBIT: 차감
    } = await c.req.json();

    const user = await getUserFromToken(c);
    if (!user) return c.json({ error: "인증이 필요합니다." }, 401);

    if (!amount || amount <= 0) {
      return c.json(
        {
          success: false,
          message: "유효하지 않은 포인트 금액입니다.",
        },
        400
      );
    }

    if (!description) {
      return c.json(
        {
          success: false,
          message: "포인트 처리 사유를 입력해주세요.",
        },
        400
      );
    }

    // reference가 없으면 자동으로 생성 (결제 ID 형식)
    const finalReference = reference || `payment_${Date.now()}_${user.id}`;

    let result;
    if (type === "CREDIT") {
      // 포인트 증가
      result = await addPoints(
        c.env.DB,
        user.id,
        amount,
        description,
        finalReference
      );
    } else if (type === "DEBIT") {
      // 포인트 차감
      result = await deductPoints(
        c.env.DB,
        user.id,
        amount,
        description,
        finalReference
      );
    } else {
      return c.json(
        {
          success: false,
          message: "유효하지 않은 처리 타입입니다. (CREDIT 또는 DEBIT)",
        },
        400
      );
    }

    if (result.success) {
      const responseData: any = {
        type,
        amount,
      };

      if (type === "CREDIT" && "newPoints" in result) {
        responseData.newTotalPoints = result.newPoints;
      } else if (type === "DEBIT" && "remainingPoints" in result) {
        responseData.remainingPoints = result.remainingPoints;
      }

      return c.json({
        success: true,
        message: result.message,
        data: responseData,
      });
    } else {
      return c.json(
        {
          success: false,
          message: result.message,
        },
        400
      );
    }
  } catch (error) {
    console.error("Complete payment API error:", error);
    return c.json(
      {
        success: false,
        message: "결제 완료 처리 중 오류가 발생했습니다.",
      },
      500
    );
  }
}
