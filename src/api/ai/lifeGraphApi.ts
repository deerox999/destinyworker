import { GoogleGenAI, Modality } from "@google/genai";
import { Context } from "hono";
import { getUserFromToken } from "../../common/utils";
import {
  usePoints,
  refundPoints,
  updatePointTransactionAnalysisId,
} from "../../common/paymentUtils";

// 포인트 상수 정의
const POINT_COSTS = {
  LIFE_GRAPH_ANALYSIS: 2000,
  LIFE_GRAPH_WITH_IMAGE: 2500, // 이미지 포함 버전
} as const;

// Gemini API와 통신하기 위한 환경 변수 확장
export interface Env {
  GOOGLE_GEMINI_API_KEY: string; // Gemini API 키
}

// API 사용자가 보내는 요청 본문 타입 정의
interface LifeGraphAnalysisRequest {
  sajuData: SajuData; // 사주 정보 (필수)
  analysisType?: string;
  i18n?: string; // 언어 설정 (ko, en, ja, zh, vi 등)
  timezone?: string; // 시간대 (Asia/Seoul, America/New_York 등)
  stream?: boolean; // 스트리밍 응답 여부
  graphType?: string; // 'life_cycle', 'fortune_trend', 'relationship_flow' 등
  includeImage?: boolean; // 이미지 생성 포함 여부
  imageStyle?: string; // 'mascot', 'avatar', 'symbolic', 'artistic' 등
}

// 사주 정보 타입 정의 (방대한 계산된 데이터이므로 any로 처리)
type SajuData = any;

// 차트 데이터 타입 정의
interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
  options?: ChartOptions;
}

// 이미지 데이터 타입 정의
interface ImageData {
  url?: string;
  prompt?: string;
  style?: string;
  generatedAt?: string;
  metadata?: {
    model?: string;
    size?: string;
    quality?: string;
  };
}

interface ChartDataset {
  label: string;
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string | string[];
  borderWidth?: number;
  fill?: boolean;
  tension?: number;
}

interface ChartOptions {
  responsive?: boolean;
  maintainAspectRatio?: boolean;
  scales?: {
    y?: {
      beginAtZero?: boolean;
      max?: number;
      min?: number;
    };
    x?: {
      type?: string;
    };
  };
  plugins?: {
    legend?: {
      display?: boolean;
    };
    tooltip?: {
      enabled?: boolean;
    };
  };
}

// --- Gemini API의 세부 타입 정의 ---

interface Content {
  role: "user" | "model" | "function" | "tool";
  parts: Part[];
}

interface Part {
  text?: string;
  inlineData?: BlobPart;
  fileData?: FileData;
  functionCall?: FunctionCall;
  functionResponse?: FunctionResponse;
}

interface BlobPart {
  mimeType: string;
  data: string; // base64 encoded
}

interface FileData {
  mimeType: string;
  fileUri: string;
}

interface FunctionCall {
  name: string;
  args: object;
}

interface FunctionResponse {
  name: string;
  response: object;
}

interface Tool {
  functionDeclarations?: FunctionDeclaration[];
}

interface FunctionDeclaration {
  name: string;
  description: string;
  parameters?: object; // OpenAPI 3.0.3 JSON Schema
}

interface ToolConfig {
  functionCallingConfig?: {
    mode: "AUTO" | "ANY" | "NONE";
  };
}

interface SafetySetting {
  category:
    | "HARM_CATEGORY_HARASSMENT"
    | "HARM_CATEGORY_HATE_SPEECH"
    | "HARM_CATEGORY_SEXUALLY_EXPLICIT"
    | "HARM_CATEGORY_DANGEROUS_CONTENT";
  threshold:
    | "BLOCK_NONE"
    | "BLOCK_ONLY_HIGH"
    | "BLOCK_MEDIUM_AND_ABOVE"
    | "BLOCK_LOW_AND_ABOVE"
    | "OFF";
}

interface GenerationConfig {
  /**
   * 생성할 응답 후보의 수.
   * @default 1
   */
  candidateCount?: number;
  /**
   * 생성을 중단할 시퀀스 목록.
   */
  stopSequences?: string[];
  /**
   * 생성할 토큰의 최대 개수.
   * @default 2048
   */
  maxOutputTokens?: number;
  /**
   * 샘플링 온도를 제어합니다 (0.0 ~ 1.0). 값이 높을수록 더 창의적인 결과가 나옵니다.
   * @default 1.0
   */
  temperature?: number;
  /**
   * Top-p 샘플링. 확률의 합이 이 값 이상이 되는 토큰들만 고려합니다.
   * @default 1.0
   */
  topP?: number;
  /**
   * Top-k 샘플링. 가장 확률이 높은 k개의 토큰만 고려합니다.
   * @default 1
   */
  topK?: number;
  /**
   * 응답의 MIME 타입을 지정합니다. 'application/json'으로 설정하여 JSON 출력을 강제할 수 있습니다.
   */
  responseMimeType?: "text/plain" | "application/json";
  /**
   * 시드 값 (재현 가능한 결과를 위한)
   */
  seed?: number;
}

