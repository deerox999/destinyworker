import { GoogleGenAI } from "@google/genai";
import { getAnalysisTypePoints, updatePointTransactionAnalysisId } from "../../../../common/paymentUtils";
import {
  buildGeminiPayload,
  generateTitle,
  getResponseType,
  saveSajuAnalysis,
  type AnalysisJob,
} from "../utils";

export class SajuAnalysisWorker implements DurableObject {
  private state: DurableObjectState;
  private env: any;
  private jobs: Map<string, AnalysisJob> = new Map();

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    switch (path) {
      case "/jobs/status":
        return this.handleJobStatus(request);
      case "/jobs/create":
        return this.handleJobCreate(request);
      case "/jobs/update":
        return this.handleJobUpdate(request);
      case "/jobs/stream":
        return this.handleJobStream(request);
      case "/jobs/process":
        return this.handleJobProcess(request);
      default:
        return new Response("Not Found", { status: 404 });
    }
  }

  /**
   * Job 상태 조회
   * GET /jobs/status?jobId=xxx
   */
  private async handleJobStatus(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const jobId = url.searchParams.get("jobId");

    if (!jobId) {
      return new Response(JSON.stringify({ error: "Job ID is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const job = this.jobs.get(jobId);
    if (!job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        jobId: job.id,
        status: job.status,
        createdAt: job.createdAt,
        result: job.result,
        error: job.error,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  /**
   * Job 생성 (Queue Consumer가 호출)
   * POST /jobs/create
   */
  private async handleJobCreate(request: Request): Promise<Response> {
    try {
      const body = (await request.json()) as any;
      const jobId =
        body.jobId ||
        `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const job: AnalysisJob = {
        id: jobId,
        userId: body.userId,
        analysisType: body.analysisType || "general",
        type: body.type || "individual",
        pointsCost: body.pointsCost || getAnalysisTypePoints(body.analysisType),
        reference: body.reference,
        i18n: body.i18n || "ko",
        timezone: body.timezone || "Asia/Seoul",
        userPrompt: body.userPrompt,
        systemPrompt: body.systemPrompt,
        sajuData: body.sajuData,
        conversationHistory: body.conversationHistory,
        model: body.model,
        fortuneType: body.fortuneType,

        createdAt: new Date().toISOString(),
        status: "pending",
      };

      this.jobs.set(jobId, job);

      return new Response(
        JSON.stringify({
          success: true,
          jobId: jobId,
          message: "분석 작업이 등록되었습니다. Queue에서 처리됩니다.",
          status: "pending",
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: "Invalid request body",
          details: error instanceof Error ? error.message : "Unknown error",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  /**
   * Job 상태 업데이트 (Queue Consumer가 호출)
   * POST /jobs/update
   */
  private async handleJobUpdate(request: Request): Promise<Response> {
    try {
      const body = (await request.json()) as any;
      const { jobId, status, result, error } = body;

      if (!jobId) {
        return new Response(JSON.stringify({ error: "Job ID is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const job = this.jobs.get(jobId);
      if (!job) {
        return new Response(JSON.stringify({ error: "Job not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      job.status = status;
      if (result) {
        job.result = result;
      }
      if (error) {
        job.error = error;
      }

      return new Response(
        JSON.stringify({
          success: true,
          jobId: jobId,
          status: job.status,
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: "Invalid request body",
          details: error instanceof Error ? error.message : "Unknown error",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  /**
   * 실시간 스트리밍 처리
   * POST /jobs/stream
   */
  private async handleJobStream(request: Request): Promise<Response> {
    try {
      const body = (await request.json()) as any;
      const jobId =
        body.jobId ||
        `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const job: AnalysisJob = {
        id: jobId,
        userId: body.userId,
        analysisType: body.analysisType || "general",
        type: body.type || "individual",
        pointsCost: body.pointsCost || getAnalysisTypePoints(body.analysisType),
        reference: body.reference,
        i18n: body.i18n || "ko",
        timezone: body.timezone || "Asia/Seoul",
        userPrompt: body.userPrompt,
        systemPrompt: body.systemPrompt,
        sajuData: body.sajuData,
        conversationHistory: body.conversationHistory,
        model: body.model,
        fortuneType: body.fortuneType,

        createdAt: new Date().toISOString(),
        status: "processing",
      };

      this.jobs.set(jobId, job);

      // 스트리밍 처리 시작 (클라이언트로 스트리밍 응답 전송)
      return this.processStreamingJob(jobId, true);
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: "Invalid request body",
          details: error instanceof Error ? error.message : "Unknown error",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  private async processStreamingJob(jobId: string, shouldStreamToClient: boolean = true): Promise<Response> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      // Gemini API 호출
      const ai = new GoogleGenAI({ apiKey: this.env.GOOGLE_GEMINI_API_KEY });
      const payload = buildGeminiPayload(job);
      const streamingResp = await ai.models.generateContentStream(payload);

      if (!streamingResp) throw new Error("스트리밍 응답을 받을 수 없습니다.")

      if (shouldStreamToClient) {
        // 클라이언트로 스트리밍 응답 전송
        return this.createStreamingResponse(job, streamingResp, jobId);
      } else {
        // 내부 처리만 수행 (클라이언트로 스트리밍 전송 안 함)
        return this.processStreamingInternal(job, streamingResp, jobId);
      }
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : "Unknown error";

      return new Response(
        JSON.stringify({
          error: "스트리밍 처리 실패",
          details: error instanceof Error ? error.message : "Unknown error",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  /**
   * 클라이언트로 스트리밍 응답을 전송하는 처리
   */
  private createStreamingResponse(job: AnalysisJob, streamingResp: any, jobId: string): Response {
    let fullResponse = "";
    let latestUsageMetadata: any = null;
    const self = this;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamingResp) {
            if (chunk.text) {
              fullResponse += chunk.text;
              
              // usageMetadata 저장 (스트리밍에서도)
              if (chunk.usageMetadata) {
                latestUsageMetadata = chunk.usageMetadata;
              }
              
              const data = `data: ${JSON.stringify({
                text: chunk.text,
              })}\n\n`;
              controller.enqueue(new TextEncoder().encode(data));
            } else {
              const data = `data: ${JSON.stringify(chunk)}\n\n`;
              controller.enqueue(new TextEncoder().encode(data));
            }
          }

          // 스트리밍 완료 후 DB 저장
          const analysisCompletedAt = new Date();
          const title = generateTitle(job);

          try {
            const saveResult = await saveSajuAnalysis(
              job,
              fullResponse,
              title,
              analysisCompletedAt,
              self.env,
              latestUsageMetadata  // usageMetadata 전달
            );
            if (saveResult.success) {
              await self.updateJobAfterSave(job, fullResponse, saveResult, latestUsageMetadata);
            }
          } catch (saveError) {
            console.error("스트리밍 응답 저장 실패:", saveError);
          }

          controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          console.error("스트리밍 오류:", error);
          job.status = "failed";
          job.error = error instanceof Error ? error.message : "Unknown error";

          const errorData = `data: ${JSON.stringify({
            type: "error",
            message: error instanceof Error ? error.message : "Unknown error",
          })}\n\n`;
          controller.enqueue(new TextEncoder().encode(errorData));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  /**
   * 내부 처리만 수행 (클라이언트로 스트리밍 전송 안 함)
   */
  private async processStreamingInternal(job: AnalysisJob, streamingResp: any, jobId: string): Promise<Response> {
    let fullResponse = "";
    let latestUsageMetadata: any = null;
    let chunkCount = 0;

    try {
      for await (const chunk of streamingResp) {
        if (chunk.text) {
          fullResponse += chunk.text;
          chunkCount++;
          if (chunk.usageMetadata) {
            latestUsageMetadata = chunk.usageMetadata;
          }
        }
      }

      // DB 저장
      const analysisCompletedAt = new Date();
      const title = generateTitle(job);

      const saveResult = await saveSajuAnalysis(
        job,
        fullResponse,
        title,
        analysisCompletedAt,
        this.env,
        latestUsageMetadata
      );

      if (saveResult.success) {
        await this.updateJobAfterSave(job, fullResponse, saveResult, latestUsageMetadata);
        
        return new Response(
          JSON.stringify({
            success: true,
            jobId: jobId,
            analysisId: saveResult.analysisId,
            status: "completed",
            message: "분석이 완료되었습니다.",
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      } else {
        throw new Error(`분석 결과 저장 실패: ${saveResult.error}`);
      }
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : "Unknown error";
      
      return new Response(
        JSON.stringify({
          error: "내부 스트리밍 처리 실패",
          details: error instanceof Error ? error.message : "Unknown error",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  /**
   * 저장 완료 후 Job 상태 업데이트 공통 로직
   */
  private async updateJobAfterSave(job: AnalysisJob, fullResponse: string, saveResult: any, latestUsageMetadata: any): Promise<void> {
    // 포인트 거래 기록의 analysisId 업데이트
    try {
      await updatePointTransactionAnalysisId(
        this.env.DB,
        job.userId,
        job.reference,
        saveResult.analysisId!
      )
    } catch (updateTransactionError) {
      console.error("[SajuAnalysisWorker] 포인트 거래 analysisId 업데이트 오류:", updateTransactionError);
    }

    job.status = "completed";
    job.result = {
      answer: fullResponse,
      analysisId: saveResult.analysisId,
      metadata: {
        modelUsed: job.model,
        timestamp: new Date().toISOString(),
        responseType: getResponseType(job.type),
        // usageMetadata 저장
        ...(latestUsageMetadata && {
          usageMetadata: latestUsageMetadata,
          modelVersion: 'gemini-2.5-pro'
        }),
      },
    }
  }

  /**
   * 장시간 비동기 처리 (Queue Consumer에서 위임받음)
   * POST /jobs/process
   */
  private async handleJobProcess(request: Request): Promise<Response> {
    try {
      const body = (await request.json()) as any;
      const jobId =
        body.jobId ||
        `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const job: AnalysisJob = {
        id: jobId,
        userId: body.userId,
        analysisType: body.analysisType || "general",
        type: body.type || "individual",
        pointsCost: body.pointsCost || getAnalysisTypePoints(body.analysisType),
        reference: body.reference,
        i18n: body.i18n || "ko",
        timezone: body.timezone || "Asia/Seoul",
        userPrompt: body.userPrompt,
        systemPrompt: body.systemPrompt,
        sajuData: body.sajuData,
        conversationHistory: body.conversationHistory,
        model: body.model,
        fortuneType: body.fortuneType,

        createdAt: new Date().toISOString(),
        status: "processing",
      };

      this.jobs.set(jobId, job);

      // 스트리밍 처리 시작 (클라이언트로 스트리밍 응답 전송하지 않음)
      return this.processStreamingJob(jobId, false);
    } catch (error) {
      console.error(`[SajuAnalysisWorker] 작업 시작 실패:`, error);
      return new Response(
        JSON.stringify({
          error: "장시간 작업 시작 실패",
          details: error instanceof Error ? error.message : "Unknown error",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }


}
