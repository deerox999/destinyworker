import { Context } from "hono";
import { GoogleGenAI } from "@google/genai";
import { buildGeminiPayload } from "./utils";
import { buildDailyFortunePrompts } from "./prompt/dailyFortunePrompt";

interface DailyFortuneRequest {
  sajuData: any;
  options?: {
    i18n?: string; // default: ko
    timezone?: string; // default: Asia/Seoul
  };
}

export async function DailyFortune(c: Context): Promise<Response> {
  try {
    const body: DailyFortuneRequest = await c.req.json();
    if (!body || !body.sajuData) {
      return c.json({ error: "sajuData는 필수입니다." }, 400);
    }

    const i18n = body.options?.i18n || "ko";
    const timezone = body.options?.timezone || "Asia/Seoul";

    // 프롬프트 생성 (간결 JSON 스키마 강제)
    const { systemPrompt, userPrompt } = buildDailyFortunePrompts({
      language: i18n,
      timezone,
    });

    // flash 모델 고정
    const model = "gemini-2.5-flash";

    const ai = new GoogleGenAI({ apiKey: c.env.GOOGLE_GEMINI_API_KEY });

    // 공용 페이로드 빌더 활용 (사주데이터 + 시스템/유저 프롬프트)
    const payload = buildGeminiPayload({
      jobId: `daily_${Date.now()}`,
      userId: 0, // 무료 API이므로 사용자 식별 저장 안함
      analysisType: "daily_fortune",
      type: "individual",
      pointsCost: 0,
      reference: "free_daily_fortune",
      i18n,
      timezone,
      userPrompt,
      systemPrompt,
      sajuData: body.sajuData,
      model,
    } as any);

    const resp = await ai.models.generateContent(payload);
    const text = resp.response.text();

    // 결과를 JSON으로 파싱 (코드펜스/서문 제거 대비)
    const cleaned = text
      .trim()
      .replace(/^```(json)?/i, "")
      .replace(/```$/i, "")
      .trim();

    let json: any;
    try {
      json = JSON.parse(cleaned);
    } catch (e) {
      // 최후 보정: 첫 { 부터 마지막 } 까지 추출
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        json = JSON.parse(cleaned.slice(start, end + 1));
      } else {
        return c.json({ error: "AI 응답 파싱 실패", raw: text }, 500);
      }
    }

    // 최소 유효성 검사 및 차트 데이터 보정
    if (!json || typeof json !== "object") {
      return c.json({ error: "잘못된 응답 형식", raw: text }, 500);
    }

    if (!json.chart && Array.isArray(json.categories)) {
      json.chart = {
        type: "radar",
        labels: json.categories.map((c: any) => c.label),
        data: json.categories.map((c: any) => c.score),
      };
    }

    return c.json({ success: true, data: json, model }, 200);
  } catch (error) {
    console.error("[DailyFortune] 오류:", error);
    return c.json(
      {
        error: "오늘의 운세 생성 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}


