import { Context } from "hono";
import {
  addPoints,
  DAYS_PER_SUBSCRIPTION_MONTH,
  deductPoints,
  getUserPoints,
  isSubscriptionActive,
  SUBSCRIPTION_PRICE_PER_MONTH,
} from "../../../common/paymentUtils";
import { createPrismaClient } from "../../../common/prismaUtils";
import { logApi } from "../../../common/historyLogger";
import { getUserFromToken } from "../../../common/utils";
import { addPointsIdempotent } from "../../../common/paymentUtils";
import { buildPaginationMeta, parsePagination, parseSort } from "../../../common/paginationUtils";

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

// 주문 생성 API: 서버가 orderId를 생성하고 Payment 레코드 생성
export async function initiateOrderApi(c: Context) {
  try {
    const user = await getUserFromToken(c);
    if (!user) return c.json({ error: "인증이 필요합니다." }, 401);

    const { amount, currency = "KRW" } = (await c.req.json()) as {
      amount?: number;
      currency?: string;
    };
    if (!amount || amount <= 0) {
      return c.json({ success: false, message: "유효하지 않은 금액입니다." }, 400);
    }

    const prisma = createPrismaClient(c.env.DB);
    try {
      const orderId = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const payment = await (prisma as any).payment.create({
        data: ({
          orderId,
          userId: user.id,
          amount: Math.floor(amount),
          currency,
          provider: "nicepay",
          status: "created",
        } as any),
      });

      return c.json({
        success: true,
        message: "주문이 생성되었습니다.",
        data: {
          orderId: payment.orderId,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  } catch (error) {
    console.error("Initiate order API error:", error);
    return c.json({ success: false, message: "주문 생성 중 오류가 발생했습니다." }, 500);
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

// 나이스페이 결제 승인 처리 API
export async function nicepayApproveApi(c: Context) {
  try {
    // 1) 본문 파싱 (x-www-form-urlencoded / json 모두 지원) + 원문 보존
    const contentType = (c.req.header("content-type") || "").toLowerCase();
    const rawText = await c.req.text();
    let body: any = {};
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams(rawText);
      body = Object.fromEntries(params.entries());
    } else if (contentType.includes("application/json")) {
      try {
        body = JSON.parse(rawText);
      } catch {
        return c.json({ success: false, message: "JSON 파싱 실패" }, 400);
      }
    } else {
      // 기타 타입 폴백: JSON → URLSearchParams 순서로 시도
      try {
        body = JSON.parse(rawText);
      } catch {
        const params = new URLSearchParams(rawText);
        body = Object.fromEntries(params.entries());
      }
    }

    const tid: string | undefined = body?.tid ?? body?.TID ?? body?.Tid;
    const amountRaw = body?.amount ?? body?.Amount;
    const amount: number | undefined = typeof amountRaw === "number" ? amountRaw : Number(amountRaw);

    if (!tid || !amount || Number.isNaN(amount) || amount <= 0) {
      return c.json(
        { success: false, message: "유효한 tid와 amount가 필요합니다." },
        400
      );
    }

    // 2) 나이스페이 결제 승인 API 호출
    const isDev = c.env.ENVIRONMENT === 'development';
    const clientKey: string = isDev ? 'S2_61d1c9e69d0f42f990151d0eb849861c' : c.env.NICE_CLIENT_KEY;
    const secretKey: string = isDev ? '9b3f39dfeb8b489dbac6adda9e07bdff' : c.env.NICE_SECRET_KEY;

    if (!clientKey || !secretKey) {
      return c.json({ success: false, message: "결제 승인 키가 설정되지 않았습니다." }, 500);
    }

    const basic = typeof btoa === "function" ? btoa(`${clientKey}:${secretKey}`) : Buffer.from(`${clientKey}:${secretKey}`).toString("base64");
    const baseUrl = isDev ? "https://sandbox-api.nicepay.co.kr/v1/payments" : "https://api.nicepay.co.kr/v1/payments";
    const finalUrl = `${baseUrl}/${encodeURIComponent(tid)}`;
    const startedAt = Date.now();
    const approveRes = await fetch(finalUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${basic}`,
      },
      body: JSON.stringify({ amount: Math.floor(amount) }),
    });

    const approveJson: any = await approveRes.json().catch(() => ({}));
    const durationMs = Date.now() - startedAt;

    const isOk = approveRes.ok && (!approveJson?.resultCode || approveJson.resultCode === "0000");

    // 3) history(ApiLog)에 응답 저장
    const prisma = createPrismaClient(c.env.DB);
    try {
      const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? undefined;
      const userAgent = c.req.header("user-agent") ?? undefined;
      await logApi(prisma, {
        method: c.req.method,
        url: c.req.url,
        statusCode: approveRes.status,
        durationMs,
        user: undefined,
        params: { tid, amount, ...body },
        response: approveJson,
        ip,
        userAgent,
        notes: isOk ? "nicepay-approve:response:success" : "nicepay-approve:response:fail",
      });
    } finally {
      await prisma.$disconnect();
    }

    // 5) 프론트 결과 페이지로 리다이렉트 (쿼리 파라미터 포함)
    const success = isOk ? "1" : "0";
    const message = encodeURIComponent(
      (isOk ? (approveJson?.resultMsg || "정상 처리되었습니다.") : (approveJson?.resultMsg || "승인 실패"))
    );
    const orderIdRaw = String(body?.orderId || "");
    const orderId = encodeURIComponent(orderIdRaw);
    const tidEnc = encodeURIComponent(String(tid || ""));
    const amtEnc = encodeURIComponent(String(Math.floor(amount)));
    // 4) 결제 승인 성공 시 Payment 멱등 업데이트 + 포인트 적립
    if (isOk && orderIdRaw) {
      const prisma2 = createPrismaClient(c.env.DB);
      try {
        // 단순 멱등 처리: 이미 승인된 경우 재시도시 무시
        const payment = await prisma2.payment.findUnique({ where: { orderId: orderIdRaw } });
        if (payment && payment.status !== "approved") {
          // 금액 일치 검증
          if (Math.floor(amount) !== (payment as any).amount) {
            // 금액 불일치시 실패 처리로 전환
            await prisma2.payment.update({
              where: { orderId: orderIdRaw },
              data: ({ status: "failed", updatedAt: new Date() } as any),
            });
          } else {
            // 승인 처리 및 TID 저장
            await prisma2.payment.update({
              where: { orderId: orderIdRaw },
              data: ({ status: "approved", tid, rawData: JSON.stringify(approveJson), approvedAt: new Date(), updatedAt: new Date() } as any),
            });
            // 포인트 적립: reference를 tid 기반으로 멱등화
            const reference = `nicepay:${tid}`;
            await addPointsIdempotent(
              c.env.DB,
              (payment as any).userId,
              Math.floor(amount / 10),
              "나이스페이 결제 적립",
              reference
            );
          }
        }
      } catch (e) {
        console.error("nicepay approve idempotent update error:", e);
      } finally {
        await prisma2.$disconnect();
      }
    }

    const resultUrl = `${isDev ? 'http://localhost:9999' : 'https://youram.me'}/saju/payment/result?success=${success}&message=${message}&orderId=${orderId}&tid=${tidEnc}&amount=${amtEnc}`;

    return c.redirect(resultUrl);
  } catch (error) {
    console.error("Nicepay approve API error:", error);
    return c.json(
      { success: false, message: "결제 승인 처리 중 오류가 발생했습니다." },
      500
    );
  }
}

// 사용자 결제 내역 조회 API (페이지네이션)
export async function getUserPaymentsApi(c: Context) {
  try {
    const user = await getUserFromToken(c);
    if (!user) return c.json({ error: "인증이 필요합니다." }, 401);

    const { page, take, skip } = parsePagination(c, { defaultLimit: 20, maxLimit: 100 });
    const { sort, order } = parseSort(c, {
      allowedFields: ["createdAt", "amount", "status"],
      defaultSort: "createdAt",
      defaultOrder: "desc",
    });

    const prisma = createPrismaClient(c.env.DB);
    try {
      const [payments, totalItems] = await Promise.all([
        prisma.payment.findMany({
          where: { userId: (await getUserFromToken(c))!.id, status: { not: "created" } },
          select: {
            id: true,
            orderId: true,
            amount: true,
            currency: true,
            provider: true,
            status: true,
            tid: true,
            rawData: true,
            approvedAt: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { [sort]: order as any },
          skip,
          take,
        }),
        prisma.payment.count({ where: { userId: user.id, status: { not: "created" } } }),
      ]);

      return c.json({
        success: true,
        data: payments.map((p: any) => ({
          id: p.id,
          orderId: p.orderId,
          amount: p.amount,
          currency: p.currency,
          provider: p.provider,
          status: p.status,
          tid: p.tid || undefined,
          rawData: p.rawData ? JSON.parse(p.rawData) : undefined,
          approvedAt: p.approvedAt ? p.approvedAt.toISOString() : undefined,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        })),
        pagination: buildPaginationMeta(totalItems, page, take),
      });
    } finally {
      await prisma.$disconnect();
    }
  } catch (error) {
    console.error("Get user payments API error:", error);
    return c.json({ success: false, message: "결제 내역 조회 중 오류가 발생했습니다." }, 500);
  }
}

// 나이스페이 결제 취소/부분취소 API
// 참고 문서: https://github.com/nicepayments/nicepay-manual/blob/main/api/cancel.md
export async function nicepayCancelApi(c: Context) {
  try {
    const user = await getUserFromToken(c);
    if (!user) return c.json({ error: "인증이 필요합니다." }, 401);

    const body = (await c.req.json().catch(() => ({}))) as { tid?: string; orderId?: string; amount?: number; reason?: string };
    const tid = body.tid?.toString();
    const orderId = body.orderId?.toString();
    const cancelAmountRaw = body.amount;
    const reason = (body.reason || "User requested cancel").toString();

    if ((!tid && !orderId) || !cancelAmountRaw || Number.isNaN(Number(cancelAmountRaw)) || Number(cancelAmountRaw) <= 0) {
      return c.json({ success: false, message: "tid 또는 orderId와 유효한 amount가 필요합니다." }, 400);
    }

    const cancelAmount = Math.floor(Number(cancelAmountRaw));
    const cancelPoints = Math.floor(cancelAmount / 10);

    const prisma = createPrismaClient(c.env.DB);
    try {
      // 결제 조회 (사용자 소유)
      const payment = tid
        ? await prisma.payment.findFirst({ where: { tid, userId: user.id } })
        : await prisma.payment.findFirst({ where: { orderId: orderId!, userId: user.id } });

      if (!payment) {
        return c.json({ success: false, message: "결제 정보를 찾을 수 없습니다." }, 404);
      }

      if ((payment as any).status !== "approved" && (payment as any).status !== "partially_canceled") {
        return c.json({ success: false, message: "취소할 수 없는 결제 상태입니다." }, 400);
      }

      if (!(payment as any).tid) {
        return c.json({ success: false, message: "TID가 없는 결제는 취소할 수 없습니다." }, 400);
      }

      // 이미 취소된 포인트 합산 (해당 TID 기준)
      const refPrefix = `nicepay_cancel:${(payment as any).tid}`;
      const canceledTx = await prisma.pointTransaction.findMany({
        where: { userId: user.id, type: "DEBIT", reference: { startsWith: refPrefix } },
        select: { amount: true },
      });
      const alreadyCanceledPoints = canceledTx.reduce((sum, t) => sum + Math.abs(Number((t as any).amount || 0)), 0);
      // 환불 가능 KRW = 결제 KRW - (이미 회수한 포인트 * 10)
      const refundableRemainingKrw = Math.max(0, Number((payment as any).amount) - alreadyCanceledPoints * 10);

      if (cancelAmount > refundableRemainingKrw) {
        return c.json({ success: false, message: `요청 금액이 환불 가능 금액(${refundableRemainingKrw})을 초과합니다.` }, 400);
      }

      // 잔여 포인트 확인: 현재 포인트가 취소 포인트 이상이어야 함
      const currentPoints = await getUserPoints(c.env.DB, user.id);
      if (currentPoints < cancelPoints) {
        return c.json({ success: false, message: `잔여 포인트(${currentPoints})가 부족하여 취소할 수 없습니다.` }, 400);
      }

      // NICEPAY 취소 요청
      const isDev = c.env.ENVIRONMENT === "development";
      const clientKey: string = isDev ? "S2_61d1c9e69d0f42f990151d0eb849861c" : c.env.NICE_CLIENT_KEY;
      const secretKey: string = isDev ? "9b3f39dfeb8b489dbac6adda9e07bdff" : c.env.NICE_SECRET_KEY;
      if (!clientKey || !secretKey) {
        return c.json({ success: false, message: "결제 취소 키가 설정되지 않았습니다." }, 500);
      }
      const basic = typeof btoa === "function" ? btoa(`${clientKey}:${secretKey}`) : Buffer.from(`${clientKey}:${secretKey}`).toString("base64");
      const baseUrl = isDev ? "https://sandbox-api.nicepay.co.kr/v1/payments" : "https://api.nicepay.co.kr/v1/payments";
      const url = `${baseUrl}/${encodeURIComponent((payment as any).tid)}/cancel`;

      const startedAt = Date.now();
      const cancelRes = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${basic}`,
        },
        body: JSON.stringify({ amount: cancelAmount, reason }),
      });
      const cancelJson: any = await cancelRes.json().catch(() => ({}));
      const ok = cancelRes.ok && (!cancelJson?.resultCode || cancelJson.resultCode === "0000");

      // 로그 저장
      try {
        await logApi(prisma, {
          method: c.req.method,
          url: c.req.url,
          statusCode: cancelRes.status,
          durationMs: Date.now() - startedAt,
          user: { id: user.id, email: (user as any).email, name: (user as any).name },
          params: { tid: (payment as any).tid, amount: cancelAmount, reason },
          response: cancelJson,
          notes: ok ? "nicepay-cancel:response:success" : "nicepay-cancel:response:fail",
        });
      } catch {}

      if (!ok) {
        const msg = cancelJson?.resultMsg || "나이스페이 취소 실패";
        return c.json({ success: false, message: msg, data: cancelJson }, 400);
      }

      // 포인트 차감 (취소 금액만큼 회수)
      const ref = `${refPrefix}:${Date.now()}`;
      const debit = await deductPoints(c.env.DB, user.id, cancelPoints, "나이스페이 결제 취소 환불", ref);
      if (!debit.success) {
        // 경고: 외부 취소는 성공했지만 포인트 차감 실패. 운영자 개입 필요
        return c.json({ success: false, message: "포인트 차감 실패 (외부 취소는 완료됨). 관리자에게 문의해 주세요." }, 500);
      }

      // 결제 상태 업데이트 (전액이면 canceled, 일부면 partially_canceled)
      const newStatus = cancelAmount === refundableRemainingKrw ? "canceled" : "partially_canceled";
      await prisma.payment.update({ where: { id: (payment as any).id }, data: ({ status: newStatus, updatedAt: new Date() } as any) });

      return c.json({
        success: true,
        message: "결제가 취소되었습니다.",
        data: {
          tid: (payment as any).tid,
          canceledAmount: cancelAmount,
          status: newStatus,
          remainingPoints: (debit as any).remainingPoints,
          refundableRemaining: refundableRemainingKrw - cancelAmount,
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  } catch (error) {
    console.error("Nicepay cancel API error:", error);
    return c.json({ success: false, message: "결제 취소 처리 중 오류가 발생했습니다." }, 500);
  }
}