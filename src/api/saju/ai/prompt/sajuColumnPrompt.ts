import { getLanguageName } from "../../../../common/utils";

export type ColumnLevel = "초급" | "중급" | "고급";

export interface GenerateColumnParams {
	title: string;
	level: ColumnLevel;
	language?: string; // iso like "ko"
	minLines?: number; // default 20
	minChars?: number; // default 800
}

export const buildColumnSystemPrompt = (level: ColumnLevel, language: string) => {
	const langName = getLanguageName(language);
	return [
		"당신은 전문 사주 칼럼니스트이자 명리학 강사입니다.",
		"독자가 이해하기 쉬운 구조로 깊이 있는 글을 작성하고, 불필요한 상투구/중복을 피합니다.",
		"출력은 반드시 HTML로만 작성하세요. 코드펜스나 마크다운, 설명 텍스트를 포함하지 마세요.",
		"<h2>, <h3>, <p>, <ul>, <li>, <blockquote> 등 표준 HTML 태그만 사용하세요.",
		"문단 수는 충분히 길게, 최소 20단락 이상을 권장합니다.",
		"중립적이고 근거 중심의 톤으로, 오해 소지가 있는 단정은 피하고 가설/전제를 명시하세요.",
		`난이도는 '${level}' 수준의 독자를 대상으로 합니다. 용어 설명의 깊이와 예시의 난도를 이에 맞추세요.`,
		langName !== "한국어" ? `반드시 ${langName}로만 작성하세요.` : "",
	].filter(Boolean).join("\n");
};

export const buildColumnUserPrompt = (params: GenerateColumnParams, existingTitles: string[]) => {
	const { title, level, minLines = 20 } = params;
	const difficultyGuide = {
		"초급": [
			"핵심 개념 정의(십성/오행/궁위 등)를 쉬운 비유로 설명",
			"짧은 사례와 Q&A를 섞어 오해를 예방",
			"전문 용어 사용 시 괄호로 간단 풀이",
		],
		"중급": [
			"합/충/형/파/해, 십성-궁위 상호작용을 사례로 해석",
			"서로 다른 이론이 충돌할 때 판단 기준 제시",
			"생활/직무 맥락에서 적용 팁 정리",
		],
		"고급": [
			"격국/용신/조후 관점의 비판적 고찰",
			"흔한 오해 반박과 반례 제시",
			"실전 리딩 시 체크리스트와 의사결정 기준",
		],
	} as const;

	const titleList = existingTitles.slice(0, 9999).map((t, i) => `${i + 1}. ${t}`).join("\n");

	return [
		"요청: 아래 제목의 사주 칼럼 본문을 HTML로 작성하세요.",
		`제목: ${title}`,
		`난이도: ${level}`,
		"제목 중복 회피를 위해 아래 목록과 유사하거나 동일한 제목/구성을 피하세요(참고만).",
		titleList.length > 0 ? `기존 제목 목록(참고):\n${titleList}` : "(기존 제목 없음)",
		"작성 지침:",
		`- 본문 첫 부분에 난이도 뱃지를 삽입하세요: <p><em>난이도: ${level}</em></p>`,
		"- HTML만 출력(코드펜스/설명문 금지)",
		`- 최소 ${minLines}개 이상의 <p> 또는 <li> 단락을 사용하여 충분한 분량을 확보`,
		"- 중복 문구를 피하고, 같은 의미의 반복은 줄이기",
		"- 소제목을 활용해 흐름을 구조화하고, 마지막에 핵심 요약과 실천 팁을 포함",
		"- '오해 방지' 섹션을 포함하여 흔한 오해 3~5개를 Q/A로 정리",
		"- 민감 주제는 단정 대신 선택과 맥락을 강조",
		"출력 형식: 순수 HTML(<!DOCTYPE 등 문서 헤더 불필요).",
	].join("\n");
};

export const buildTitleOnlyPrompt = (level: ColumnLevel, proposedTopic?: string, existingTitles?: string[]) => {
	const base = [
		"당신은 사주 칼럼 제목을 짓는 에디터입니다.",
		"요청에 맞는 단 하나의 제목만 출력하세요. 따옴표/코드펜스 금지.",
		"난이도 표기([초급]/[중급]/[고급])는 제목에 넣지 마세요.",
		"중복/유사 제목을 피하고, 구체적이되 과도하게 길지 않게(전각 기준 12~30자).",
		`난이도: ${level}`,
	];
	if (proposedTopic && proposedTopic.trim()) {
		base.push(`요청 주제 키워드: ${proposedTopic.trim()}`);
	}
	if (existingTitles && existingTitles.length > 0) {
		base.push("기존 제목 목록(참고, 중복 회피용):");
		base.push(existingTitles.slice(0, 9999).map((t, i) => `${i + 1}. ${t}`).join("\n"));
	}
	base.push("출력: 제목 한 줄만.");
	return base.join("\n");
};


