import { Context } from "hono";
import { createPrismaClient, isAdmin } from "../../common/prismaUtils";
import { areTitlesDuplicate, computeContentSimilarity, generateDreamWithAi, makeDuplicateKey, translateDreamWithAi, validateMarkdown } from "./dreamUtils";

type Env = { DB: D1Database; GOOGLE_GEMINI_API_KEY: string };

export const dreamApi = {
  async generateAndCreate(c: Context) {
    if (!(await isAdmin(c))) {
      return c.json({ success: false, message: "관리자 권한이 필요합니다." }, 403);
    }
    const body = await c.req.json().catch(() => ({}));
    const languages = Array.isArray(body?.languages) ? body.languages.map((x: any) => String(x)) : [];
    const title = body?.title ? String(body.title) : undefined;

    if (!Array.isArray(languages) || languages.length === 0) {
      return c.json({ success: false, message: "languages: string[]가 필요합니다." }, 400);
    }
    // ko가 없어도 허용: 명시하신 대로 그대로 생성
    // 최소한 언어코드 형식 간단 검증
    const normalizedLanguages = languages.map((x: string) => x.trim().toLowerCase());

    const prisma = createPrismaClient(c.env.DB);
    try {
      // 1) 기본 언어는 내부 기준 ko로 생성(내용 생성/중복 검사용)
      const base = await generateDreamWithAi(c.env.GOOGLE_GEMINI_API_KEY, "ko", title, c.env);

      // 2) 마크다운 검증
      const v = validateMarkdown(base.contentMarkdown);
      if (!v.ok) {
        return c.json({ success: false, error: "분량/섹션 검증 실패", details: v }, 400);
      }

      // 3) 제목/내용 유사도 기반 중복 검사
      const existing = await prisma.dreamTranslation.findMany({
        where: { language: "ko" },
        select: { title: true, contentMarkdown: true, dreamId: true },
      });
      for (const e of existing) {
        if (areTitlesDuplicate(base.title, e.title, 0.88)) {
          return c.json({ success: false, error: "제목 유사도 중복", code: "DUP_TITLE" }, 409);
        }
        const sim = computeContentSimilarity(base.contentMarkdown, e.contentMarkdown || "");
        if (sim >= 0.88) {
          return c.json({ success: false, error: "내용 유사도 중복", similarity: Number(sim.toFixed(4)), code: "DUP_CONTENT" }, 409);
        }
      }

      // 4) 저장: Dream + 요청 언어별 DreamTranslation
      const dream = await prisma.dream.create({
        data: {
          baseLanguage: "ko",
          auspiciousness: base.auspiciousness,
          scores: base.scores as any,
          duplicateKey: makeDuplicateKey(base.title),
        } as any,
      });

      const createdLanguages: string[] = [];
      for (const lng of normalizedLanguages) {
        let item = base;
        if (lng !== "ko") {
          item = await translateDreamWithAi(c.env.GOOGLE_GEMINI_API_KEY, base, lng, c.env);
        }
        // 언어별 저장
        await prisma.dreamTranslation.create({
          data: {
            dreamId: dream.id,
            language: lng,
            title: item.title,
            contentMarkdown: item.contentMarkdown,
            keywords: item.keywords as any,
            synonyms: item.synonyms as any,
            sources: item.sources as any,
          } as any,
        });
        createdLanguages.push(lng);
      }

      return c.json({ success: true, dreamId: dream.id, createdLanguages }, 200);
    } catch (e) {
      console.error("[dreamApi.generateAndCreate]", e);
      return c.json({ success: false, message: "생성 실패" }, 500);
    } finally {
      await prisma.$disconnect();
    }
  },
};


