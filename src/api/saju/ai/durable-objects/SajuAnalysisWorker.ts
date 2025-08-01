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
      case "/status":
        return this.handleStatus(request);
      case "/submit":
        return this.handleSubmit(request);
      case "/update-status":
        return this.handleUpdateStatus(request);
      case "/stream":
        return this.handleStream(request);
      default:
        return new Response("Not Found", { status: 404 });
    }
  }

  private async handleStatus(request: Request): Promise<Response> {
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

  private async handleSubmit(request: Request): Promise<Response> {
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
        model: body.model || "gemini-2.5-pro",
        fortuneType: body.fortuneType,
        generationConfig: body.generationConfig,
        safetySettings: body.safetySettings,
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

  private async handleUpdateStatus(request: Request): Promise<Response> {
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

  private async handleStream(request: Request): Promise<Response> {
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
        model: body.model || "gemini-2.5-pro",
        fortuneType: body.fortuneType,
        generationConfig: body.generationConfig,
        safetySettings: body.safetySettings,
        createdAt: new Date().toISOString(),
        status: "processing",
      };

      this.jobs.set(jobId, job);

      // 스트리밍 처리 시작
      return this.processStreamingJob(jobId);
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

  private async processStreamingJob(jobId: string): Promise<Response> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 로컬 환경에서만 콘솔 로그 출력
    if (this.env.NODE_ENV === "development" || this.env.NODE_ENV === "local") {
      console.log(`[SajuAnalysisWorker] 스트리밍 작업 시작: ${jobId}`);
    }

    try {
      // Gemini API 호출
      const ai = new GoogleGenAI({
        apiKey: this.env.GOOGLE_GEMINI_API_KEY,
      });

      const payload = buildGeminiPayload(job);
      const streamingResp = await ai.models.generateContentStream(payload);

      if (!streamingResp) {
        throw new Error("스트리밍 응답을 받을 수 없습니다.");
      }

      // 스트리밍 응답 생성
      let fullResponse = "";
      const self = this; // this 컨텍스트 보존
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of streamingResp) {
              if (chunk.text) {
                fullResponse += chunk.text;
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
                self.env
              );
              if (saveResult.success) {
                // 포인트 거래 기록의 analysisId 업데이트
                try {
                  const updateTransactionResult =
                    await updatePointTransactionAnalysisId(
                      self.env.DB,
                      job.userId,
                      job.reference,
                      saveResult.analysisId!
                    );

                  if (updateTransactionResult) {
                    console.log(
                      `[SajuAnalysisWorker] 포인트 거래 analysisId 업데이트 성공: ${saveResult.analysisId}`
                    );
                  } else {
                    console.warn(
                      `[SajuAnalysisWorker] 포인트 거래 analysisId 업데이트 실패: ${saveResult.analysisId}`
                    );
                  }
                } catch (updateTransactionError) {
                  console.error(
                    "[SajuAnalysisWorker] 포인트 거래 analysisId 업데이트 오류:",
                    updateTransactionError
                  );
                }

                job.status = "completed";
                job.result = {
                  answer: fullResponse,
                  analysisId: saveResult.analysisId,
                  metadata: {
                    modelUsed: job.model,
                    timestamp: new Date().toISOString(),
                    responseType: getResponseType(job.type),
                  },
                };
              }
            } catch (saveError) {
              console.error("스트리밍 응답 저장 실패:", saveError);
            }

            controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
            controller.close();
          } catch (error) {
            console.error("스트리밍 오류:", error);
            job.status = "failed";
            job.error =
              error instanceof Error ? error.message : "Unknown error";

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
}
