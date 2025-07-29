import { GoogleGenAI } from "@google/genai";
import { POINT_COSTS } from "../../../common/paymentUtils";

// 분석 작업 상태
interface AnalysisJob {
  id: string;
  userId: number;
  analysisType: string;
  type: string;
  pointsCost: number;
  reference: string;
  i18n: string;
  timezone: string;
  userPrompt: string;
  systemPrompt?: string;
  sajuData?: any;
  conversationHistory?: any[];
  model: string;
  fortuneType?: string;
  generationConfig?: any;
  safetySettings?: any[];
  createdAt: string;
  status: "pending" | "processing" | "completed" | "failed";
  result?: any;
  error?: string;
}

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
        pointsCost: body.pointsCost || this.getPointsCost(body.type || "individual"),
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
        pointsCost: body.pointsCost || this.getPointsCost(body.type || "individual"),
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

    try {
      // Gemini API 호출
      const ai = new GoogleGenAI({
        apiKey: this.env.GOOGLE_GEMINI_API_KEY,
      });

      const payload = this.buildGeminiPayload(job);
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
            const title = self.generateTitle(job);

            try {
              const saveResult = await self.saveSajuAnalysis(
                job,
                fullResponse,
                title,
                analysisCompletedAt
              );
              if (saveResult.success) {
                job.status = "completed";
                job.result = {
                  answer: fullResponse,
                  analysisId: saveResult.analysisId,
                  metadata: {
                    model_used: job.model,
                    timestamp: new Date().toISOString(),
                    response_type: self.getResponseType(job.type),
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

  private getPointsCost(type: string): number {
    switch (type) {
      case "compatibility":
        return POINT_COSTS.COMPATIBILITY_ANALYSIS;
      case "yearly_fortune":
        return POINT_COSTS.YEARLY_FORTUNE;
      default:
        return POINT_COSTS.SAJU_ANALYSIS;
    }
  }

  private buildGeminiPayload(job: AnalysisJob): any {
    const contents: any[] = [];

    // 시스템 프롬프트 구성
    let systemPrompt =
      job.systemPrompt ||
      "당신은 전문 사주명리학자입니다. 사용자의 사주 정보를 바탕으로 상세하고 친절하게 운세를 분석해주세요.";

    if (job.i18n && job.i18n !== "ko") {
      const languagePrompts: { [key: string]: string } = {
        en: "You are a professional fortune teller and astrologer. Please provide detailed and friendly fortune analysis based on the user's birth chart information.",
        ja: "あなたは専門の占い師・占星術師です。ユーザーの生年月日情報に基づいて、詳細で親切な運勢分析を提供してください。",
        zh: "您是一位专业的算命师和占星师。请根据用户的生辰八字信息提供详细而友好的运势分析。",
        vi: "Bạn là một nhà chiêm tinh và thầy bói chuyên nghiệp. Vui lòng cung cấp phân tích vận mệnh chi tiết và thân thiện dựa trên thông tin lá số tử vi của người dùng.",
      };
      systemPrompt =
        job.systemPrompt || languagePrompts[job.i18n] || systemPrompt;
    }

    // 사주 데이터 추가
    if (job.sajuData) {
      if (job.sajuData.person1 && job.sajuData.person2) {
        contents.push({
          role: "user",
          parts: [
            {
              text: `궁합 분석용 사주 데이터:\n\n첫 번째 사람 (${
                job.sajuData.person1.name
              }):\n${JSON.stringify(
                job.sajuData.person1.sajuData,
                null,
                2
              )}\n\n두 번째 사람 (${
                job.sajuData.person2.name
              }):\n${JSON.stringify(job.sajuData.person2.sajuData, null, 2)}`,
            },
          ],
        });
      } else {
        contents.push({
          role: "user",
          parts: [
            { text: `사주 데이터: ${JSON.stringify(job.sajuData, null, 2)}` },
          ],
        });
      }
    }

    // 대화 기록 추가
    if (job.conversationHistory && job.conversationHistory.length > 0) {
      contents.push(...job.conversationHistory);
    }

    // 현재 사용자 프롬프트와 시스템 프롬프트 합치기
    const combinedPrompt = `${systemPrompt}\n\n${job.userPrompt}`;
    contents.push({
      role: "user",
      parts: [{ text: combinedPrompt }],
    });

    // API에서 전송한 설정을 우선 사용하고, 없으면 기본값 사용
    const generationConfig = job.generationConfig || {
      temperature: 0.4,
      topP: 0.4,
      topK: 40,
      maxOutputTokens: 65535
    };

    const safetySettings = job.safetySettings || [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
    ];

    return {
      model: job.model,
      contents,
      ...generationConfig,
      safetySettings,
    };
  }

  private generateTitle(job: AnalysisJob): string {
    let title = `[${job.analysisType}]`;

    if (job.fortuneType) {
      title = `[${this.getFortuneTypeTitle(job.fortuneType)}]`;
    }

    if (job.sajuData) {
      if (
        job.sajuData.정보 &&
        job.sajuData.정보.생년월일 &&
        job.sajuData.정보.생년월일.이름
      ) {
        title += ` ${job.sajuData.정보.생년월일.이름}님`;
      } else if (
        job.sajuData.person1 &&
        job.sajuData.person1.정보 &&
        job.sajuData.person1.정보.생년월일 &&
        job.sajuData.person1.정보.생년월일.이름
      ) {
        title += ` ${job.sajuData.person1.정보.생년월일.이름}님`;
        if (
          job.sajuData.person2 &&
          job.sajuData.person2.정보 &&
          job.sajuData.person2.정보.생년월일 &&
          job.sajuData.person2.정보.생년월일.이름
        ) {
          title += ` & ${job.sajuData.person2.정보.생년월일.이름}님`;
        }
      }
    }

    return title;
  }

  private getFortuneTypeTitle(fortuneType: string): string {
    switch (fortuneType) {
      case "this_year":
        return "올해운세";
      case "next_year":
        return "내년운세";
      default:
        return "연간운세";
    }
  }

  private getResponseType(type: string): string {
    switch (type) {
      case "compatibility":
        return "compatibility_analysis";
      case "yearly_fortune":
        return "yearly_fortune";
      default:
        return "text";
    }
  }

  private async saveSajuAnalysis(
    job: AnalysisJob,
    aiResponse: string,
    title: string,
    analysisCompletedAt: Date
  ): Promise<{ success: boolean; analysisId?: number; error?: string }> {
    try {
      let birthData = null;
      if (job.sajuData) {
        if (job.sajuData.정보 && job.sajuData.정보.생년월일) {
          birthData = job.sajuData.정보.생년월일;
        } else if (
          job.sajuData.person1 &&
          job.sajuData.person1.정보 &&
          job.sajuData.person1.정보.생년월일
        ) {
          birthData = {
            person1: job.sajuData.person1.정보.생년월일,
            person2: job.sajuData.person2?.정보?.생년월일 || null,
          };
        }
      }

      const now = new Date();
      const createdAt = now.toISOString();
      const updatedAt = now.toISOString();
      const startedAt = job.createdAt;
      const completedAt = analysisCompletedAt.toISOString();

      const result = await this.env.DB.prepare(
        `
          INSERT INTO saju_analyses (
            user_id, analysis_type, type, title, sajuData, user_prompt, 
            system_prompt, ai_response, model_used, points_spent, 
            created_at, updated_at, i18n, timezone, analysis_started_at, analysis_completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
        .bind(
          job.userId,
          job.analysisType,
          job.type,
          title,
          JSON.stringify(birthData),
          job.userPrompt,
          job.systemPrompt || null,
          aiResponse,
          job.model,
          job.pointsCost,
          createdAt,
          updatedAt,
          job.i18n,
          job.timezone,
          startedAt,
          completedAt
        )
        .run();

      return {
        success: true,
        analysisId: result.meta.last_row_id,
      };
    } catch (error) {
      console.error("사주 분석 결과 저장 실패:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
