import { getLanguageName } from "../../../../common/utils";

export type DailyFortuneCategoryKey =
  | "love"
  | "health"
  | "wealth"
  | "work"
  | "study"
  | "family"
  | "social"
  | "creativity"
  | "travel"
  | "luck";

export interface DailyFortunePromptParams {
  language?: string; // i18n code
  timezone?: string;
}

export function buildDailyFortuneSystemPrompt(language: string) {
  const lang = getLanguageName(language || "ko");
  return `당신은 오늘의 운세를 귀엽고 다정하게 안내하는 사주 해설가입니다. 말투는 따뜻하고 친근하게, 필요할 때만 작고 알맞은 이모지(예: ✨, 💖, 🍀, 😊)를 사용하세요. 내용은 간결하고 실천 가능하게 정리하세요. 반드시 ${lang}로만 답변하세요.`;
}

export function buildDailyFortuneUserPrompt(language: string, timezone: string) {
  // const today = new Date().toISOString().slice(0, 10);
  const lang = getLanguageName(language || "ko");
  return `다음 사주 데이터를 바탕으로 오늘의 운세만 분석하세요.
**중요** 반드시 ${lang}로만 답변하세요. 지정 된 언어로 번역해서 출력해야합니다.

[사전계산 결과 사용 지침]
- 아래에 제공되는 "사전계산 결과"의 date, overallScore, categories.score, chart.labels/data를 그대로 사용하고 수정하지 마세요.
- elementsStrength가 제공되면 텍스트(설명/요약/조언) 작성의 참고로만 쓰세요.
 - 사전계산 결과의 categories[].label 값은 무시하고, 응답 언어(${lang})로 새로 작성하세요.

[출력 규칙]
- JSON만 출력하세요. 마크다운/설명문/코드블록 금지.
- 반드시 여는 { 로 시작해 닫는 } 로 끝나는 하나의 객체만 출력.
- 모든 키와 문자열은 큰따옴표("")만 사용. 작은따옴표('), 주석(//, /* */), 트레일링 콤마 금지.
- date/overallScore/categories[].score/chart.* 값은 사전계산 값을 그대로 사용. 수정 금지.
- description/summary/advice만 작성. 내용은 간결하고 따뜻한 톤, 이모지 최대 1개.
 - categories[].label은 응답 언어(${lang})로 자연스러운 표시 이름으로 번역하여 작성하세요. (예: love → ${lang} 라벨)
 - 예시의 <...> 플레이스홀더는 그대로 출력하지 말고, 실제 ${lang} 표현으로 치환하세요.

[작성 규칙]
- description: 각 항목 1문장, 이모지 최대 1개.
- summary: 가장 강한 1~2 오행과 일간의 관계를 1문장.
- advice: 정확히 7개, 각 15~40자.
- chart는 반드시 포함. labels/data는 아래 스키마와 동일 순서로 7개.
- 내부 추론/아이디어 나열/대안 비교 없이, 정해진 공식만 적용해 즉시 결과를 산출하세요.

출력(JSON only, 7개 카테고리):
{
  "date": "YYYY-MM-DD",
  "overallScore": number,
  "categories": [
    { "key": "love",       "label": "<love label in ${lang}>",       "score": number, "description": string },
    { "key": "health",     "label": "<health label in ${lang}>",     "score": number, "description": string },
    { "key": "wealth",     "label": "<wealth label in ${lang}>",     "score": number, "description": string },
    { "key": "work",       "label": "<work label in ${lang}>",       "score": number, "description": string },
    { "key": "study",      "label": "<study label in ${lang}>",      "score": number, "description": string },
    { "key": "creativity", "label": "<creativity label in ${lang}>", "score": number, "description": string },
    { "key": "social",     "label": "<social label in ${lang}>",     "score": number, "description": string }
  ],
  "summary": string,
  "advice": [string, string, string],
  "chart": {
    "type": "radar",
    "labels": ["<use provided labels as-is>", "..."],
    "data": [number, number, number, number, number, number, number]
  }
}

주의:
- 반드시 ${lang} JSON으로만 출력하세요. 여는 중괄호 { 부터 닫는 중괄호 } 까지 하나의 객체만 출력.
- 오늘의 운세만. 과거/미래 장황한 설명 금지.
- 텍스트 필드(description, summary, advice, categories[].label)는 모두 ${lang}로 작성하되, 과도한 이모지/감탄사/장문 금지.`;
}

export function buildDailyFortunePrompts(params?: DailyFortunePromptParams) {
  const language = params?.language || "ko";
  const timezone = params?.timezone || "Asia/Seoul";
  const systemPrompt = buildDailyFortuneSystemPrompt(language);
  const userPrompt = buildDailyFortuneUserPrompt(language, timezone);
  return { systemPrompt, userPrompt };
}


