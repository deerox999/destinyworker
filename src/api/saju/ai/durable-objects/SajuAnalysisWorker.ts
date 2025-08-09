import { GoogleGenAI } from "@google/genai";
import { getAnalysisTypePoints, updatePointTransactionAnalysisId, refundPoints } from "../../../../common/paymentUtils";
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
  private jobTimeouts: Map<string, any> = new Map();
  private isProcessingFromAlarm: boolean = false;

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

    let job = this.jobs.get(jobId);
    if (!job) {
      // 스토리지에서 복구 시도
      const stored = await this.state.storage.get<AnalysisJob>(jobId);
      if (stored) {
        job = stored;
        this.jobs.set(jobId, job);
      }
    }
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
   * Job 생성
   * POST /jobs/create
   */
  private async handleJobCreate(request: Request): Promise<Response> {
    try {
      const body = (await request.json()) as any;
      const job = this.createJob(body, body.jobId);

      // 생성 직후 상태 저장
      this.jobs.set(job.id, job);
      await this.state.storage.put(job.id, job);

      // Queue 없이 비동기 처리: 초기 저장 + 장시간 처리까지 백그라운드로 수행
      this.state.waitUntil(this.initializeAndProcessJob(job));
      // 알람 스케줄: 인스턴스 종료/재시작에도 재개되도록 보조
      await this.scheduleAlarmSoon();

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
   * Job 상태 업데이트
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
      await this.state.storage.put(tempJob.id, tempJob);

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
      // 처리 시작 상태 업데이트
      job.status = "processing";
      // 10분 타임아웃 스케줄링
      this.scheduleJobTimeout(job);
      await this.state.storage.put(job.id, job);

      // Gemini API 호출 준비
      const ai = new GoogleGenAI({ apiKey: this.env.GOOGLE_GEMINI_API_KEY });
      const payload = buildGeminiPayload(job);

      if (shouldStreamToClient) {
        // 스트리밍 필요: 스트리밍 API 사용
        const streamingResp = await ai.models.generateContentStream(payload);
        if (!streamingResp) throw new Error("스트리밍 응답을 받을 수 없습니다.");
        return this.createStreamingResponse(job, streamingResp, jobId);
      }

      // 비스트리밍 처리: 비스트리밍 API 사용 (동시 스트림 연결 병목 회피)
      return await this.processNonStreamingJob(ai, job, payload, jobId);
    } catch (error) {
      await this.failJob(job, error instanceof Error ? error.message : "Unknown error");
      return this.createErrorResponse("스트리밍 처리 실패", job.error || "Unknown error", 500);
    }
  }

  /**
   * 클라이언트로 스트리밍 응답을 전송하는 처리
   */
  private createStreamingResponse(job: AnalysisJob, streamingResp: any, jobId: string): Response {
    let fullResponse = "";
    let latestUsageMetadata: any = null;
    const self = this;
    let streamCanceledByClient = false;
    let heartbeatId: any = null;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 주기적 하트비트로 idle 타임아웃 방지
          heartbeatId = setInterval(() => {
            if (!streamCanceledByClient) {
              // SSE 코멘트 또는 핑 이벤트
              const ping = `: ping\n\n`;
              controller.enqueue(new TextEncoder().encode(ping));
            }
          }, 8000);

          // 스트리밍 응답을 클라이언트로 전송하면서 응답 수집
          for await (const chunk of streamingResp) {
            // 타임아웃 등으로 실패 처리되었는지 확인하고 중단
            const latest = self.jobs.get(job.id);
            if (latest && latest.status === "failed") {
              const timeoutData = `data: ${JSON.stringify({
                type: "error",
                message: latest.error || "작업이 중단되었습니다.",
              })}\n\n`;
              controller.enqueue(new TextEncoder().encode(timeoutData));
              break;
            }

            if (chunk.text) {
              fullResponse += chunk.text;
              
              if (chunk.usageMetadata) {
                latestUsageMetadata = chunk.usageMetadata;
              }
              if (!streamCanceledByClient) {
                const data = `data: ${JSON.stringify({ text: chunk.text })}\n\n`;
                controller.enqueue(new TextEncoder().encode(data));
              }
            } else {
              if (!streamCanceledByClient) {
                const data = `data: ${JSON.stringify(chunk)}\n\n`;
                controller.enqueue(new TextEncoder().encode(data));
              }
            }
          }

          // 스트리밍 완료 후 DB 업데이트
          try {
            await self.saveAnalysisAndUpdateJob(job, fullResponse, latestUsageMetadata);
          } catch (saveError) {
            console.error("스트리밍 응답 업데이트 실패:", saveError);
          }

          // 타임아웃 클리어
          self.clearJobTimeout(job.id);
          if (!streamCanceledByClient) {
            controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
            controller.close();
          }
        } catch (error) {
          console.error("스트리밍 오류:", error);
          const message = error instanceof Error ? error.message : "Unknown error";
          const is524 = message?.includes("524") || (error as any)?.code === 524;

          if (is524) {
            // 스트리밍 연결 문제로 판단, 백그라운드 비스트리밍으로 자동 전환
            self.state.waitUntil(self.processStreamingJob(job.id, false));

            const notice = `data: ${JSON.stringify({
              type: "notice",
              message: "스트리밍 연결이 끊겨 백그라운드 처리로 전환합니다.",
            })}\n\n`;
            if (!streamCanceledByClient) {
              controller.enqueue(new TextEncoder().encode(notice));
              controller.close();
            }
          } else {
            await self.failJob(job, message);
            const errorData = `data: ${JSON.stringify({
              type: "error",
              message: job.error || message,
            })}\n\n`;
            if (!streamCanceledByClient) {
              controller.enqueue(new TextEncoder().encode(errorData));
              controller.close();
            }
          }
        } finally {
          if (heartbeatId) clearInterval(heartbeatId);
        }
      },
      async cancel(_reason) {
        // 클라이언트가 SSE 연결을 끊었지만, 서버는 계속 처리해서 저장
        streamCanceledByClient = true;
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
      await this.state.storage.put(job.id, job);
      this.clearJobTimeout(job.id);
        
      return this.createSuccessResponse({
        success: true,
        jobId: jobId,
        analysisId: job.analysisId,
        status: "completed",
        message: "분석이 완료되었습니다.",
      });
    } catch (error) {
      await this.failJob(job, error instanceof Error ? error.message : "Unknown error");
      return this.createErrorResponse("내부 스트리밍 처리 실패", job.error || "Unknown error", 500);
    }
  }

  /**
   * 비스트리밍 처리 (generateContent 사용)
   */
  private async processNonStreamingJob(ai: any, job: AnalysisJob, payload: any, jobId: string): Promise<Response> {
    try {
      const resp = await ai.models.generateContent(payload);

      // 다양한 SDK 응답 형태를 견고하게 처리
      const fullResponse = this.extractTextFromGenerateResponse(resp);
      const latestUsageMetadata = resp?.response?.usageMetadata || resp?.usageMetadata || null;

      await this.saveAnalysisAndUpdateJob(job, fullResponse, latestUsageMetadata);
      await this.state.storage.put(job.id, job);
      this.clearJobTimeout(job.id);

      return this.createSuccessResponse({
        success: true,
        jobId,
        analysisId: job.analysisId,
        status: "completed",
        message: "분석이 완료되었습니다.",
      });
    } catch (error) {
      await this.failJob(job, error instanceof Error ? error.message : "Unknown error");
      return this.createErrorResponse("비스트리밍 처리 실패", job.error || "Unknown error", 500);
    }
  }

  /**
   * generateContent 응답에서 텍스트를 추출
   */
  private extractTextFromGenerateResponse(resp: any): string {
    // 신 SDK (@google/genai) 또는 구 SDK 호환 처리
    if (!resp) return "";

    // 신 SDK 형태 추정
    if (resp.response?.text) {
      try {
        return typeof resp.response.text === "function" ? resp.response.text() : resp.response.text;
      } catch (_) { /* ignore */ }
    }

    // 일반 텍스트 속성 시도
    if (typeof resp.text === "string") return resp.text;

    // candidates → parts → text 추출 시도
    const candidates = resp.response?.candidates || resp.candidates || [];
    for (const c of candidates) {
      const parts = c?.content?.parts || c?.parts || [];
      const texts = parts.map((p: any) => p?.text).filter(Boolean);
      if (texts.length) return texts.join("");
    }

    // 마지막 fallback: 문자열화
    return typeof resp === "string" ? resp : JSON.stringify(resp);
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

    // 이미 실패 처리된 작업이면 저장을 건너뜁니다.
    if (job.status === "failed") {
      return;
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
      await this.state.storage.put(job.id, job);
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
   * 장시간 비동기 처리
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
      job.status = "processing";
      this.jobs.set(job.id, job);
      await this.state.storage.put(job.id, job);
      // 타임아웃 스케줄링
      this.scheduleJobTimeout(job);
      await this.scheduleAlarmSoon();

      await this.processStreamingJob(job.id, false);
    } catch (error) {
      await this.failJob(job, error instanceof Error ? error.message : "Unknown error");
    }
  }

  /**
   * 작업 실패 공통 처리: 상태 업데이트, DB 업데이트, 포인트 환불, 타이머 정리
   */
  private async failJob(job: AnalysisJob, message: string): Promise<void> {
    try {
      job.status = "failed";
      job.error = message;
      this.jobs.set(job.id, job);
      await this.state.storage.put(job.id, job);

      // DB 실패 내용 업데이트
      if (job.analysisId) {
        try {
          await updateSajuAnalysis(
            job.analysisId,
            `분석이 예상보다 오래 걸려 중단되었거나 오류가 발생했습니다.\n사유: ${message} \n 포인트 환불 처리 완료: ${job.pointsCost}`,
            new Date(),
            this.env
          );
        } catch (e) {
          console.error("[SajuAnalysisWorker] 실패 업데이트 오류:", e);
        }
      }

      // 포인트 환불
      try {
        await refundPoints(
          this.env.DB,
          job.userId,
          job.pointsCost,
          `사주 분석 실패로 인한 포인트 환불 (${job.type})`,
          job.reference,
          job.analysisId
        );
      } catch (refundError) {
        console.error("[SajuAnalysisWorker] 환불 처리 오류:", refundError);
      }
    } finally {
      this.clearJobTimeout(job.id);
    }
  }

  /**
   * 작업 타임아웃 스케줄링 (기본 10분)
   */
  private scheduleJobTimeout(job: AnalysisJob, timeoutMs: number = 10 * 60 * 1000): void {
    // 기존 타이머 정리
    this.clearJobTimeout(job.id);

    const timeoutId = setTimeout(async () => {
      try {
        // 완료 여부 재확인
        const latest = this.jobs.get(job.id);
        if (!latest || latest.status === "completed" || latest.status === "failed") {
          return;
        }
        await this.failJob(latest, "작업 시간이 10분을 초과했습니다.");
      } catch (e) {
        console.error("[SajuAnalysisWorker] 타임아웃 처리 오류:", e);
      }
    }, timeoutMs);

    this.jobTimeouts.set(job.id, timeoutId);
  }

  private clearJobTimeout(jobId: string): void {
    const id = this.jobTimeouts.get(jobId);
    if (id) {
      clearTimeout(id);
      this.jobTimeouts.delete(jobId);
    }
  }

  /**
   * DO 알람: 인스턴스 재시작/중단 이후에도 보류 작업을 재개
   */
  async alarm(): Promise<void> {
    if (this.isProcessingFromAlarm) return;
    this.isProcessingFromAlarm = true;
    try {
      const list = await this.state.storage.list<AnalysisJob>({});
      const now = Date.now();
      for (const [, job] of list) {
        if (!job) continue;
        // 이미 완료/실패된 작업은 스킵
        if (job.status === "completed" || job.status === "failed") continue;

        // 10분 초과 시 실패 처리
        const createdAtMs = Date.parse(job.createdAt);
        if (isFinite(createdAtMs) && now - createdAtMs > 10 * 60 * 1000) {
          await this.failJob(job, "작업 시간이 10분을 초과했습니다.");
          continue;
        }

        // 메모리에 올리고 처리 재개 (논스트리밍으로 내부 처리)
        this.jobs.set(job.id, job);
        try {
          await this.processStreamingJob(job.id, false);
        } catch (e) {
          await this.failJob(job, e instanceof Error ? e.message : "Unknown error");
        }
      }
    } finally {
      this.isProcessingFromAlarm = false;
      // 아직 미완료 작업이 남았으면 알람을 조금 뒤에 다시 예약
      const list = await this.state.storage.list<AnalysisJob>({});
      for (const [, job] of list) {
        if (job && (job.status === "pending" || job.status === "processing")) {
          await this.scheduleAlarmSoon();
          break;
        }
      }
    }
  }

  private async scheduleAlarmSoon(delayMs: number = 1000): Promise<void> {
    const when = Date.now() + delayMs;
    await this.state.storage.setAlarm(when);
  }
}
