import { GoogleGenAI } from "@google/genai";
import { getAnalysisTypePoints, updatePointTransactionAnalysisId } from "../../../../common/paymentUtils";
import {
  buildGeminiPayload,
  generateTitle,
  getResponseType,
  saveSajuAnalysisInitial,
  updateSajuAnalysis,
  type AnalysisJob
} from "../utils";

export class SajuAnalysisWorker implements DurableObject {
  private state: DurableObjectState;
  private env: any;
  private jobs: Map<string, AnalysisJob> = new Map();

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
  }

  /**
   * 공통 Job 객체 생성 로직
   */
  private createJob(body: any, jobId?: string, analysisId?: number): AnalysisJob {
    const generatedJobId = jobId || `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      id: generatedJobId,
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
      ...(analysisId && { analysisId }),
      createdAt: new Date().toISOString(),
      status: "pending",
    };
  }

  /**
   * 공통 에러 응답 생성
   */
  private createErrorResponse(message: string, details: string, status: number = 400): Response {
    return new Response(
      JSON.stringify({
        error: message,
        details: details,
      }),
      {
        status,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  /**
   * 공통 성공 응답 생성
   */
  private createSuccessResponse(data: any): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
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
      return this.createErrorResponse("Job ID is required", "jobId parameter is missing");
    }

    const job = this.jobs.get(jobId);
    if (!job) {
      return this.createErrorResponse("Job not found", `Job with id ${jobId} not found`, 404);
    }

    return this.createSuccessResponse({
      jobId: job.id,
      status: job.status,
      createdAt: job.createdAt,
      result: job.result,
      error: job.error,
    });
  }

  /**
   * Job 생성 (Queue Consumer가 호출)
   * POST /jobs/create
   */
  private async handleJobCreate(request: Request): Promise<Response> {
    try {
      const body = (await request.json()) as any;
      const job = this.createJob(body, body.jobId);

      // 생성 직후 상태 저장
      this.jobs.set(job.id, job);

      // Queue 없이 비동기 처리: 초기 저장 + 장시간 처리까지 백그라운드로 수행
      this.state.waitUntil(this.initializeAndProcessJob(job));

      return this.createSuccessResponse({
        success: true,
        jobId: job.id,
        message: "분석 작업이 등록되었습니다. 처리 대기 중입니다.",
        status: "pending",
      });
    } catch (error) {
      return this.createErrorResponse(
        "Invalid request body",
        error instanceof Error ? error.message : "Unknown error"
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
        return this.createErrorResponse("Job ID is required", "jobId is missing from request body");
      }

      const job = this.jobs.get(jobId);
      if (!job) {
        return this.createErrorResponse("Job not found", `Job with id ${jobId} not found`, 404);
      }

      job.status = status;
      if (result) job.result = result;
      if (error) job.error = error;

      return this.createSuccessResponse({
        success: true,
        jobId: jobId,
        status: job.status,
      });
    } catch (error) {
      return this.createErrorResponse(
        "Invalid request body",
        error instanceof Error ? error.message : "Unknown error"
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
      
      // 1. 임시 job 객체 생성 (DB 저장용)
      const tempJob = this.createJob(body, body.jobId);
      tempJob.status = "processing";

      // 2. DB에 초기 레코드 생성 (스트리밍도 미리 생성하여 통일)
      const analysisStartedAt = new Date();
      const title = generateTitle(tempJob);

      const initialSaveResult = await saveSajuAnalysisInitial(
        tempJob,
        title,
        analysisStartedAt,
        this.env
      );

      if (!initialSaveResult.success) {
        throw new Error(
          `스트리밍 분석 작업 초기화에 실패했습니다: ${initialSaveResult.error}`
        );
      }

      // 3. analysisId를 포함한 최종 job 객체 저장
      tempJob.analysisId = initialSaveResult.analysisId;
      this.jobs.set(tempJob.id, tempJob);

      // 스트리밍 처리 시작 (클라이언트로 스트리밍 응답 전송)
      return this.processStreamingJob(tempJob.id, true);
    } catch (error) {
      return this.createErrorResponse(
        "Invalid request body",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }

  private async processStreamingJob(jobId: string, shouldStreamToClient: boolean = true): Promise<Response> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return this.createErrorResponse("Job not found", `Job with id ${jobId} not found`, 404);
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

      return this.createErrorResponse(
        "스트리밍 처리 실패",
        error instanceof Error ? error.message : "Unknown error",
        500
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
          // 스트리밍 응답을 클라이언트로 전송하면서 응답 수집
          for await (const chunk of streamingResp) {
            if (chunk.text) {
              fullResponse += chunk.text;
              
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

          // 스트리밍 완료 후 DB 업데이트
          try {
            await self.saveAnalysisAndUpdateJob(job, fullResponse, latestUsageMetadata);
          } catch (saveError) {
            console.error("스트리밍 응답 업데이트 실패:", saveError);
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
    try {
      // 스트리밍 응답 처리
      const { fullResponse, latestUsageMetadata } = await this.processStreamChunks(streamingResp);

      // DB 업데이트 및 Job 상태 업데이트
      await this.saveAnalysisAndUpdateJob(job, fullResponse, latestUsageMetadata);
        
      return this.createSuccessResponse({
        success: true,
        jobId: jobId,
        analysisId: job.analysisId,
        status: "completed",
        message: "분석이 완료되었습니다.",
      });
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : "Unknown error";
      
      return this.createErrorResponse(
        "내부 스트리밍 처리 실패",
        error instanceof Error ? error.message : "Unknown error",
        500
      );
    }
  }

  /**
   * 스트리밍 응답 처리 공통 로직
   */
  private async processStreamChunks(streamingResp: any): Promise<{ fullResponse: string; latestUsageMetadata: any }> {
    let fullResponse = "";
    let latestUsageMetadata: any = null;
    
    for await (const chunk of streamingResp) {
      if (chunk.text) {
        fullResponse += chunk.text;
        if (chunk.usageMetadata) {
          latestUsageMetadata = chunk.usageMetadata;
        }
      }
    }
    
    return { fullResponse, latestUsageMetadata };
  }

  /**
   * 분석 결과 저장 및 Job 업데이트 공통 로직
   */
  private async saveAnalysisAndUpdateJob(job: AnalysisJob, fullResponse: string, latestUsageMetadata: any): Promise<void> {
    const analysisCompletedAt = new Date();

    if (!job.analysisId) {
      throw new Error("analysisId가 없어서 분석 결과를 업데이트할 수 없습니다.");
    }

    const saveResult = await updateSajuAnalysis(
      job.analysisId,
      fullResponse,
      analysisCompletedAt,
      this.env,
      latestUsageMetadata
    );

    if (saveResult.success) {
      await this.updateJobAfterSave(job, fullResponse, saveResult, latestUsageMetadata);
    } else {
      throw new Error(`분석 결과 저장 실패: ${saveResult.error}`);
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
        job.analysisId!
      )
    } catch (updateTransactionError) {
      console.error("[SajuAnalysisWorker] 포인트 거래 analysisId 업데이트 오류:", updateTransactionError);
    }

    job.status = "completed";
    job.result = {
      answer: fullResponse,
      analysisId: job.analysisId,
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
      
      const job = this.createJob(body, body.jobId, body.analysisId);
      job.status = "processing";
      
      this.jobs.set(job.id, job);

      // 스트리밍 처리 시작 (클라이언트로 스트리밍 응답 전송하지 않음)
      return this.processStreamingJob(job.id, false);
    } catch (error) {
      console.error(`[SajuAnalysisWorker] 작업 시작 실패:`, error);
      return this.createErrorResponse(
        "장시간 작업 시작 실패",
        error instanceof Error ? error.message : "Unknown error",
        500
      );
    }
  }


  /**
   * Queue 없이 동작할 때: 초기 DB 저장 후 내부 처리까지 백그라운드로 수행
   */
  private async initializeAndProcessJob(job: any): Promise<void> {
    try {
      // 1) 초기 레코드 생성
      const analysisStartedAt = new Date();
      const title = generateTitle(job);

      const initialSaveResult = await saveSajuAnalysisInitial(
        job,
        title,
        analysisStartedAt,
        this.env
      );

      if (!initialSaveResult.success) {
        job.status = "failed";
        job.error = `분석 작업 초기화에 실패했습니다: ${initialSaveResult.error}`;
        this.jobs.set(job.id, job);
        return;
      }

      // 2) analysisId 부여 후 내부 처리 실행
      job.analysisId = initialSaveResult.analysisId;
      this.jobs.set(job.id, job);

      await this.processStreamingJob(job.id, false);
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : "Unknown error";
      this.jobs.set(job.id, job);
    }
  }
}
