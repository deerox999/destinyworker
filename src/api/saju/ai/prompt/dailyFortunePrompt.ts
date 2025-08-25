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
  

[출력 규칙]
- JSON만 출력하세요. 마크다운/설명문/코드블록 금지.
- 반드시 여는 { 로 시작해 닫는 } 로 끝나는 하나의 객체만 출력.
- 모든 키와 문자열은 큰따옴표("")만 사용. 작은따옴표('), 주석(//, /* */), 트레일링 콤마 금지.
- date/overallScore/categories[].score/chart.* 값은 사전계산 값을 그대로 사용. 수정 금지.
- description/summary/advice만 작성. 내용은 간결하고 따뜻한 톤, 이모지 최대 1개.
  - categories[].label은 응답 언어(${lang})로 자연스러운 표시 이름으로 번역하여 작성하세요.
  - 아래 lucky, moods 필드는 반드시 포함해 작성하세요.

[작성 규칙]
- description: 각 항목 1문장, 이모지 최대 1개.
- summary: 가장 강한 1~2 오행과 일간의 관계를 1문장.
- advice: 정확히 7개, 각 15~40자.
- chart는 반드시 포함. labels/data는 아래 스키마와 동일 순서로 7개.
- 내부 추론/아이디어 나열/대안 비교 없이, 정해진 공식만 적용해 즉시 결과를 산출하세요.
  
  [행운 정보(lucky) 작성 규칙]
  - lucky.direction: { value, note } 형식. value는 방향(예: 북쪽/남쪽/동쪽/서쪽 등), note는 8~20자 추가 설명.
  - lucky.place: { value, note } 형식. value는 장소/위치(예: 창가 자리, 공원 산책로 등), note는 8~20자 추가 설명.
  - lucky.item: { value, note } 형식. value는 소지품/아이템, note는 8~20자 추가 설명.
  - lucky.number: { value, note } 형식. value는 숫자, note는 해당 숫자에 대한 짤막한 의미 설명(예: 7이면 "의사결정에 행운을").
  - lucky.color: { value, note } 형식. value는 색상, note는 8~20자 추가 설명.
  - lucky.food: { value, note } 형식. value는 음식, note는 8~20자 추가 설명.
  - lucky.drink: { value, note } 형식. value는 음료, note는 8~20자 추가 설명.
  - lucky.music: { value, note } 형식. value는 음악, note는 8~20자 추가 설명.
  - lucky.movie: { value, note } 형식. value는 영화, note는 8~20자 추가 설명.
  - lucky.book: { value, note } 형식. value는 책, note는 8~20자 추가 설명.
  - lucky.person: { value, note } 형식. value는 사람, note는 8~20자 추가 설명.
  - lucky.animal: { value, note } 형식. value는 동물, note는 8~20자 추가 설명.
  - lucky의 모든 note는 ${lang}로 자연스럽게 작성.
  
  [오늘의 무드(moods) 작성 규칙]
  - moods는 정확히 3개.
  - 각 요소는 { keyword, description } 형식.
  - keyword는 고정 세트가 아닌, 오늘의 경향에 맞춰 임의/다양하게 선택(예: 집중, 만남, 휴식 등).
  - description은 12~30자로 간결하게, 실천 힌트 포함.

  [개인 맞춤 가이드(personalGuide) 작성 규칙]
  - personalGuide는 총 6개 항목이어야 하며, 반드시 아래 3개 고정 항목을 포함해야 합니다:
    1. 아침 가이드
    2. 점심 가이드
    3. 저녁 가이드
  - 나머지 3개는 오늘의 운세와 사용자의 경향에 맞춰 자유롭게 추가로 제안하세요(예: 휴식, 운동, 자기계발, 인간관계 등).
  - 각 항목은 { title, description } 형식으로 작성합니다.
    - title: "아침 가이드", "점심 가이드", "저녁 가이드" 등으로 명확하게 표기
    - description: 15~40자로 구체적이고 실천 가능한 행동 제안(예: "따뜻한 물 한 잔과 가벼운 스트레칭", "가벼운 산책과 심호흡", "블루라이트 줄이고 산책 10분" 등)
  - 모든 description은 ${lang}로 자연스럽고 따뜻하게 작성하세요.

출력(JSON only):
{
  "date": "YYYY-MM-DD",
  "overallScore": number,
  "categories": [
    { "key": "love",       "label": "string", "score": number, "description": string },
    { "key": "health",     "label": "string", "score": number, "description": string },
    { "key": "wealth",     "label": "string", "score": number, "description": string },
    { "key": "work",       "label": "string", "score": number, "description": string },
    { "key": "study",      "label": "string", "score": number, "description": string },
    { "key": "creativity", "label": "string", "score": number, "description": string },
    { "key": "social",     "label": "string", "score": number, "description": string }
  ],
  "summary": string,
  "advice": [string, string, string, string, string, string, string],
  "chart": {
    "type": "radar",
    "labels": [string, string, string, string, string, string, string],
    "data": [number, number, number, number, number, number, number]
  },
  "lucky": {
    "direction": { "value": string, "note": string },
    "place": { "value": string, "note": string },
    "item": { "value": string, "note": string },
    "number": { "value": number, "note": string },
    "color": { "value": string, "note": string },
    "food": { "value": string, "note": string },
    "drink": { "value": string, "note": string },
    "music": { "value": string, "note": string },
    "movie": { "value": string, "note": string },
    "book": { "value": string, "note": string },
    "person": { "value": string, "note": string },
    "animal": { "value": string, "note": string }
  },
  "moods": [
    { "keyword": string, "description": string },
    { "keyword": string, "description": string },
    { "keyword": string, "description": string }
  ],
  "personalGuide": [
    { "title": string, "description": string },
    { "title": string, "description": string },
    { "title": string, "description": string }
  ]
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


