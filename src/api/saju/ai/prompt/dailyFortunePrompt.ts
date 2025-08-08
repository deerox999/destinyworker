import { getLanguageName } from "../../../../common/utils";

export type DailyFortuneCategoryKey =
  | "love"
  | "health"
  | "wealth"
  | "work"
  | "study";

export interface DailyFortunePromptParams {
  language?: string; // i18n code
  timezone?: string;
}

export function buildDailyFortuneSystemPrompt(language: string) {
  const lang = getLanguageName(language || "ko");
  return `당신은 오늘의 운세를 간결하고 실용적으로 안내하는 전문 사주 해설가입니다. 반드시 ${lang}로만 답변하세요.`;
}

export function buildDailyFortuneUserPrompt(language: string, timezone: string) {
  const today = new Date().toISOString().slice(0, 10);
  const lang = getLanguageName(language || "ko");

  return `다음 사주 데이터를 바탕으로 "오늘(${today}, timezone:${timezone})"의 운세만 분석하세요.

요구사항:
1) 아래 스키마와 일치하는 JSON만 출력하세요. 마크다운, 설명문, 코드블록 금지.
2) 각 점수는 0~100 정수, 합리적 분포로 설정.
3) 각 설명은 1~2문장으로 짧고 행동지향적으로 작성.
4) 요약과 조언은 중복 없이 실천 가능한 문장으로 작성.
5) 차트 데이터는 categories의 score를 그대로 사용해 radar 차트로 구성.

출력 스키마(JSON only):
{
  "date": "YYYY-MM-DD",
  "overallScore": number, // 0~100
  "categories": [
    { "key": "love",   "label": "연애운", "score": number, "description": string },
    { "key": "health", "label": "건강운", "score": number, "description": string },
    { "key": "wealth", "label": "재물운", "score": number, "description": string },
    { "key": "work",   "label": "직장운", "score": number, "description": string },
    { "key": "study",  "label": "학업운", "score": number, "description": string }
  ],
  "summary": string,
  "advice": [string, string],
  "chart": {
    "type": "radar",
    "labels": ["연애운", "건강운", "재물운", "직장운", "학업운"],
    "data": [number, number, number, number, number] // categories score 순서와 동일
  }
}

주의:
- 반드시 ${lang} JSON으로만 출력하세요. 여는 중괄호 { 부터 닫는 중괄호 } 까지 하나의 객체만 출력.
- 오늘의 운세만. 과거/미래 장황한 설명 금지.`;
}

export function buildDailyFortunePrompts(params?: DailyFortunePromptParams) {
  const language = params?.language || "ko";
  const timezone = params?.timezone || "Asia/Seoul";
  const systemPrompt = buildDailyFortuneSystemPrompt(language);
  const userPrompt = buildDailyFortuneUserPrompt(language, timezone);
  return { systemPrompt, userPrompt };
}


