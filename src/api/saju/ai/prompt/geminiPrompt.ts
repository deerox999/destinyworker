import { getLanguageName } from "../../../../common/utils";
import { getCommonSystemPrompt, getUserPrompt, PromptParams, 분석관점, 특별추가질문, buildCommonSystemPromptSections, joinSections, getOutputFormatTemplate } from "./commonPrompt";

// 유형별 출력 형식은 단일 소스(getOutputFormatTemplate)에서 관리합니다.

/**
 * 서버에서 사용할 사주 해설 프롬프트 생성 함수
 */
export const generateAnalysisPrompts = (params: PromptParams) => {
  const {
    language,
    해설유형 = "종합운세",
    사용자질문 = "",
    사용자맥락정보 = "",
    분석관점 = "현실적",
    어조옵션 = "전문적인",
    이해도레벨 = "중수",
    선택된분석요소 = [],
    user,
    isDevelop = false,
    highQuality = false,
  } = params;

  const languageName = getLanguageName(language);
  // 조립식: 공통 섹션 빌더 사용 (기존 내용 동일)
  const systemSections = buildCommonSystemPromptSections({
    language: languageName,
    isCompatibility: false,
    해설유형,
    분석관점옵션: 분석관점,
    어조옵션,
    이해도레벨옵션: 이해도레벨,
    선택된분석요소,
    사용자맥락정보,
  });
  const systemPrompt = joinSections(systemSections);

  const 출력형식지시 = getOutputFormatTemplate(해설유형);
  let userPrompt = getUserPrompt(해설유형, 사용자질문);
  userPrompt += `${특별추가질문(user, isDevelop)}`;
  return { systemPrompt: `${systemPrompt}\n${출력형식지시}`, userPrompt };
};

// ===== 궁합 관련 함수들 =====

// 궁합 기본 구조 함수
const get궁합기본구조 = (궁합유형: string, 분석관점: 분석관점 = "현실적") => {
  const 톤별분석내용 = {
    약간긍정: {
      기본분석: "조화도와 긍정적 요소를 중점적으로 분석",
      소통분석: "상호 이해도와 소통 방식의 긍정적 측면을 중점적으로 분석",
      협력분석: "협력과 조화 능력",
      조언내용: "성공적인 관계를 위한 긍정적 조언을 중점적으로 제시",
      추가조언: "관계 발전을 위한 구체적 방안",
    },
    약간부정: {
      기본분석: "갈등 요소와 주의사항을 중점적으로 분석",
      소통분석: "소통의 어려움과 갈등 요소를 중점적으로 분석",
      협력분석: "갈등 해결 능력과 주의사항",
      조언내용: "갈등 예방과 해결 방안을 중점적으로 제시",
      추가조언: "관계 유지를 위한 주의사항",
    },
    현실적: {
      기본분석: "조화도와 강약점을 균형 있게 분석",
      소통분석: "상호 이해도와 소통 방식, 갈등 해결 능력을 분석",
      협력분석: "갈등 해결 능력",
      조언내용: "성공적인 관계를 위한 조언과 갈등 예방 방안을 제시",
      추가조언: "갈등 예방과 해결 방안",
    },
  };

  const 분석내용 = 톤별분석내용[분석관점];

  return {
    분석순서: `
### **분석 순서:**
* **1. 두 사람의 사주를 바탕으로 ${궁합유형}의 기본 특성 분석**
* **2. ${궁합유형}에서의 장단점과 주의사항**
`,
    요청항목: `
## 1. ${궁합유형} 기본 분석
- 두 사람의 ${궁합유형} 특성
- ${분석내용.기본분석}

## 2. 관계 조화도
- ${분석내용.소통분석}
- ${분석내용.협력분석}

## 3. ${궁합유형} 조언
- ${분석내용.조언내용}
- ${분석내용.추가조언}
`,
    출력형식: `
**출력 형식:**
\`\`\`markdown

## ${궁합유형} 기본 분석
**분석 내용...**

## 관계 조화도
**분석 내용...**

## ${궁합유형} 조언
**분석 내용...**
\`\`\`
`,
  };
};

/**
 * 서버에서 사용할 사주 궁합 분석 프롬프트 생성 함수
 */
export const generateCompatibilityPrompts = (params: PromptParams) => {
  const {
    language,
    해설유형 = "연인궁합",
    사용자질문 = "",
    사용자맥락정보 = "",
    분석관점 = "현실적",
    어조옵션 = "전문적인",
    이해도레벨 = "중수",
    선택된분석요소 = [],
    user,
    isDevelop = false,
  } = params;

  const languageName = getLanguageName(language);
  const systemPrompt = getCommonSystemPrompt(
    languageName,
    true,
    해설유형,
    분석관점,
    어조옵션,
    이해도레벨,
    선택된분석요소,
    사용자맥락정보,
  );

  const 궁합유형별설정 = {
    연인궁합: get궁합기본구조("연인궁합", 분석관점),
    부부궁합: get궁합기본구조("부부궁합", 분석관점),
    친구궁합: get궁합기본구조("친구궁합", 분석관점),
    동료궁합: get궁합기본구조("동료궁합", 분석관점),
    가족궁합: get궁합기본구조("가족궁합", 분석관점),
    사업궁합: get궁합기본구조("사업궁합", 분석관점),
    학업궁합: get궁합기본구조("학업궁합", 분석관점),
    전문가궁합: get궁합기본구조("전문가궁합", 분석관점),
  };

  const 설정 = 궁합유형별설정[해설유형 as keyof typeof 궁합유형별설정] || 궁합유형별설정["연인궁합"];
  const userPrompt = `다음 두 사람의 사주 데이터를 ${해설유형} 관점에서 분석하여 마크다운 형식으로 결과를 제공해주세요:

${설정.분석순서}

**요청 분석 항목:**

${설정.요청항목}

**사용자 추가 질문:**
${사용자질문}

${특별추가질문(user, isDevelop)}`;

  return { systemPrompt: `${systemPrompt}\n${설정.출력형식}`, userPrompt };
};
