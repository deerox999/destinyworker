import { Context } from "hono";
import { GoogleGenAI } from "@google/genai";
import { SERVER_MODEL_CONFIG } from "./utils";
import { buildDailyFortunePrompts } from "./prompt/dailyFortunePrompt";
import { calculateDailyFortuneScores } from "./prompt/dailyFortuneCalculator";

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

    // 기본 모델
    const model = "gemini-2.5-flash";

    const ai = new GoogleGenAI({ apiKey: c.env.GOOGLE_GEMINI_API_KEY });

    // 프론트가 전달한 sajuData를 그대로 사용하되, 길이 검증만 수행
    const MAX_SAJU_JSON_LENGTH = 4000; // 20줄 내외 가이드 기준 약간 여유
    const sajuStr = JSON.stringify(body.sajuData);
    if (sajuStr.length > MAX_SAJU_JSON_LENGTH) {
      return c.json(
        {
          error: "sajuData가 너무 깁니다. 간소화된 형식으로 보내주세요.",
          hint: "{ 사주: { 일주, 월주, 년주, 시주 }, 현재: { 대운, 세운, 월운, 일운 } } 형식 권장",
          maxLength: MAX_SAJU_JSON_LENGTH,
          length: sajuStr.length,
        },
        400
      );
    }
    // 사전 검증을 통과한 간소화된 sajuData 문자열을 그대로 사용

    // 사전 계산: 점수/카테고리/차트
    let precomputed: any | null = null;
    try {
      const { overallScore, categories, elementsStrength } = calculateDailyFortuneScores(
        body.sajuData as any
      );
      // console.log(`overallScore : `, overallScore)
      // console.log(`categories : `, categories)
      // console.log(`elementsStrength : `, elementsStrength)
      precomputed = {
        date: new Date().toISOString().slice(0, 10),
        overallScore,
        categories: categories.map((c) => ({
          key: c.key,
          label: (
            c.key === "love" ? "연애운" :
            c.key === "health" ? "건강운" :
            c.key === "wealth" ? "재물운" :
            c.key === "work" ? "직장운" :
            c.key === "study" ? "학업운" :
            c.key === "social" ? "대인관계운" :
            "창의운"
          ),
          score: c.score,
          description: "",
        })),
        elementsStrength,
        chart: {
          type: "radar",
          labels: [
            "연애운",
            "건강운",
            "재물운",
            "직장운",
            "학업운",
            "대인관계운",
            "창의운",
          ],
          data: categories.map((c) => c.score),
        },
      };
    } catch (e) {
      // 계산 실패 시에도 기존 프롬프트 경로로 진행
      precomputed = null;
    }

    const payload = {
      model,
      systemInstruction: systemPrompt,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: precomputed
                ? `${userPrompt}\n\n사주 데이터:\n${sajuStr}\n\n사전계산 결과(반드시 사용):\n${JSON.stringify(
                    precomputed
                  )}`
                : `${userPrompt}\n\n사주 데이터:\n${sajuStr}`,
            },
          ],
        },
      ],
      generationConfig: {
        ...SERVER_MODEL_CONFIG.generationConfig,
        maxOutputTokens: 1024,
      },
      safetySettings: SERVER_MODEL_CONFIG.safetySettings,
    } as any;

    // console.log("payload : ", payload)
    const resp = await ai.models.generateContent(payload);
    // 사용량(토큰 등) 메타데이터 로깅
    try {
      const usageMetadata = (resp as any)?.response?.usageMetadata ?? (resp as any)?.usageMetadata;
      if (usageMetadata) {
        console.log("[DailyFortune] usageMetadata:", usageMetadata);
      } else {
        console.log("[DailyFortune] usageMetadata: 없음");
      }
    } catch (e) {
      console.log("[DailyFortune] usageMetadata 로깅 실패:", e);
    }
    const text = resp.text as unknown as string;

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
  } catch (error: any) {
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
