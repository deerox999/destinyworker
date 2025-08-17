import { Context } from "hono";
import {
  addPoints,
  deductPoints,
  getUserPoints,
  isSubscriptionActive,
  SUBSCRIPTION_PRICE_PER_MONTH,
  DAYS_PER_SUBSCRIPTION_MONTH,
} from "../../../common/paymentUtils";
import { getUserFromToken } from "../../../common/utils";
import { createPrismaClient } from "../../../common/prismaUtils";

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

// 구독 구매 API (개월 수만큼 30일씩 연장, 최대 12개월/요청)
export async function subscribeApi(c: Context) {
  try {
    const user = await getUserFromToken(c);
    if (!user) return c.json({ error: "인증이 필요합니다." }, 401);

    const body = (await c.req.json()) as { months?: number };
    const months = Math.floor(Number(body.months || 1));
    if (!months || months < 1 || months > 12) {
      return c.json({ error: "months는 1~12 사이의 정수여야 합니다." }, 400);
    }

    const totalPoints = months * SUBSCRIPTION_PRICE_PER_MONTH;
    const reference = `subscription_${Date.now()}_${user.id}_${months}m`;

    // 포인트 차감
    const debit = await deductPoints(
      c.env.DB,
      user.id,
      totalPoints,
      `구독 ${months}개월 구매`,
      reference
    );
    if (!debit.success) {
      return c.json({ success: false, message: debit.message }, 400);
    }

    // 구독 만료일 연장: 남은 기간이 있으면 만료일 기준, 없으면 현재 기준
    const prisma = createPrismaClient(c.env.DB);
    try {
      const existing = await prisma.user.findUnique({
        where: { id: user.id },
      });
      const now = new Date();
      const baseVal = (existing as any)?.subscriptionUntil as Date | undefined;
      const base = baseVal && baseVal > now
        ? baseVal
        : now;
      const extended = new Date(base.getTime() + months * DAYS_PER_SUBSCRIPTION_MONTH * 24 * 60 * 60 * 1000);

      await prisma.user.update({
        where: { id: user.id },
        data: ({ subscriptionUntil: extended, updatedAt: new Date() } as any),
      });

      return c.json({
        success: true,
        message: `구독이 ${months}개월 연장되었습니다.`,
        data: {
          months,
          chargedPoints: totalPoints,
          subscriptionUntil: extended.toISOString(),
          remainingPoints: debit.remainingPoints,
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  } catch (error) {
    console.error("Subscribe API error:", error);
    return c.json(
      { success: false, message: "구독 처리 중 오류가 발생했습니다." },
      500
    );
  }
}

// 구독 환불 API (30일 단위, 현재 30일만 남았을 경우 환불 불가)
export async function refundSubscriptionApi(c: Context) {
  try {
    const user = await getUserFromToken(c);
    if (!user) return c.json({ error: "인증이 필요합니다." }, 401);

    const body = (await c.req.json()) as { months?: number };
    const reqMonthsRaw = body.months;

    const sub = await isSubscriptionActive(c.env.DB, user.id);
    if (!sub.subscriptionUntil) {
      return c.json({ success: false, message: "구독 정보가 없습니다." }, 400);
    }
    if (!sub.active && sub.remainingDays <= 0) {
      return c.json({ success: false, message: "이미 구독이 만료되었습니다." }, 400);
    }
    // 30일만 남았을 경우 환불 불가
    if (sub.remainingMonths === 1 && sub.remainingDays % DAYS_PER_SUBSCRIPTION_MONTH === 0) {
      return c.json({ success: false, message: "남은 기간이 30일뿐이어서 환불이 불가능합니다." }, 400);
    }

    const maxRefundableMonths = Math.floor(sub.remainingDays / DAYS_PER_SUBSCRIPTION_MONTH);
    if (maxRefundableMonths <= 0) {
      return c.json({ success: false, message: "환불 가능한 30일 단위가 없습니다." }, 400);
    }

    const monthsToRefund = reqMonthsRaw ? Math.floor(Number(reqMonthsRaw)) : maxRefundableMonths;
    if (monthsToRefund < 1 || monthsToRefund > maxRefundableMonths) {
      return c.json({ success: false, message: `환불 가능한 개월 수는 1~${maxRefundableMonths}개월입니다.` }, 400);
    }

    const refundPoints = monthsToRefund * SUBSCRIPTION_PRICE_PER_MONTH;

    // 만료일 감소
    const prisma = createPrismaClient(c.env.DB);
    try {
      const current = await prisma.user.findUnique({
        where: { id: user.id },
      });
      const currentUntil = (current as any)?.subscriptionUntil as Date | undefined;
      if (!currentUntil) {
        return c.json({ success: false, message: "구독 정보가 없습니다." }, 400);
      }
      const newUntil = new Date(
        currentUntil.getTime() - monthsToRefund * DAYS_PER_SUBSCRIPTION_MONTH * 24 * 60 * 60 * 1000
      );
      await prisma.user.update({
        where: { id: user.id },
        data: ({ subscriptionUntil: newUntil, updatedAt: new Date() } as any),
      });

      // 포인트 환불
      const reference = `subscription_refund_${Date.now()}_${user.id}_${monthsToRefund}m`;
      const credit = await addPoints(
        c.env.DB,
        user.id,
        refundPoints,
        `구독 ${monthsToRefund}개월 환불`,
        reference
      );

      if (!credit.success) {
        return c.json({ success: false, message: credit.message }, 500);
      }

      return c.json({
        success: true,
        message: `구독 ${monthsToRefund}개월이 환불되었습니다.`,
        data: {
          months: monthsToRefund,
          refundedPoints: refundPoints,
          subscriptionUntil: newUntil.toISOString(),
          newPoints: credit.newPoints,
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  } catch (error) {
    console.error("Refund subscription API error:", error);
    return c.json(
      { success: false, message: "구독 환불 처리 중 오류가 발생했습니다." },
      500
    );
  }
}
