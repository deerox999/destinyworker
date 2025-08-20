import { Context } from "hono";
import { createPrismaClient, isAdmin } from "../../common/prismaUtils";
import { GoogleGenAI } from "@google/genai";
import { buildTitleOnlyPrompt, ColumnLevel } from "../saju/ai/prompt/sajuColumnPrompt";
import { logUsageMetadata } from "../saju/ai/utils";
import {
  DEFAULT_MIN_CHARS,
  DEFAULT_MIN_LINES,
  DEFAULT_SIMILARITY_THRESHOLD,
  FIXED_LANGUAGE,
  FIXED_BOARD_ID,
  FIXED_CATEGORY_ID,
  DEFAULT_AUTHOR,
  computeMaxSimilarity,
  ensureTags,
  fetchExistingTitlesAndContents,
  generateColumnHtml,
  generateTitleIfNeeded,
  normalizeTitle,
  validateHtml,
} from "./columnUtils";

type Env = { DB: D1Database; GOOGLE_GEMINI_API_KEY: string };

export const adminColumnApi = {
  async dryRunGenerate(c: Context) {
    if (!(await isAdmin(c))) {
      return c.json(
        { success: false, message: "관리자 권한이 필요합니다." },
        403
      );
    }
    const body = await c.req.json();
    const level: ColumnLevel = (body?.level as ColumnLevel) || "초급";
    const language: string = (body?.language as string) || FIXED_LANGUAGE;
    let title: string | undefined = body?.title ? String(body.title) : undefined;

    // console.log(`params(${level}, ${language}, ${title}) : `, body);

    const prisma = createPrismaClient(c.env.DB);
    try {
      const existing = await fetchExistingTitlesAndContents(prisma);
      const existingTitles = existing.map((p: any) => p.title);

      if (!title || title.trim().length === 0) {
        title = await generateTitleIfNeeded(c.env.GOOGLE_GEMINI_API_KEY, level, existingTitles, undefined);
      }
      const cleanTitle = normalizeTitle(title!);
      const html = await generateColumnHtml(
        c.env.GOOGLE_GEMINI_API_KEY,
        level,
        language,
        cleanTitle,
        existingTitles,
        c.env
      );

      const v = validateHtml(html);
      if (!v.ok) {
        return c.json(
          {
            success: false,
            error: "분량 미달",
            details: {
              lineCount: v.lineCount,
              charCount: v.charCount,
              minLines: v.minLines,
              minChars: v.minChars,
            },
            title: cleanTitle,
            html,
          },
          400
        );
      }

      const { maxSim, maxPostId } = computeMaxSimilarity(html, existing);
      if (maxSim >= DEFAULT_SIMILARITY_THRESHOLD) {
        return c.json(
          {
            success: false,
            error: "유사도 중복",
            details: {
              similarity: Number(maxSim.toFixed(4)),
              threshold: DEFAULT_SIMILARITY_THRESHOLD,
              postId: maxPostId,
            },
            title: cleanTitle,
          },
          409
        );
      }

      return c.json(
        {
          success: true,
          data: {
            title: cleanTitle,
            html,
            stats: { lineCount: v.lineCount, charCount: v.charCount },
            similarityMax: Number(maxSim.toFixed(4)),
          },
        },
        200
      );
    } catch (e) {
      console.error("[adminColumnApi.dryRunGenerate]", e);
      return c.json({ success: false, message: "생성 실패" }, 500);
    } finally {
      await prisma.$disconnect();
    }
  },

  async generateAndCreate(c: Context) {
    if (!(await isAdmin(c))) {
      return c.json(
        { success: false, message: "관리자 권한이 필요합니다." },
        403
      );
    }
    const body = await c.req.json();
    const level: ColumnLevel = (body?.level as ColumnLevel) || "초급";
    const language: string = (body?.language as string) || FIXED_LANGUAGE;
    let title: string | undefined = body?.title
      ? String(body.title)
      : undefined;

    // 여기서부터는 비동기 백엔드 처리로 위임: Durable Object에 작업 등록 후 즉시 응답
    try {
      const id = c.env.COLUMN_WORKER.idFromName("singleton");
      const stub = c.env.COLUMN_WORKER.get(id);
      const resp = await stub.fetch("https://do/jobs/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, level, language }),
      });
      const data = await resp.json();
      return c.json({ success: true, jobId: data.jobId, status: "pending" }, 202);
    } catch (e) {
      console.error("[adminColumnApi.generateAndCreate] enqueue failed", e);
      return c.json({ success: false, message: "작업 등록 실패" }, 500);
    }
  },

  // 크론 배치: 매일 1회 자동 생성
  async scheduledGenerateDaily(env: Env): Promise<void> {
    const prisma = createPrismaClient(env.DB);
    try {
      // 2:2:1 로테이션 (일자 기반)
      const cycle: ColumnLevel[] = ["초급", "초급", "중급", "중급", "고급"];
      const now = new Date();
      const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      const dayIndex = Math.floor(
        (now.getTime() - startOfYear.getTime()) / 86_400_000
      );
      const level = cycle[dayIndex % cycle.length];

      const existing = await fetchExistingTitlesAndContents(prisma);
      const existingTitles = existing.map((p: any) => p.title);

      // 제목 제안
      const ai = new GoogleGenAI({ apiKey: env.GOOGLE_GEMINI_API_KEY });
      const titlePrompt = buildTitleOnlyPrompt(level, undefined, existingTitles);
      const titlePayload = {
        model: "gemini-2.5-flash",
        systemInstruction: { parts: [{ text: "제목 한 줄만 반환" }] },
        contents: [{ role: "user", parts: [{ text: titlePrompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 256 },
      };
      const tResp: any = await ai.models.generateContent(titlePayload);
      logUsageMetadata(env, tResp);
      let titleFromAi = "";
      try {
        const cand = (tResp as any)?.candidates?.[0];
        const parts = cand?.content?.parts || [];
        titleFromAi = parts
          .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
          .join("");
      } catch (_) {
        titleFromAi = String((tResp as any)?.text || "");
      }
      const cleanTitle = normalizeTitle(String(titleFromAi).trim());

      // 본문 생성 (유틸 사용)
      const html = await generateColumnHtml(env.GOOGLE_GEMINI_API_KEY, level, FIXED_LANGUAGE, cleanTitle, existingTitles, env);

      // 검증
      const v2 = validateHtml(html);
      if (!v2.ok) {
        return; // 실패 시 스킵
      }
      const { maxSim } = computeMaxSimilarity(html, existing);
      if (maxSim >= DEFAULT_SIMILARITY_THRESHOLD) {
        return; // 실패 시 스킵
      }

      // 저장
      const post = await prisma.post.create({
        data: {
          title: cleanTitle,
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
    } catch (e) {
      console.error("[adminColumnApi.scheduledGenerateDaily]", e);
    } finally {
      await prisma.$disconnect();
    }
  },
  async getGenerateStatus(c: Context) {
    if (!(await isAdmin(c))) {
      return c.json({ success: false, message: "관리자 권한이 필요합니다." }, 403);
    }
    const jobId = c.req.query("jobId");
    if (!jobId) return c.json({ success: false, message: "jobId가 필요합니다." }, 400);
    try {
      const id = (c.env as any).COLUMN_WORKER.idFromName("singleton");
      const stub = (c.env as any).COLUMN_WORKER.get(id);
      const resp = await stub.fetch(`https://do/jobs/status?jobId=${encodeURIComponent(jobId)}`);
      const data = await resp.json();
      if (!resp.ok) return c.json({ success: false, ...data }, resp.status as any);
      return c.json({ success: true, ...data });
    } catch (e) {
      console.error("[adminColumnApi.getGenerateStatus]", e);
      return c.json({ success: false, message: "상태 조회 실패" }, 500);
    }
  }
};
