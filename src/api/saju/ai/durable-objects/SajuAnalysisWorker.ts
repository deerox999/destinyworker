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
import { createPrismaClient } from "../../../../common/prismaUtils";
/**
 * 524오류 때문에 논스트리밍 요청을 해도 내부적으로는 스트리밍 방식으로 호출 후 저장처리
 * 100초안에 ai가 응답을 내놓아야 하기때문
 */
/**
맞아요. 결론만 말하면:
반드시 “클라이언트로의 스트리밍”이어야 100초를 회피하는 건 아닙니다.
하지만 “우리 서버 → 외부(AI)” 구간이 Cloudflare 프록시(오렌지 구름)에 걸려 있으면, 하트비트/핑을 “클라이언트로” 보내도 524에는 전혀 영향이 없습니다. 524는 “Cloudflare → 오리진” 구간의 Proxy Read/Write Timeout(기본 100초/30초)에 걸려 발생하기 때문입니다. 즉, 브라우저로 보내는 핑은 해당 타임아웃을 연장하지 못합니다. 공식 문서도 장시간 처리에 대해 폴링·DNS-only 등으로 회피하라고 안내합니다. Cloudflare 524 문서
현상 정리
논스트리밍 3건 중 일부가 101초에 실패한 건, DO 내부에서 외부(AI) 호출이 CF 프록시 뒤에 있어 100초 Proxy Read Timeout에 걸린 케이스로 보입니다.
다른 1건이 101초에 성공한 건, 외부가 더 빨리 초기 바이트를 흘려 주었거나 경로·엣지 차이로 간신히 넘긴 케이스일 수 있습니다.
핵심 사실
524는 “Cloudflare → 오리진” 구간의 타임아웃입니다. “우리 → 브라우저” 구간의 keepalive(하트비트)는 이 타임아웃과 무관합니다.
따라서, 하트비트로 524를 회피할 수 없습니다. 필요 없어서 제거해 두었습니다.

권장 회피책
외부(AI) 호출 도메인을 Cloudflare 프록시에서 제외(DNS-only, 회색 구름)하거나, 
애초에 Cloudflare가 끼지 않는 도메인으로 직접 호출.
외부에 스트리밍 API가 있다면 “우리 → 외부”를 스트리밍으로 호출해 초기 바이트를 빠르게 받아 100초를 넘기지 않도록 유도(현재 그 방향으로 전환).
엔터프라이즈 요금제에서만 Proxy Read Timeout 상향 가능.
장시간 작업은 “즉시 응답 + 폴링” 아키텍처(이미 적용). 다만 외부 호출 자체가 CF 프록시에 걸려 있으면, 이 호출도 524에 걸릴 수 있으므로 위의 DNS-only가 사실상 정답입니다.
요청하신 대로 하트비트는 제거했습니다. 남는 조치로, 외부(AI) 호출 경로를 Cloudflare 프록시에서 반드시 분리하거나(회색 구름) 구글 공식 엔드포인트를 직접 쓰도록 변경하는 걸 권합니다.
하트비트/핑: 524 회피 불가
실효 해법: 외부 호출을 CF 프록시 바깥으로, 또는 업스트림 스트리밍 사용, 또는 엔터프라이즈로 타임아웃 상향
참고: Cloudflare 524 공식 문서
변경 사항 요약
DO 스트리밍 하트비트 제거
논스트리밍도 업스트림은 스트림으로 처리해 초기 바이트 유도
524 발생 시 백그라운드 전환/폴링 유지, 10분 초과 자동 실패/환불 유지
 */
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
      destination: body.destination,
      // 재질문/옵션 관련 전달 필드 유지
      followUpMode: body.followUpMode,
      optionsJson: body.optionsJson,
      previousTitle: body.previousTitle,
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

      // 업스트림은 항상 스트리밍으로 호출해 524(100초 Proxy Read Timeout) 회피
      const streamingResp = await ai.models.generateContentStream(payload);
      if (!streamingResp) throw new Error("스트리밍 응답을 받을 수 없습니다.");

      if (shouldStreamToClient) {
        return this.createStreamingResponse(job, streamingResp, jobId);
      } else {
        // 클라이언트로는 스트리밍하지 않고 내부 처리만 수행
        return this.processStreamingInternal(job, streamingResp, jobId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const code = (error as any)?.code || (error as any)?.status;
      const is524 = message?.includes("524") || code === 524;

      if (shouldStreamToClient && is524) {
        // 스트림 생성 전에 524가 발생한 경우: 백그라운드로 전환하고 간단한 SSE 알림 반환
        this.state.waitUntil(this.processStreamingJob(job.id, false));
        return this.createSSENoticeAndClose("스트리밍 연결이 시간초과되어 백그라운드 처리로 전환합니다.");
      }

      await this.failJob(job, message);
      return this.createErrorResponse("스트리밍 처리 실패", job.error || message, 500);
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

    const stream = new ReadableStream({
      async start(controller) {
        try {
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

          // 스트리밍 완료 후 저장/업데이트는 항상 백그라운드에서만 수행
          // 품질 검증/재시도/환불까지 포함한 최종화 로직으로 위임
          self.state.waitUntil(self.finalizeAndPersist(job.id, fullResponse, latestUsageMetadata));
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
          // no-op
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

      // 저장/업데이트는 백그라운드 최종화 로직으로 위임
      this.state.waitUntil(this.finalizeAndPersist(job.id, fullResponse, latestUsageMetadata));

      return this.createSuccessResponse({
        success: true,
        jobId: jobId,
        analysisId: job.analysisId,
        status: "processing",
        message: "분석 결과를 검증 중입니다. 필요 시 1회 재시도 후 최종 반영됩니다.",
      });
    } catch (error) {
      await this.failJob(job, error instanceof Error ? error.message : "Unknown error");
      return this.createErrorResponse("내부 스트리밍 처리 실패", job.error || "Unknown error", 500);
    }
  }

  /**
   * 간단한 SSE 알림 후 즉시 종료하는 스트림 생성
   */
  private createSSENoticeAndClose(message: string): Response {
    const stream = new ReadableStream({
      start(controller) {
        const notice = `data: ${JSON.stringify({ type: "notice", message })}\n\n`;
        controller.enqueue(new TextEncoder().encode(notice));
        controller.close();
      },
    });
    return new Response(stream);
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
  private async saveAnalysisAndUpdateJob(job: AnalysisJob, fullResponse: string, latestUsageMetadata: any, chartJson?: string | null): Promise<void> {
    const analysisCompletedAt = new Date();

    if (!job.analysisId) {
      throw new Error("analysisId가 없어서 분석 결과를 업데이트할 수 없습니다.");
    }

    // 이미 실패 처리된 작업이면 저장을 건너뜁니다.
    if (job.status === "failed" || job.status === "completed") {
      return;
    }

    const saveResult = await updateSajuAnalysis(
      job.analysisId,
      fullResponse,
      analysisCompletedAt,
      this.env,
      latestUsageMetadata,
      chartJson ?? null
    );

    if (saveResult.success) {
      await this.updateJobAfterSave(job, fullResponse, saveResult, latestUsageMetadata);
      await this.state.storage.put(job.id, job);
      // 후처리: 목적지가 지정된 경우 자동 반영 (예: celebrityTranslation 업데이트)
      try {
        if (job.destination && job.destination.type === "celebrityTranslation") {
          const prisma = createPrismaClient(this.env.DB);
          const { celebrityId, languageCode } = job.destination;

          // 해당 번역이 존재하는지 확인 후 업데이트
          const existing = await prisma.celebrityTranslation.findFirst({
            where: { celebrityId, languageCode },
            select: { id: true },
          });

          if (existing) {
            const res = await prisma.celebrityTranslation.update({
              where: { id: existing.id },
              data: { aiResponse: fullResponse },
            });
          }
          await prisma.$disconnect();
        }
      } catch (postProcessError) {
        console.error("[SajuAnalysisWorker] 후처리(목적지 반영) 실패:", postProcessError);
        // 후처리 실패는 작업 실패로 간주하지 않음
      }
    } else {
      throw new Error(`분석 결과 저장 실패: ${saveResult.error}`);
    }
  }

  /**
   * 응답 품질 검사: 빈값, 30자 이하, 생성 시작 후 10초 이내 완료
   */
  private isPoorResponse(job: AnalysisJob, fullResponse: string, completedAt: Date): boolean {
    const text = (fullResponse || "").trim();
    if (text.length === 0) return true;
    if (text.length <= 30) return true;
    const startedMs = Date.parse(job.createdAt);
    if (isFinite(startedMs)) {
      const elapsed = completedAt.getTime() - startedMs;
      if (elapsed <= 10_000) return true;
    }
    return false;
  }

  /**
   * 최종화: 품질검사 → 재시도(1회) → 성공 저장 또는 실패 환불
   * 항상 백그라운드에서만 호출되어야 함
   */
  private async finalizeAndPersist(jobId: string, fullResponse: string, latestUsageMetadata: any): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;
    let shouldClearTimeout = true;
    try {
      // 이미 완료/실패된 작업은 중복 저장 방지
      if (job.status === "completed" || job.status === "failed") {
        return;
      }
      const completedAt = new Date();

      // 대운/종합운세의 경우 본문 부록 JSON 추출 및 본문 정리
      let cleanedResponse = fullResponse;
      let extractedChartJson: string | null = null;
      try {
        if (["대운", "종합운세"].includes(job.analysisType)) {
          const startTag = "===JSON_START===";
          const endTag = "===JSON_END===";
          const startIdx = fullResponse.indexOf(startTag);
          const endIdx = fullResponse.indexOf(endTag);
          if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            const jsonRaw = fullResponse.slice(startIdx + startTag.length, endIdx).trim();
            cleanedResponse = (fullResponse.slice(0, startIdx) + fullResponse.slice(endIdx + endTag.length)).trim();
            try { JSON.parse(jsonRaw); extractedChartJson = jsonRaw; } catch (_) { extractedChartJson = null; }
          }
        }
      } catch (_) { /* ignore */ }

      // 품질 검사 및 재시도 제어
      const attempt = job.retryAttempt || 0;
      const poor = this.isPoorResponse(job, cleanedResponse, completedAt);

      if (poor) {
        if (attempt < 1) {
          // 1회 재시도: 포인트 재차감 없음, 동일 analysisId 유지
          job.retryAttempt = attempt + 1;
          this.jobs.set(job.id, job);
          await this.state.storage.put(job.id, job);
          await this.scheduleAlarmSoon();
          // 다시 업스트림 호출 (내부 처리) - 백그라운드로 스케줄
          this.state.waitUntil(this.processStreamingJob(job.id, false));
          shouldClearTimeout = false; // 재시도 진행 중이므로 타임아웃 유지
          return;
        }

        // 재시도 후에도 품질 미달 → 실패 및 환불
        await this.failJob(job, "응답 품질 미달(빈 응답/짧은 응답/너무 빠른 완료)");
        return;
      }

      // 품질 통과 → 저장 및 완료 처리
      await this.saveAnalysisAndUpdateJob(job, cleanedResponse, latestUsageMetadata, extractedChartJson);
      await this.state.storage.put(job.id, job);
    } catch (e) {
      await this.failJob(job!, e instanceof Error ? e.message : "Unknown error");
    } finally {
      // 재시도 중이 아닐 때만 타임아웃 정리
      if (shouldClearTimeout) {
        this.clearJobTimeout(jobId);
      }
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
      // 타임아웃 초과 같은 명시적 종료 사유는 즉시 실패 처리(재시도 없음)
      const isTimeoutMessage = /10분|시간을\s*초과/.test(message || "");

      if (!isTimeoutMessage) {
        const attempt = job.retryAttempt || 0;
        if (attempt < 1) {
          // 1회 재시도: 포인트 재차감 없음, 동일 analysisId 유지
          job.retryAttempt = attempt + 1;
          job.status = "processing";
          job.error = undefined;
          this.jobs.set(job.id, job);
          await this.state.storage.put(job.id, job);
          await this.scheduleAlarmSoon();
          // 백그라운드로 재시도 실행
          this.state.waitUntil(this.processStreamingJob(job.id, false));
          return;
        }
      }

      // 최종 실패 처리 및 환불
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
