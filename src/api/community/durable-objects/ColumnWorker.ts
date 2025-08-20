import { createPrismaClient } from "../../../common/prismaUtils";
import {
  ColumnJob,
  computeMaxSimilarity,
  createPostWithTags,
  fetchExistingTitlesAndContents,
  generateColumnHtml,
  generateTitleIfNeeded,
  validateHtml,
} from "../columnUtils";

export class ColumnWorker implements DurableObject {
  private state: DurableObjectState;
  private env: any;
  private jobs: Map<string, ColumnJob> = new Map();

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    switch (url.pathname) {
      case "/jobs/create":
        return this.handleCreate(request);
      case "/jobs/status":
        return this.handleStatus(url.searchParams.get("jobId"));
      default:
        return new Response("Not Found", { status: 404 });
    }
  }

  private json(data: any, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  private async handleStatus(jobId: string | null): Promise<Response> {
    if (!jobId) return this.json({ success: false, error: "jobId required" }, 400);
    let job = this.jobs.get(jobId);
    if (!job) {
      const stored = await this.state.storage.get<ColumnJob>(jobId);
      if (stored) {
        job = stored;
        this.jobs.set(jobId, job);
      }
    }
    if (!job) return this.json({ success: false, error: "not found" }, 404);
    return this.json({ success: true, job });
  }

  private async handleCreate(request: Request): Promise<Response> {
    const body = (await request.json()) as any;
    const level = (body?.level as any) || "초급";
    const language = (body?.language as any) || "ko";
    const givenTitle = typeof body?.title === "string" ? body.title : undefined;

    const jobId = body?.jobId || `col_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const job: ColumnJob = {
      id: jobId,
      status: "pending",
      createdAt: new Date().toISOString(),
      level,
      language,
    };
    this.jobs.set(job.id, job);
    await this.state.storage.put(job.id, job);

    this.state.waitUntil(this.process(job.id, givenTitle));

    return this.json({ success: true, jobId: job.id, status: "pending" }, 202);
  }

  private async process(jobId: string, givenTitle?: string): Promise<void> {
    let job = this.jobs.get(jobId);
    if (!job) return;
    try {
      job.status = "processing";
      await this.state.storage.put(job.id, job);

      const prisma = createPrismaClient(this.env.DB);
      try {
        const existing = await fetchExistingTitlesAndContents(prisma);
        const existingTitles = existing.map((p: any) => p.title);

        const cleanTitle = await generateTitleIfNeeded(
          this.env.GOOGLE_GEMINI_API_KEY,
          job.level,
          existingTitles,
          givenTitle
        );
        job.title = cleanTitle;
        await this.state.storage.put(job.id, job);

        const html = await generateColumnHtml(
          this.env.GOOGLE_GEMINI_API_KEY,
          job.level,
          job.language,
          cleanTitle,
          existingTitles,
          this.env
        );

        const v = validateHtml(html);
        if (!v.ok) {
          job.status = "failed";
          job.error = `분량 미달(line:${v.lineCount}, chars:${v.charCount})`;
          this.jobs.set(job.id, job);
          await this.state.storage.put(job.id, job);
          await prisma.$disconnect();
          return;
        }

        const { maxSim, maxPostId } = computeMaxSimilarity(html, existing);
        if (maxSim >= 0.85) {
          job.status = "failed";
          job.error = `유사도 중복(sim:${Number(maxSim.toFixed(4))}, postId:${maxPostId})`;
          this.jobs.set(job.id, job);
          await this.state.storage.put(job.id, job);
          await prisma.$disconnect();
          return;
        }

        const created = await createPostWithTags(prisma, cleanTitle, html, job.level);
        await prisma.$disconnect();

        job.status = "completed";
        job.result = { id: created.id, title: cleanTitle };
        this.jobs.set(job.id, job);
        await this.state.storage.put(job.id, job);
      } catch (e: any) {
        try { await (prisma as any)?.$disconnect?.(); } catch {}
        throw e;
      }
    } catch (e: any) {
      job.status = "failed";
      job.error = e?.message || "Unknown error";
      this.jobs.set(job.id, job);
      await this.state.storage.put(job.id, job);
    }
  }
}


