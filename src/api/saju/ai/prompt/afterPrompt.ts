import {  PromptLanguage, PromptTone, PromptUnderstanding, buildCommonSystemPromptSections, joinSections } from "./commonPrompt";
import { getLanguageName } from "../../../../common/utils";
export type FollowUpLanguage = PromptLanguage;
export type FollowUpTone = PromptTone;
export type FollowUpUnderstanding = PromptUnderstanding;

export interface FollowUpPromptParams {
  language?: FollowUpLanguage; // 기본 ko
  tone?: FollowUpTone; // 기본 전문적인
  understandingLevel?: FollowUpUnderstanding; // 기본 중수
  userContext?: string; // 선택(없으면 일반 관점으로 답변)
  userQuestion: string; // 재질문(필수)
}

// 언어/이해도/톤: 공통 유틸 사용

// 재질문 전용 시스템 프롬프트
export function buildFollowUpSystemPrompt(params: Omit<FollowUpPromptParams, "userQuestion">): string {
  const languageLabel = getLanguageName(params.language ?? "ko");
  // 공통 시스템 프롬프트 섹션을 조립해 재질문 전용 제약을 덧붙임 (내용은 기존과 동일)
  const sections = buildCommonSystemPromptSections({
    language: languageLabel,
    isCompatibility: false,
    해설유형: "재질문",
    분석관점옵션: "현실적",
    어조옵션: params.tone ?? "전문적인",
    이해도레벨옵션: params.understandingLevel ?? "중수",
    선택된분석요소: [],
    사용자맥락정보: params.userContext ?? "",
  });
  const common = joinSections(sections);

  return [
    common,
    `이전 보고서만을 근거로 후속 질문에 답하세요. 사주 원자료 재요청/재삽입 금지.`,
    `차트/JSON 부록 재생성 금지, 전체 재분석 금지.`,
    `답변은 핵심 결론 → 근거 요약(이전 보고서 인용 가능) → 실천 팁/예시 1~2개 → 주의사항 순으로 정리.`,
    `마지막에 '연관 질문 제안과 간단 답변' 섹션을 추가해, 재질문과 직접적으로 연관된 추가 질문 2~3개를 스스로 제안하고 각 질문에 대해 2~4문장의 간단한 답변을 함께 제공하세요. 중복·사소한 질문은 제외하세요.`,
    `이전 보고서에서 누락되었거나 보강이 필요한 포인트가 보이면 '추가 보강' 섹션을 1개 추가하여 3~6문장으로 설명을 보충하세요. 새로운 데이터/차트/JSON/전체 재분석 없이, 기존 근거만으로 보강하세요.`,
  ].join("\n");
}

// 재질문 전용 사용자 프롬프트(사주 원자료/차트 관련 지시는 포함하지 않음)
export function buildFollowUpUserPrompt(params: Pick<FollowUpPromptParams, "userQuestion">): string {
  const question = (params.userQuestion || "").trim();
  return [
    `다음은 사용자의 재질문입니다. 이전 보고서를 참고하여 아래 질문에 집중해 답변하되, 필요 시 관련 보강 설명을 자연스럽게 덧붙이세요.`,
    ``,
    `[재질문]`,
    `${question}`,
  ].join("\n");
}

export function buildFollowUpPrompts(params: FollowUpPromptParams): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = buildFollowUpSystemPrompt({
    language: params.language ?? "ko",
    tone: params.tone ?? "전문적인",
    understandingLevel: params.understandingLevel ?? "중수",
    userContext: params.userContext,
  });
  const userPrompt = buildFollowUpUserPrompt({ userQuestion: params.userQuestion });
  return { systemPrompt, userPrompt };
}


