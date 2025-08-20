import { GoogleGenAI } from "@google/genai";
import {
  buildColumnSystemPrompt,
  buildColumnUserPrompt,
  buildTitleOnlyPrompt,
  ColumnLevel,
} from "../saju/ai/prompt/sajuColumnPrompt";
import { logUsageMetadata } from "../saju/ai/utils";

export const FIXED_BOARD_ID = 2;
export const FIXED_CATEGORY_ID = 4;
export const FIXED_LANGUAGE = "ko";
export const DEFAULT_AUTHOR = {
  id: 1,
  name: "명리박사",
  image: null as string | null,
};

export const DEFAULT_MIN_LINES = 20;
export const DEFAULT_MIN_CHARS = 800;
export const DEFAULT_SIMILARITY_THRESHOLD = 0.85;

export function stripHtml(html: string): string {
  return (html || "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function cosineSimilarity(aTokens: string[], bTokens: string[]): number {
  const aFreq = new Map<string, number>();
  const bFreq = new Map<string, number>();
  for (const t of aTokens) aFreq.set(t, (aFreq.get(t) || 0) + 1);
  for (const t of bTokens) bFreq.set(t, (bFreq.get(t) || 0) + 1);
  let dot = 0;
  let a2 = 0;
  let b2 = 0;
  for (const [, v] of aFreq) a2 += v * v;
  for (const [, v] of bFreq) b2 += v * v;
  for (const [t, av] of aFreq) {
    const bv = bFreq.get(t) || 0;
    dot += av * bv;
  }
  if (a2 === 0 || b2 === 0) return 0;
  return dot / (Math.sqrt(a2) * Math.sqrt(b2));
}

export async function fetchExistingTitlesAndContents(prisma: any) {
  const posts = await prisma.post.findMany({
    where: {
      boardId: FIXED_BOARD_ID,
      categoryId: FIXED_CATEGORY_ID,
      isDeleted: false,
      language: FIXED_LANGUAGE,
    } as any,
    select: { id: true, title: true, content: true },
    orderBy: { createdAt: "desc" },
    take: 9999,
  });
  return posts;
}

export async function ensureTags(
  prisma: any,
  lang: string,
  tagNames: string[],
  postId: number
) {
  for (const tagName of tagNames) {
    let tag = await prisma.tag.findFirst({
      where: { name: tagName, language: lang } as any,
    });
    if (!tag) {
      tag = await prisma.tag.create({
        data: { name: tagName, language: lang } as any,
      });
    }
    await prisma.postTag.create({ data: { postId, tagId: tag.id } });
  }
}

export function normalizeTitle(title: string): string {
  return (title || "").replace(/^\s*\[(초급|중급|고급)\]\s*/u, "").trim();
}

export async function generateTitleIfNeeded(
  apiKey: string,
  level: ColumnLevel,
  existingTitles: string[],
  givenTitle?: string
): Promise<string> {
  if (givenTitle && givenTitle.trim().length > 0) return normalizeTitle(givenTitle);
  const ai = new GoogleGenAI({ apiKey });
  const sys = "당신은 제목만 반환하는 에디터입니다.";
  const user = buildTitleOnlyPrompt(level, undefined, existingTitles);
  const titlePayload = {
    model: "gemini-2.5-flash",
    systemInstruction: { parts: [{ text: sys }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { temperature: 0.6, maxOutputTokens: 256 },
  } as any;
  const resp: any = await ai.models.generateContent(titlePayload);
  // 사용량 메타데이터 로깅은 호출자 책임으로 두려면 env 필요. 여기서는 스킵
  const cand = (resp as any)?.candidates?.[0];
  const parts = cand?.content?.parts || [];
  const textJoined = parts
    .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
    .join("");
  const title = String(textJoined || (resp as any)?.text || "")
    .trim()
    .replace(/^\s*"|"\s*$/g, "");
  return normalizeTitle(title);
}

export async function generateColumnHtml(
  apiKey: string,
  level: ColumnLevel,
  language: string,
  cleanTitle: string,
  existingTitles: string[],
  envForLogging?: any
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const systemPrompt = buildColumnSystemPrompt(level, language);
  const userPrompt = buildColumnUserPrompt(
    {
      title: cleanTitle,
      level,
      language,
      minLines: DEFAULT_MIN_LINES,
      minChars: DEFAULT_MIN_CHARS,
    },
    existingTitles
  );
  const contentPayload = {
    model: "gemini-2.5-flash",
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
  } as any;
  const gen: any = await ai.models.generateContent(contentPayload);
  if (envForLogging) {
    try { logUsageMetadata(envForLogging, gen); } catch {}
  }
  try {
    const cand = (gen as any)?.candidates?.[0];
    const parts = cand?.content?.parts || [];
    const textJoined = parts
      .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
      .join("");
    return String(textJoined || "")
      .trim()
      .replace(/^```(html)?/i, "")
      .replace(/```$/i, "")
      .trim();
  } catch (_) {
    return String((gen as any)?.text || "")
      .trim()
      .replace(/^```(html)?/i, "")
      .replace(/```$/i, "")
      .trim();
  }
}

export function validateHtml(
  html: string,
  minLines: number = DEFAULT_MIN_LINES,
  minChars: number = DEFAULT_MIN_CHARS
): { ok: boolean; lineCount: number; charCount: number; minLines: number; minChars: number } {
  const text = stripHtml(html);
  const lineCount =
    (html.match(/<p[ \t\n\r>]/gi)?.length || 0) +
    (html.match(/<li[ \t\n\r>]/gi)?.length || 0);
  const charCount = text.length;
  const ok = lineCount >= minLines && charCount >= minChars;
  return { ok, lineCount, charCount, minLines, minChars };
}

export function computeMaxSimilarity(html: string, existing: Array<{ id: number; content: string }>): { maxSim: number; maxPostId: number | null } {
  const text = stripHtml(html);
  const candidateTokens = tokenize(text);
  let maxSim = 0;
  let maxPostId: number | null = null;
  for (const p of existing) {
    const t = stripHtml(p.content || "");
    if (!t) continue;
    const sim = cosineSimilarity(candidateTokens, tokenize(t));
    if (sim > maxSim) {
      maxSim = sim;
      maxPostId = p.id;
    }
  }
  return { maxSim, maxPostId };
}

export async function createPostWithTags(
  prisma: any,
  title: string,
  html: string,
  level: ColumnLevel
): Promise<{ id: number }> {
  const post = await prisma.post.create({
    data: {
      title,
      content: html,
      boardId: FIXED_BOARD_ID,
      categoryId: FIXED_CATEGORY_ID,
      authorId: DEFAULT_AUTHOR.id,
      authorName: DEFAULT_AUTHOR.name,
      authorImage: DEFAULT_AUTHOR.image,
      language: FIXED_LANGUAGE,
      isNotice: false,
      isDeleted: false,
    } as any,
  });
  await ensureTags(prisma, FIXED_LANGUAGE, ["사주", "명리학", "칼럼", level], post.id);
  return { id: post.id };
}

export type ColumnJob = {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: string;
  title?: string;
  level: ColumnLevel;
  language: string;
  result?: { id: number; title: string };
  error?: string;
};


