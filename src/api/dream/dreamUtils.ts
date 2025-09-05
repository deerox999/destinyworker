import { GoogleGenAI } from "@google/genai";
import { logUsageMetadata } from "../saju/ai/utils";

export type GeneratedDream = {
  language: string;
  title: string;
  contentMarkdown: string;
  auspiciousness: "길몽" | "흉몽" | "평범";
  keywords: string[];
  synonyms: string[];
  sources: string[];
  scores: Record<string, number>; // 0~100 정수만
};

export function normalizeTitleForSimilarity(text: string): string {
  const lower = String(text || "").toLowerCase();
  const strippedPunct = lower.replace(/[\p{P}\p{S}]/gu, "");
  const removedParticles = strippedPunct
    .replace(/(은|는|이|가|을|를|란|이란|란다|이란다)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return removedParticles;
}

function ngrams(s: string, n = 2): Set<string> {
  const tokens = s.split(/\s+/).filter(Boolean);
  const grams = new Set<string>();
  if (tokens.length === 0) return grams;
  if (tokens.length === 1) {
    grams.add(tokens[0]);
    return grams;
  }
  for (let i = 0; i < tokens.length - n + 1; i++) {
    grams.add(tokens.slice(i, i + n).join("_"));
  }
  return grams;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function areTitlesDuplicate(a: string, b: string, threshold = 0.88): boolean {
  const na = ngrams(normalizeTitleForSimilarity(a));
  const nb = ngrams(normalizeTitleForSimilarity(b));
  return jaccard(na, nb) >= threshold;
}

export function computeMarkdownStats(md: string): { lineCount: number; charCount: number } {
  const text = String(md || "");
  return { lineCount: text.split(/\n/).length, charCount: text.length };
}

export function validateMarkdown(md: string): { ok: boolean; lineCount: number; charCount: number; missing?: string[] } {
  const { lineCount, charCount } = computeMarkdownStats(md);
  const missing: string[] = [];
  // 필수 섹션 키워드 확인(헤더 텍스트 기준)
  const need = ["길흉", "핵심", "점수", "키워드", "동의어", "출처"];
  const hay = md.toLowerCase();
  for (const k of need) {
    if (!hay.includes(k)) missing.push(k);
  }
  const ok = lineCount >= 5 && charCount >= 300 && missing.length === 0;
  return { ok, lineCount, charCount, missing: missing.length ? missing : undefined };
}

export function makeDuplicateKey(title: string): string {
  const t = normalizeTitleForSimilarity(title);
  // FNV-1a 32-bit
  let hash = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) {
    hash ^= t.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return `t${hash.toString(16)}`;
}

export function computeContentSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  return jaccard(ta, tb);
}

function tokenize(s: string): Set<string> {
  const plain = s
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/[#*>\-\[\]()_]/g, " ")
    .toLowerCase();
  const words = plain.split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 2);
  return new Set(words);
}

function extractJson(text: string): any {
  const raw = String(text || "");
  const fence = raw.match(/```(?:json)?\n([\s\S]*?)\n```/);
  const body = fence ? fence[1] : raw;
  try {
    return JSON.parse(body);
  } catch {
    // try find first { ... }
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const sliced = body.slice(start, end + 1);
      try { return JSON.parse(sliced); } catch {}
    }
    throw new Error("JSON 파싱 실패");
  }
}

