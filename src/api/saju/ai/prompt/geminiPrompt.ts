import { getLanguageName } from "../../../../common/utils";
import { buildCommonSystemPromptSections, getOutputFormatTemplate, getUserPrompt, get궁합기본구조, joinSections, PromptParams, 특별추가질문 } from "./commonPrompt";

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
  let userPrompt = getUserPrompt(해설유형, 사용자질문, highQuality, languageName);
  userPrompt += `${특별추가질문(user, isDevelop)}`;
  return { systemPrompt: `${systemPrompt}\n${출력형식지시}`, userPrompt };
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
  const systemSections = buildCommonSystemPromptSections({
    language: languageName,
    isCompatibility: true,
    해설유형,
    분석관점옵션: 분석관점,
    어조옵션,
    이해도레벨옵션: 이해도레벨,
    선택된분석요소,
    사용자맥락정보,
  });
  const systemPrompt = joinSections(systemSections);

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
  const userPrompt = `다음 두 사람의 사주 데이터를 ${해설유형} 관점에서 분석하여 마크다운 형식으로 결과를 제공해주세요.

응답은 과도한 긍정/완곡 표현을 피하고, 필요한 경우 부정적 결론을 명확히 제시해주세요. 각 주장에는 간단한 근거를 붙이고, 분량은 최소 800자 이상으로 충분히 상세하게 작성해주세요.

${설정.분석순서}

**요청 분석 항목:**

${설정.요청항목}

**사용자 추가 질문:**
${사용자질문}

${특별추가질문(user, isDevelop)}`;

  return { systemPrompt: `${systemPrompt}\n${설정.원칙지시}\n${설정.출력형식}`, userPrompt };
};