// 공통 인터페이스 정의
interface AnalysisConfig {
  model: string;
  analysisType: string;
  type: string;
  pointsCost: number;
  reference: string;
  i18n: string;
  timezone: string;
  body: LifeGraphAnalysisRequest;
  user: any;
  db: any;
}

/**
 * 사용자 요청을 바탕으로 Gemini API에 보낼 요청 본문을 생성합니다.
 */
function buildGeminiPayload(body: LifeGraphAnalysisRequest): any {
  const contents: Content[] = [];

  // 1. 시스템 프롬프트 구성 (언어 설정 반영)
  let systemPrompt = "당신은 전문 사주명리학자이자 인생 그래프 분석 전문가입니다. 사용자의 사주 정보를 바탕으로 인생의 주요 시점과 운세 흐름을 분석하여 텍스트 설명과 함께 차트 데이터를 제공해주세요. 응답은 반드시 JSON 형태로 제공하며, 'text' 필드에는 상세한 분석 텍스트를, 'chartData' 필드에는 차트 데이터를 포함해야 합니다.";

  // 이미지 생성이 포함된 경우 시스템 프롬프트 확장
  if (body.includeImage) {
    systemPrompt += " 또한 사용자의 사주 특성을 반영한 마스코트나 아바타 이미지 생성 프롬프트도 함께 제공해주세요. 'imagePrompt' 필드에 이미지 생성용 상세한 프롬프트를 포함해야 합니다.";
  }

  // 언어별 기본 시스템 프롬프트 설정
  if (body.i18n && body.i18n !== "ko") {
    const languagePrompts: { [key: string]: string } = {
      en: "You are a professional fortune teller and life graph analysis expert. Please provide detailed analysis of the user's life journey and fortune trends based on their birth chart information, including both text explanation and chart data. The response must be in JSON format with 'text' field containing detailed analysis text and 'chartData' field containing chart data.",
      ja: "あなたは専門の占い師・人生グラフ分析専門家です。ユーザーの生年月日情報に基づいて、人生の主要な時期と運勢の流れを分析し、テキスト説明とチャートデータを提供してください。応答は必ずJSON形式で提供し、'text'フィールドには詳細な分析テキストを、'chartData'フィールドにはチャートデータを含める必要があります。",
      zh: "您是一位专业的算命师和人生图表分析专家。请根据用户的生辰八字信息分析人生的关键时期和运势走向，提供文本说明和图表数据。响应必须以JSON格式提供，'text'字段包含详细的分析文本，'chartData'字段包含图表数据。",
      vi: "Bạn là một nhà chiêm tinh và chuyên gia phân tích biểu đồ cuộc sống chuyên nghiệp. Vui lòng cung cấp phân tích chi tiết về hành trình cuộc sống và xu hướng vận mệnh của người dùng dựa trên thông tin lá số tử vi, bao gồm cả giải thích văn bản và dữ liệu biểu đồ. Phản hồi phải ở định dạng JSON với trường 'text' chứa văn bản phân tích chi tiết và trường 'chartData' chứa dữ liệu biểu đồ.",
    };

    // 이미지 생성이 포함된 경우 언어별 프롬프트 확장
    if (body.includeImage && body.i18n && body.i18n !== "ko") {
      const imageLanguagePrompts: { [key: string]: string } = {
        en: " Also provide a detailed image generation prompt for a mascot or avatar that reflects the user's birth chart characteristics. Include this in the 'imagePrompt' field.",
        ja: " また、ユーザーの生年月日特性を反映したマスコットやアバターの詳細な画像生成プロンプトも提供してください。これを'imagePrompt'フィールドに含めてください。",
        zh: " 同时提供反映用户生辰八字特征的吉祥物或头像的详细图像生成提示。将此包含在'imagePrompt'字段中。",
        vi: " Đồng thời cung cấp một prompt tạo hình ảnh chi tiết cho linh vật hoặc avatar phản ánh đặc điểm lá số tử vi của người dùng. Bao gồm điều này trong trường 'imagePrompt'.",
      };
      systemPrompt += imageLanguagePrompts[body.i18n] || "";
    }
    systemPrompt = languagePrompts[body.i18n] || systemPrompt;
  }

  // 2. 사주 데이터 추가
  contents.push({
    role: "user",
    parts: [
      { text: `사주 데이터: ${JSON.stringify(body.sajuData, null, 2)}` },
    ],
  });

  // 3. 시스템 프롬프트와 분석 요청 추가
  const analysisRequest = `${systemPrompt}\n\n사용자의 사주 정보를 바탕으로 인생 그래프를 분석해주세요.`;
  contents.push({
    role: "user",
    parts: [{ text: analysisRequest }],
  });

  // 4. 최종 API 요청 객체 생성
  const payload: any = {
    model: "gemini-2.5-pro", // 고정 모델 사용
    contents,
    temperature: 0.3,
    topP: 0.8,
    topK: 20,
    maxOutputTokens: 6000, // 인생 그래프는 더 긴 응답 필요
    responseMimeType: "application/json", // JSON 응답 강제
    safetySettings: [
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
    ],
  };

  return payload;
}