export async function generateDreamWithAi(apiKey: string, language: string, title?: string, env?: any): Promise<GeneratedDream> {
  const ai = new GoogleGenAI({ apiKey });
  const sys = { parts: [{ text: "너는 전문 꿈해몽 작가다. 요청 언어로만 응답한다." }] } as any;
  const prompt = buildGenerationPrompt(language, title);
  const payload = {
    model: "gemini-2.5-flash",
    systemInstruction: sys,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.6, maxOutputTokens: 2048 },
  } as any;
  const resp: any = await ai.models.generateContent(payload);
  if (env) logUsageMetadata(env, resp);

  const cand = (resp as any)?.candidates?.[0];
  const parts = cand?.content?.parts || [];
  const text = parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("");
  const data = extractJson(text);

  // 점수 정수 검증
  const validScores: Record<string, number> = {};
  for (const k of Object.keys(data.scores || {})) {
    const v = Number(data.scores[k]);
    if (Number.isFinite(v)) validScores[k] = Math.max(0, Math.min(100, Math.round(v)));
  }

  const out: GeneratedDream = {
    language,
    title: String(data.title || title || "").trim(),
    contentMarkdown: String(data.contentMarkdown || "").trim(),
    auspiciousness: (String(data.auspiciousness || "평범") as any),
    keywords: Array.isArray(data.keywords) ? data.keywords.map(String) : [],
    synonyms: Array.isArray(data.synonyms) ? data.synonyms.map(String) : [],
    sources: Array.isArray(data.sources) ? data.sources.map(String) : [],
    scores: validScores,
  };
  return out;
}

function buildGenerationPrompt(language: string, title?: string): string {
  return [
    `언어: ${language}`,
    `형식: JSON만 반환. 코드블록 금지. 필드: {` +
      `"language": "${language}",` +
      `"title": string(제목, plain text),` +
      `"contentMarkdown": string(마크다운 본문),` +
      `"auspiciousness": "길몽"|"흉몽"|"평범",` +
      `"keywords": string[],` +
      `"synonyms": string[],` +
      `"sources": string[],` +
      `"scores": { [name: string]: 0..100 정수 }` +
    `}.`,
    `요건:`,
    `- 제목은 텍스트. 본문은 마크다운.`,
    `- 최소 5줄/300자 이상.`,
    `- 섹션 포함: 길흉, 핵심 해석, 세부 해석, 점수, 키워드, 동의어, 출처.`,
    `- 점수는 0~100 정수. total 포함 권장.`,
    title ? `- 주제 제목: ${title}` : `- 주제: 꿈해몽 주제를 스스로 선정(일반적이고 유용하게).`,
  ].join("\n");
}

export async function translateDreamWithAi(apiKey: string, from: GeneratedDream, targetLanguage: string, env?: any): Promise<GeneratedDream> {
  const ai = new GoogleGenAI({ apiKey });
  const sys = { parts: [{ text: "너는 정확한 번역가다. 원문의 의미와 마크다운 구조를 유지한다." }] } as any;
  const prompt = buildTranslationPrompt(from, targetLanguage);
  const payload = {
    model: "gemini-2.5-flash",
    systemInstruction: sys,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
  } as any;
  const resp: any = await ai.models.generateContent(payload);
  if (env) logUsageMetadata(env, resp);

  const cand = (resp as any)?.candidates?.[0];
  const parts = cand?.content?.parts || [];
  const text = parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("");
  const data = extractJson(text);

  const out: GeneratedDream = {
    language: targetLanguage,
    title: String(data.title || from.title).trim(),
    contentMarkdown: String(data.contentMarkdown || "").trim(),
    auspiciousness: from.auspiciousness,
    keywords: Array.isArray(data.keywords) ? data.keywords.map(String) : from.keywords,
    synonyms: Array.isArray(data.synonyms) ? data.synonyms.map(String) : from.synonyms,
    sources: Array.isArray(data.sources) ? data.sources.map(String) : from.sources,
    scores: from.scores,
  };
  return out;
}

function buildTranslationPrompt(from: GeneratedDream, targetLanguage: string): string {
  const json = JSON.stringify({
    title: from.title,
    contentMarkdown: from.contentMarkdown,
    keywords: from.keywords,
    synonyms: from.synonyms,
    sources: from.sources,
  });
  return [
    `아래 꿈해몽을 ${targetLanguage}로 번역하라.`,
    `- 마크다운 구조와 의미/톤 유지`,
    `- 고유명사/숫자/점수는 보존`,
    `- 출력은 JSON만: {"title", "contentMarkdown", "keywords", "synonyms", "sources"}`,
    json,
  ].join("\n");
}