/**
 * 인생 그래프 분석 결과를 DB에 저장하는 함수
 */
async function saveLifeGraphAnalysis(
  db: any,
  userId: number,
  analysisType: string,
  type: string,
  title: string,
  sajuData: any,
  aiResponse: string,
  chartData: ChartData,
  imageData: ImageData | null,
  modelUsed: string,
  pointsSpent: number,
  i18n?: string,
  timezone?: string,
  analysisStartedAt?: Date,
  analysisCompletedAt?: Date
) {
  try {
    // sajuData에서 생년월일 정보만 추출
    let birthData = null;
    if (sajuData) {
      if (sajuData.정보 && sajuData.정보.생년월일) {
        birthData = sajuData.정보.생년월일;
      }
    }

    // 시간은 UTC로 저장하고 프론트엔드에서 처리
    const now = new Date();
    const createdAt = now.toISOString();
    const updatedAt = now.toISOString();
    const startedAt = analysisStartedAt
      ? analysisStartedAt.toISOString()
      : null;
    const completedAt = analysisCompletedAt
      ? analysisCompletedAt.toISOString()
      : null;

    const result = await db
      .prepare(
        `
      INSERT INTO life_graph_analyses (
        user_id, analysis_type, type, title, sajuData, ai_response, chart_data, image_data, model_used, points_spent, 
        created_at, updated_at, i18n, timezone, analysis_started_at, analysis_completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .bind(
        userId,
        analysisType,
        type,
        title,
        JSON.stringify(birthData),
        aiResponse,
        JSON.stringify(chartData),
        imageData ? JSON.stringify(imageData) : null,
        modelUsed,
        pointsSpent,
        createdAt,
        updatedAt,
        i18n || "ko",
        timezone || "Asia/Seoul",
        startedAt,
        completedAt
      )
      .run();

    return {
      success: true,
      analysisId: result.meta.last_row_id,
    };
  } catch (error) {
    console.error("인생 그래프 분석 결과 저장 실패:", error);
    console.error("저장 시도한 데이터:", {
      userId,
      analysisType,
      title,
      aiResponseLength: aiResponse.length,
      chartDataKeys: Object.keys(chartData),
      modelUsed,
      pointsSpent,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * 재시도 로직 함수
 */
async function retryGeminiCall(ai: GoogleGenAI, payload: any, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      // 3분(180초) 타임아웃으로 설정
      const timeoutId = setTimeout(() => controller.abort(), 180000);

      const result = await ai.models.generateContent(payload);

      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      console.error(
        `Gemini API 호출 실패 (시도 ${attempt}/${maxRetries}):`,
        error
      );

      if (attempt === maxRetries) {
        throw error;
      }

      // 지수 백오프로 재시도
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, attempt) * 1000)
      );
    }
  }
}

/**
 * 포인트 환불 공통 함수
 */
async function handleRefund(
  db: any,
  userId: number,
  pointsCost: number,
  reason: string,
  reference: string
) {
  try {
    await refundPoints(db, userId, pointsCost, reason, reference);
    console.log(`${reason} 완료`);
  } catch (refundError) {
    console.error("포인트 환불 실패:", refundError);
  }
}

/**
 * 제목 생성 공통 함수
 */
function generateTitle(
  analysisType: string,
  sajuData: any,
  graphType?: string,
  includeImage?: boolean,
  imageStyle?: string
): string {
  let title = `[${analysisType}]`;

  if (graphType) {
    title = `[${getGraphTypeTitle(graphType)}]`;
  }

  if (includeImage && imageStyle) {
    title += ` + ${getImageStyleTitle(imageStyle)}`;
  }

  if (sajuData) {
    if (
      sajuData.정보 &&
      sajuData.정보.생년월일 &&
      sajuData.정보.생년월일.이름
    ) {
      title += ` ${sajuData.정보.생년월일.이름}님`;
    }
  }

  return title;
}

/**
 * AI 응답에서 JSON 파싱 및 차트 데이터 추출
 */
function parseAIResponse(aiResponse: string): {
  text: string;
  chartData: ChartData;
  imagePrompt?: string;
} {
  try {
    // JSON 응답 파싱 시도
    const parsed = JSON.parse(aiResponse);

    if (parsed.text && parsed.chartData) {
      return {
        text: parsed.text,
        chartData: parsed.chartData as ChartData,
        imagePrompt: parsed.imagePrompt,
      };
    }

    // JSON이 아니거나 필수 필드가 없는 경우
    throw new Error("Invalid response format");
  } catch (error) {
    // JSON 파싱 실패 시 기본 차트 데이터 생성
    console.warn("AI 응답 JSON 파싱 실패, 기본 차트 데이터 생성:", error);

    const defaultChartData: ChartData = {
      labels: ["과거", "현재", "미래"],
      datasets: [
        {
          label: "운세 지수",
          data: [60, 75, 85],
          backgroundColor: "rgba(54, 162, 235, 0.2)",
          borderColor: "rgba(54, 162, 235, 1)",
          borderWidth: 2,
          tension: 0.4,
        },
      ],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
          },
        },
      },
    };

    return {
      text: aiResponse,
      chartData: defaultChartData,
      imagePrompt: undefined,
    };
  }
}

/**
 * 스트리밍 응답 처리 공통 함수
 */
function createStreamingResponse(
  streamingResp: any,
  config: AnalysisConfig,
  analysisStartedAt: Date,
  context: Context
): ReadableStream {
  let fullResponse = "";
  let analysisId: number | null = null;

  return new ReadableStream({
    async start(controller) {
      let isConnectionClosed = false;
      let hasSaved = false;

      // 연결 끊김 감지 함수
      const checkConnection = () => {
        try {
          if (controller.desiredSize === null) {
            isConnectionClosed = true;
            console.log("클라이언트 연결이 끊어졌습니다.");
          }
        } catch (error) {
          isConnectionClosed = true;
          console.log("연결 상태 확인 중 에러:", error);
        }
      };

      try {
        for await (const chunk of streamingResp) {
          checkConnection();
          if (isConnectionClosed) {
            console.log("연결이 끊어져서 스트리밍을 중단합니다.");
            break;
          }

          if (chunk.text) {
            fullResponse += chunk.text;
            const data = `data: ${JSON.stringify({ text: chunk.text })}\n\n`;
            controller.enqueue(new TextEncoder().encode(data));
          } else {
            const data = `data: ${JSON.stringify(chunk)}\n\n`;
            controller.enqueue(new TextEncoder().encode(data));
          }

          // 연결 유지를 위한 heartbeat
          if (Math.random() < 0.3) {
            const heartbeat = `data: ${JSON.stringify({
              type: "heartbeat",
              timestamp: Date.now(),
            })}\n\n`;
            controller.enqueue(new TextEncoder().encode(heartbeat));
          }
        }

        // 스트리밍 완료 후 저장 로직
        if (!isConnectionClosed && fullResponse.length > 0) {
          const analysisCompletedAt = new Date();
          const title = generateTitle(
            config.analysisType,
            config.body.sajuData,
            config.body.graphType,
            config.body.includeImage,
            config.body.imageStyle
          );

          // AI 응답 파싱
          const { text, chartData, imagePrompt } = parseAIResponse(fullResponse);

          // 이미지 생성 (필요한 경우)
          let imageData: ImageData | null = null;
          if (config.body.includeImage && imagePrompt) {
            try {
              imageData = await generateImage(
                imagePrompt,
                config.body.imageStyle || "mascot",
                config.body.sajuData,
                context.env.GOOGLE_GEMINI_API_KEY
              );
            } catch (imageError) {
              console.error("이미지 생성 중 오류:", imageError);
              // 이미지 생성 실패해도 분석은 계속 진행
            }
          }

          try {
            const saveResult = await saveLifeGraphAnalysis(
              config.db,
              config.user.id,
              config.analysisType,
              config.type,
              title,
              config.body.sajuData || {},
              text,
              chartData,
              imageData,
              config.model,
              config.pointsCost,
              config.i18n,
              config.timezone,
              analysisStartedAt,
              analysisCompletedAt
            );

            if (saveResult.success) {
              analysisId = saveResult.analysisId;
              hasSaved = true;

              if (analysisId) {
                await updatePointTransactionAnalysisId(
                  config.db,
                  config.user.id,
                  config.reference,
                  analysisId
                );
              }
            } else {
              console.error("스트리밍 응답 저장 실패:", saveResult.error);
            }
          } catch (saveError) {
            console.error("저장 중 에러:", saveError);
          }
        } else if (isConnectionClosed) {
          console.log("연결이 끊어져서 저장을 건너뜁니다.");

          await handleRefund(
            config.db,
            config.user.id,
            config.pointsCost,
            "연결 끊김으로 인한 포인트 환불",
            config.reference
          );
        }

        if (!isConnectionClosed) {
          controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        }
        controller.close();
      } catch (error) {
        console.error("스트리밍 오류:", error);

        if (!hasSaved) {
          await handleRefund(
            config.db,
            config.user.id,
            config.pointsCost,
            "스트리밍 오류로 인한 포인트 환불",
            config.reference
          );
        }

        if (!isConnectionClosed) {
          const errorData = `data: ${JSON.stringify({
            type: "error",
            message: error instanceof Error ? error.message : "Unknown error",
          })}\n\n`;
          controller.enqueue(new TextEncoder().encode(errorData));
        }
        controller.close();
      }
    },

    cancel() {
      console.log("클라이언트가 연결을 취소했습니다.");
      handleRefund(
        config.db,
        config.user.id,
        config.pointsCost,
        "클라이언트 연결 취소로 인한 포인트 환불",
        config.reference
      ).catch((error) => {
        console.error("연결 취소 시 포인트 환불 실패:", error);
      });
    },
  });
}

/**
 * 일반 응답 처리 공통 함수
 */
async function handleNonStreamingResponse(
  ai: GoogleGenAI,
  geminiPayload: any,
  config: AnalysisConfig,
  analysisStartedAt: Date,
  context: Context
) {
  const result = await retryGeminiCall(ai, geminiPayload);

  if (!result) {
    throw new Error("AI 응답을 받을 수 없습니다.");
  }

  const aiResponse = result.text || "죄송합니다. 답변을 생성할 수 없습니다.";
  const analysisCompletedAt = new Date();
  const title = generateTitle(
    config.analysisType,
    config.body.sajuData,
    config.body.graphType,
    config.body.includeImage,
    config.body.imageStyle
  );

  // AI 응답 파싱
  const { text, chartData, imagePrompt } = parseAIResponse(aiResponse);

  // 이미지 생성 (필요한 경우)
  let imageData: ImageData | null = null;
  if (config.body.includeImage && imagePrompt) {
    try {
      imageData = await generateImage(
        imagePrompt,
        config.body.imageStyle || "mascot",
        config.body.sajuData,
        context.env.GOOGLE_GEMINI_API_KEY
      );
    } catch (imageError) {
      console.error("이미지 생성 중 오류:", imageError);
      // 이미지 생성 실패해도 분석은 계속 진행
    }
  }

  const response: any = {
    answer: text,
    chartData: chartData,
    ...(imageData && { imageData: imageData }),
    metadata: {
      model_used: config.model,
      timestamp: new Date().toISOString(),
      stream_enabled: false,
      response_type: "life_graph_analysis",
      service_type: "paid",
      graph_type: config.body.graphType || "life_cycle",
      ...(config.body.includeImage && { includes_image: true }),
      ...(config.body.imageStyle && { image_style: config.body.imageStyle }),
    },
    points: {
      deducted: config.pointsCost,
      remaining: null as number | null, // pointValidation에서 가져와야 함
      message: null as string | null,
    },
  };

  const saveResult = await saveLifeGraphAnalysis(
    config.db,
    config.user.id,
    config.analysisType,
    config.type,
    title,
    config.body.sajuData || {},
    text,
    chartData,
    imageData,
    config.model,
    config.pointsCost,
    config.i18n,
    config.timezone,
    analysisStartedAt,
    analysisCompletedAt
  );

  if (saveResult.success) {
    response.analysis_id = saveResult.analysisId;

    if (saveResult.analysisId) {
      await updatePointTransactionAnalysisId(
        config.db,
        config.user.id,
        config.reference,
        saveResult.analysisId
      );
    }
  } else {
    console.error("분석 결과 저장 실패:", saveResult.error);
  }

  return response;
}

/**
 * 포인트 검증 공통 함수
 */
async function validatePoints(
  db: any,
  userId: number,
  pointsCost: number,
  serviceName: string
) {
  const reference = `${serviceName}_${Date.now()}`;
  const pointValidation = await usePoints(
    db,
    userId,
    pointsCost,
    `${serviceName} 서비스 이용`,
    reference,
    undefined
  );

  return { pointValidation, reference };
}

/**
 * 그래프 유형에 따른 제목 생성 헬퍼 함수
 */
function getGraphTypeTitle(graphType: string): string {
  switch (graphType) {
    case "life_cycle":
      return "인생주기";
    case "fortune_trend":
      return "운세추이";
    case "relationship_flow":
      return "관계흐름";
    case "career_path":
      return "직업경로";
    case "health_trend":
      return "건강추이";
    default:
      return "인생그래프";
  }
}

/**
 * 이미지 스타일에 따른 제목 생성 헬퍼 함수
 */
function getImageStyleTitle(imageStyle: string): string {
  switch (imageStyle) {
    case "mascot":
      return "마스코트";
    case "avatar":
      return "아바타";
    case "symbolic":
      return "상징적";
    case "artistic":
      return "예술적";
    case "cute":
      return "귀여운";
    case "mystical":
      return "신비로운";
    default:
      return "이미지";
  }
}

/**
 * 이미지 생성 함수 (Gemini 이미지 생성 API 사용)
 */
async function generateImage(
  prompt: string,
  style: string,
  sajuData: any,
  apiKey: string
): Promise<ImageData | null> {
  try {
    const ai = new GoogleGenAI({ apiKey });
    
    // 이미지 생성 요청
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-preview-image-generation",
      contents: prompt,
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
      },
    });

    let imageUrl = null;
    let generatedText = "";

    // 응답에서 텍스트와 이미지 추출
    if (response.candidates && response.candidates[0] && response.candidates[0].content && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          generatedText = part.text;
        } else if (part.inlineData && part.inlineData.data) {
          // 이미지 데이터를 base64로 인코딩하여 URL 생성
          const imageData = part.inlineData.data;
          imageUrl = `data:image/png;base64,${imageData}`;
        }
      }
    }

    if (!imageUrl) {
      throw new Error("이미지 생성에 실패했습니다.");
    }

    const imageData: ImageData = {
      url: imageUrl,
      prompt: prompt,
      style: style,
      generatedAt: new Date().toISOString(),
      metadata: {
        model: "gemini-2.0-flash-preview-image-generation",
        size: "1024x1024",
        quality: "standard",
      },
    };

    return imageData;
  } catch (error) {
    console.error("이미지 생성 실패:", error);
    return null;
  }
}

/**
 * Gemini AI를 활용한 인생 그래프 분석 API
 */
export async function LifeGraphAnalysis(c: Context): Promise<Response> {
  const user = await getUserFromToken(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  // 포인트 검증
  const { pointValidation, reference } = await validatePoints(
    c.env.DB,
    user.id,
    POINT_COSTS.LIFE_GRAPH_ANALYSIS,
    "인생 그래프 분석"
  );

  if (!pointValidation.success) {
    return c.json(
      {
        error: "포인트가 부족합니다.",
        details: pointValidation.message,
        data: pointValidation.data,
      },
      402
    );
  }

  try {
    const body: LifeGraphAnalysisRequest = await c.req.json();
    const analysisStartedAt = new Date();

    // 포인트 비용 결정
    const pointsCost = body.includeImage 
      ? POINT_COSTS.LIFE_GRAPH_WITH_IMAGE 
      : POINT_COSTS.LIFE_GRAPH_ANALYSIS;

    const config: AnalysisConfig = {
      model: "gemini-2.5-pro", // 고정 모델 사용
      analysisType: body.analysisType || "life_graph",
      type: "life_graph",
      pointsCost: pointsCost,
      reference,
      i18n: body.i18n || "ko",
      timezone: body.timezone || "Asia/Seoul",
      body,
      user,
      db: c.env.DB,
    };

    // Gemini API 요청 페이로드 생성
    const geminiPayload = buildGeminiPayload(body);

    // Google GenAI SDK 초기화
    const ai = new GoogleGenAI({
      apiKey: c.env.GOOGLE_GEMINI_API_KEY,
    });

    if (body.stream) {
      const streamingResp = await ai.models.generateContentStream(
        geminiPayload
      );

      if (!streamingResp) {
        throw new Error("스트리밍 응답을 받을 수 없습니다.");
      }

      const stream = createStreamingResponse(
        streamingResp,
        config,
        analysisStartedAt,
        c
      );

      const headers = new Headers();
      headers.set("Content-Type", "text/event-stream; charset=utf-8");
      headers.set("Cache-Control", "no-cache");
      headers.set("Connection", "keep-alive");
      headers.set("X-AI-Model", config.model);
      headers.set("X-Points-Deducted", config.pointsCost.toString());
      headers.set(
        "X-Points-Remaining",
        pointValidation.remainingPoints?.toString() || "0"
      );
      headers.set("X-Timeout-Seconds", "180");
      headers.set("X-Connection-Keep-Alive", "true");
      headers.set("X-Service-Type", "paid");
      headers.set("X-Graph-Type", body.graphType || "life_cycle");
      if (body.includeImage) {
        headers.set("X-Includes-Image", "true");
        headers.set("X-Image-Style", body.imageStyle || "mascot");
      }
      if (pointValidation.data) {
        headers.set("X-Points-Data", JSON.stringify(pointValidation.data));
      }

      return new Response(stream, {
        status: 200,
        headers: headers,
      });
    } else {
      const response = await handleNonStreamingResponse(
        ai,
        geminiPayload,
        config,
        analysisStartedAt,
        c
      );
      response.points.remaining = pointValidation.remainingPoints || null;
      response.points.message = pointValidation.message || null;
      response.data = pointValidation.data;

      return c.json(response, 200);
    }
  } catch (error) {
    console.error("Gemini 인생 그래프 분석 API 오류:", error);

    if (
      pointValidation.success &&
      pointValidation.data &&
      !pointValidation.data.isAdmin
    ) {
      await handleRefund(
        c.env.DB,
        user.id,
        POINT_COSTS.LIFE_GRAPH_ANALYSIS,
        "인생 그래프 분석 서비스 실패로 인한 포인트 환불",
        `life_graph_analysis_refund_${Date.now()}`
      );
    }

    return c.json(
      {
        error:
          "An error occurred while processing your life graph analysis request.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * 사용자의 인생 그래프 분석 결과 목록을 조회하는 API
 */
export async function getLifeGraphAnalysisList(c: Context): Promise<Response> {
  const user = await getUserFromToken(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  try {
    const { searchParams } = new URL(c.req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const analysisType = searchParams.get("type"); // 'life_graph' 또는 null (전체)
    const isFavorite = searchParams.get("favorite"); // 'true', 'false', 또는 null (전체)

    const offset = (page - 1) * limit;

    // 기본 쿼리
    let query = `
      SELECT 
        id, analysis_type, type, title, user_prompt, ai_response, chart_data, image_data,
        model_used, points_spent, is_favorite, created_at, analysis_started_at, analysis_completed_at
      FROM life_graph_analyses 
      WHERE user_id = ?
    `;
    const params: any[] = [user.id];

    // 필터 조건 추가
    if (analysisType) {
      query += ` AND type = ?`;
      params.push(analysisType);
    }

    if (isFavorite === "true") {
      query += ` AND is_favorite = 1`;
    } else if (isFavorite === "false") {
      query += ` AND is_favorite = 0`;
    }

    // 정렬 및 페이징 (즐겨찾기 우선, 그 다음 최신순)
    query += ` ORDER BY is_favorite DESC, created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    // 총 개수 조회
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM life_graph_analyses 
      WHERE user_id = ?
    `;
    const countParams: any[] = [user.id];

    if (analysisType) {
      countQuery += ` AND type = ?`;
      countParams.push(analysisType);
    }

    if (isFavorite === "true") {
      countQuery += ` AND is_favorite = 1`;
    } else if (isFavorite === "false") {
      countQuery += ` AND is_favorite = 0`;
    }

    const [analyses, totalCount] = await Promise.all([
      c.env.DB.prepare(query)
        .bind(...params)
        .all(),
      c.env.DB.prepare(countQuery)
        .bind(...countParams)
        .first(),
    ]);

    const total = totalCount?.total || 0;
    const totalPages = Math.ceil(total / limit);

    // SQLite boolean 값을 JavaScript boolean으로 변환하고 chart_data, image_data 파싱
    const processedAnalyses = (analyses.results || []).map((analysis: any) => {
      let chartData = null;
      let imageData = null;
      try {
        chartData = JSON.parse(analysis.chart_data);
        if (analysis.image_data) {
          imageData = JSON.parse(analysis.image_data);
        }
      } catch (e) {
        console.error("데이터 파싱 오류:", e);
      }

      return {
        ...analysis,
        is_favorite: Boolean(analysis.is_favorite),
        chart_data: chartData,
        image_data: imageData,
      };
    });

    return c.json(
      {
        analyses: processedAnalyses,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      200
    );
  } catch (error) {
    console.error("인생 그래프 분석 목록 조회 오류:", error);
    return c.json(
      {
        error: "인생 그래프 분석 목록을 조회하는 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * 특정 인생 그래프 분석 결과를 조회하는 API
 */
export async function getLifeGraphAnalysisDetail(
  c: Context
): Promise<Response> {
  const user = await getUserFromToken(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  try {
    const analysisId = c.req.param("id");
    if (!analysisId) {
      return c.json({ error: "분석 ID가 필요합니다." }, 400);
    }

    const analysis = await c.env.DB.prepare(
      `
      SELECT 
        id, analysis_type, type, title, sajuData, user_prompt, 
        system_prompt, ai_response, chart_data, image_data, model_used, points_spent, 
        is_favorite, i18n, timezone, analysis_started_at, analysis_completed_at
      FROM life_graph_analyses 
      WHERE id = ? AND user_id = ?
    `
    )
      .bind(analysisId, user.id)
      .first();

    if (!analysis) {
      return c.json({ error: "분석 결과를 찾을 수 없습니다." }, 404);
    }

    // 사주 데이터, 차트 데이터, 이미지 데이터를 JSON으로 파싱
    let sajuData = null;
    let chartData = null;
    let imageData = null;
    try {
      sajuData = JSON.parse(analysis.sajuData);
      chartData = JSON.parse(analysis.chart_data);
      if (analysis.image_data) {
        imageData = JSON.parse(analysis.image_data);
      }
    } catch (e) {
      console.error("데이터 파싱 오류:", e);
    }

    return c.json(
      {
        id: analysis.id,
        analysis_type: analysis.analysis_type,
        type: analysis.type,
        title: analysis.title,
        user_prompt: analysis.user_prompt,
        system_prompt: analysis.system_prompt,
        ai_response: analysis.ai_response,
        chart_data: chartData,
        image_data: imageData,
        model_used: analysis.model_used,
        points_spent: analysis.points_spent,
        is_favorite: Boolean(analysis.is_favorite),
        analysis_started_at: analysis.analysis_started_at,
        analysis_completed_at: analysis.analysis_completed_at,
        saju_data: sajuData,
        i18n: analysis.i18n,
        timezone: analysis.timezone,
      },
      200
    );
  } catch (error) {
    console.error("인생 그래프 분석 상세 조회 오류:", error);
    return c.json(
      {
        error: "인생 그래프 분석 결과를 조회하는 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * 인생 그래프 분석 결과의 즐겨찾기 상태를 토글하는 API
 */
export async function toggleLifeGraphAnalysisFavorite(
  c: Context
): Promise<Response> {
  const user = await getUserFromToken(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  try {
    const analysisId = c.req.param("id");
    if (!analysisId) {
      return c.json({ error: "분석 ID가 필요합니다." }, 400);
    }

    // 현재 즐겨찾기 상태 확인
    const current = await c.env.DB.prepare(
      `
      SELECT is_favorite FROM life_graph_analyses 
      WHERE id = ? AND user_id = ?
    `
    )
      .bind(analysisId, user.id)
      .first();

    if (!current) {
      return c.json({ error: "분석 결과를 찾을 수 없습니다." }, 404);
    }

    // SQLite boolean 값을 JavaScript boolean으로 변환
    const currentFavoriteState = Boolean(current.is_favorite);

    // 즐겨찾기 상태 토글
    const newFavoriteState = !currentFavoriteState;

    await c.env.DB.prepare(
      `
      UPDATE life_graph_analyses 
      SET is_favorite = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `
    )
      .bind(newFavoriteState ? 1 : 0, analysisId, user.id)
      .run();

    return c.json(
      {
        success: true,
        is_favorite: newFavoriteState,
        message: newFavoriteState
          ? "즐겨찾기에 추가되었습니다."
          : "즐겨찾기에서 제거되었습니다.",
      },
      200
    );
  } catch (error) {
    console.error("즐겨찾기 토글 오류:", error);
    return c.json(
      {
        error: "즐겨찾기 상태를 변경하는 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * 인생 그래프 분석 결과의 제목을 수정하는 API
 */
export async function updateLifeGraphAnalysisTitle(
  c: Context
): Promise<Response> {
  const user = await getUserFromToken(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  try {
    const analysisId = c.req.param("id");
    if (!analysisId) {
      return c.json({ error: "분석 ID가 필요합니다." }, 400);
    }

    const body = await c.req.json();
    const { title } = body;

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return c.json({ error: "유효한 제목이 필요합니다." }, 400);
    }

    if (title.length > 100) {
      return c.json({ error: "제목은 100자를 초과할 수 없습니다." }, 400);
    }

    const result = await c.env.DB.prepare(
      `
      UPDATE life_graph_analyses 
      SET title = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `
    )
      .bind(title.trim(), analysisId, user.id)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ error: "분석 결과를 찾을 수 없습니다." }, 404);
    }

    return c.json(
      {
        success: true,
        title: title.trim(),
        message: "제목이 수정되었습니다.",
      },
      200
    );
  } catch (error) {
    console.error("제목 수정 오류:", error);
    return c.json(
      {
        error: "제목을 수정하는 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

/**
 * 인생 그래프 분석 결과를 삭제하는 API
 */
export async function deleteLifeGraphAnalysis(c: Context): Promise<Response> {
  const user = await getUserFromToken(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  try {
    const analysisId = c.req.param("id");
    if (!analysisId) {
      return c.json({ error: "분석 ID가 필요합니다." }, 400);
    }

    const result = await c.env.DB.prepare(
      `
      DELETE FROM life_graph_analyses 
      WHERE id = ? AND user_id = ?
    `
    )
      .bind(analysisId, user.id)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ error: "분석 결과를 찾을 수 없습니다." }, 404);
    }

    return c.json(
      {
        success: true,
        message: "분석 결과가 삭제되었습니다.",
      },
      200
    );
  } catch (error) {
    console.error("분석 결과 삭제 오류:", error);
    return c.json(
      {
        error: "분석 결과를 삭제하는 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}
