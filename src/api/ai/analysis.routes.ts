import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { MiddlewareHandler } from "hono";
import {
  PaginationResponseSchema
} from "../../common/schemas";
import {
  deleteSajuAnalysis,
  getSajuAnalysisDetail,
  getSajuAnalysisList,
  toggleSajuAnalysisFavorite,
  updateSajuAnalysisTitle
} from "./analysisManageApi";
import {
  AnalysisSaju,
  GetAnalysisSajuStatus,
} from "./analysisSajuApi";

export function createAnalysisRouter(authMiddleware: MiddlewareHandler): OpenAPIHono {
  const app = new OpenAPIHono();
  app.use(authMiddleware);

  // --- 스키마 정의 ---

  // 통합 사주 분석 요청 스키마 (안전한 프롬프트 생성 구조)
  const AnalysisSajuRequestSchema = z
    .object({
      // 사주 데이터 (필수)
      sajuData: z.any().openapi({
        description: "사주 데이터 (필수)",
        example: {
          name: "홍길동",
          birthDate: "1990-01-01",
          birthTime: "12:00",
          // 사주 계산 결과 데이터
          사주: {
            년주: { 천간: "庚", 지지: "午" },
            월주: { 천간: "辛", 지지: "未" },
            일주: { 천간: "壬", 지지: "子" },
            시주: { 천간: "癸", 지지: "丑" }
          },
          // 궁합 분석의 경우
          person1: {
            name: "김철수",
            birthDate: "1990-01-01",
            birthTime: "12:00",
            gender: "male",
            사주: { /* 사주 데이터 */ }
          },
          person2: {
            name: "이영희",
            birthDate: "1992-05-15", 
            birthTime: "14:30",
            gender: "female",
            사주: { /* 사주 데이터 */ }
          }
        },
      }),
      
      // 분석 설정
      analysisType: z.string().optional().openapi({
        description: "분석 유형",
        example: "종합운세",
      }),
      type: z.enum(["individual", "compatibility", "yearly_fortune"]).optional().openapi({
        description: "분석 타입 (individual: 일반 분석, compatibility: 궁합 분석, yearly_fortune: 연간운세)",
        example: "individual",
      }),
      
      // 프롬프트 생성 파라미터
      해설유형: z.string().optional().openapi({
        description: "해설 유형 (대운, 연애, 직업, 사업 등)",
        example: "대운",
      }),
      궁합유형: z.string().optional().openapi({
        description: "궁합 유형 (연인궁합, 부부궁합, 친구궁합 등)",
        example: "연인궁합",
      }),
      사용자질문: z.string().optional().openapi({
        description: "사용자 추가 질문",
        example: "특별히 궁금한 점이 있나요?",
      }),
      톤옵션: z.enum(["현실적", "약간긍정", "약간부정"]).optional().openapi({
        description: "분석 톤 옵션",
        example: "현실적",
      }),
      타겟년도: z.number().optional().openapi({
        description: "타겟 년도 (연간운세용)",
        example: 2024,
      }),
      이해도레벨: z.enum(["초보", "중수", "전문가"]).optional().openapi({
        description: "사용자 이해도 레벨",
        example: "중수",
      }),
      선택된분석요소: z.array(z.enum(["십성", "신살", "십이신살"])).optional().openapi({
        description: "선택된 분석 요소들",
        example: ["십성", "신살"],
      }),
      
      // 기타 설정
      i18n: z.string().optional().openapi({
        description: "언어 설정",
        example: "ko",
      }),
      timezone: z.string().optional().openapi({
        description: "시간대 설정",
        example: "Asia/Seoul",
      }),
      stream: z.boolean().optional().openapi({
        description: "스트리밍 응답 여부 (true: 동기 스트리밍, false: 비동기)",
        example: false,
      }),
      conversationHistory: z.array(z.object({
        role: z.enum(["user", "model", "function", "tool"]),
        parts: z.array(z.object({
          text: z.string().optional(),
          inlineData: z.object({
            mimeType: z.string(),
            data: z.string()
          }).optional(),
          fileData: z.object({
            mimeType: z.string(),
            fileUri: z.string()
          }).optional(),
          functionCall: z.object({
            name: z.string(),
            args: z.record(z.string(), z.any())
          }).optional(),
          functionResponse: z.object({
            name: z.string(),
            response: z.record(z.string(), z.any())
          }).optional()
        }))
      })).optional().openapi({
        description: "대화 히스토리",
      }),
    })
    .openapi({ type: "object" });

  // 통합 사주 분석 응답 스키마
  const AnalysisSajuResponseSchema = z
    .object({
      success: z.boolean(),
      jobId: z.string(),
      message: z.string(),
      status: z.string(),
      points: z.object({
        deducted: z.number(),
        remaining: z.number().nullable(),
        message: z.string().nullable(),
      }),
      data: z.any(),
    })
    .openapi({ type: "object" });

  // 작업 상태 조회 응답 스키마
  const AnalysisSajuStatusResponseSchema = z
    .object({
      success: z.boolean(),
      jobId: z.string(),
      status: z.enum(["pending", "processing", "completed", "failed"]),
      createdAt: z.string().optional(),
      result: z.any().optional(),
      error: z.string().optional(),
    })
    .openapi({ type: "object" });

  // --- 라우트 정의 ---

  const AnalysisSajuRoute = createRoute({
    method: "post",
    path: "/analysis",
    summary: "통합 사주 분석",
    description: "서버에서 안전하게 프롬프트를 생성하는 통합 사주 분석 API입니다. type 파라미터로 분석 유형을 구분합니다. stream=true로 설정하면 동기 스트리밍 응답을 받을 수 있습니다.",
    tags: ["AI - 사주 분석"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": { schema: AnalysisSajuRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: "분석 작업 등록 성공 또는 스트리밍 응답",
        content: {
          "application/json": {
            schema: AnalysisSajuResponseSchema,
          },
          "text/event-stream": {
            schema: z.string().openapi({
              description: "스트리밍 응답 (stream=true인 경우)",
            }),
          },
        },
      },
      400: { 
        description: "잘못된 요청 (sajuData 누락, 궁합 분석 시 person1/person2 누락 등)" 
      },
      401: { description: "인증 실패" },
      402: { description: "포인트 부족" },
      500: { description: "서버 오류" },
    },
  });

  const AnalysisSajuStatusRoute = createRoute({
    method: "get",
    path: "/analysis/status",
    summary: "사주 분석 작업 상태 조회",
    description: "사주 분석 작업의 진행 상황을 조회합니다.",
    tags: ["AI - 사주 분석"],
    security: [{ BearerAuth: [] }],
    request: {
      query: z.object({
        jobId: z.string().openapi({
          description: "작업 ID",
          example: "job_1703123456789_abc123def",
        }),
      }),
    },
    responses: {
      200: {
        description: "작업 상태 조회 성공",
        content: {
          "application/json": {
            schema: AnalysisSajuStatusResponseSchema,
          },
        },
      },
      400: { description: "jobId 파라미터 누락" },
      401: { description: "인증 실패" },
      404: { description: "작업을 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  // 사주 분석 결과 관련 라우트들
  const SajuAnalysisListRoute = createRoute({
    method: "get",
    path: "/saju-analyses",
    summary: "사주 분석 결과 목록 조회",
    description: "사용자의 사주 분석 결과 목록을 페이지네이션과 필터링과 함께 조회합니다.",
    tags: ["AI - 사주 분석 결과"],
    security: [{ BearerAuth: [] }],
    request: {
      query: z.object({
        page: z.coerce.number().int().min(1).default(1).optional(),
        limit: z.coerce.number().int().min(1).max(50).default(10).optional(),
        type: z.string().optional(),
        favorite: z.enum(["true", "false"]).optional(),
      }),
    },
    responses: {
      200: {
        description: "분석 결과 목록 조회 성공",
        content: {
          "application/json": {
            schema: z.object({
              analyses: z.array(z.object({
                id: z.number().int(),
                analysis_type: z.string(),
                title: z.string(),
                user_prompt: z.string(),
                ai_response: z.string(),
                model_used: z.string(),
                points_spent: z.number().int(),
                is_favorite: z.boolean(),
                created_at: z.string(),
                updated_at: z.string(),
                i18n: z.string().optional(),
                timezone: z.string().optional(),
              })),
              pagination: PaginationResponseSchema,
            }),
          },
        },
      },
      401: { description: "인증 실패" },
      500: { description: "서버 오류" },
    },
  });

  const SajuAnalysisDetailRoute = createRoute({
    method: "get",
    path: "/saju-analyses/{id}",
    summary: "사주 분석 결과 상세 조회",
    description: "특정 사주 분석 결과의 상세 정보를 조회합니다.",
    tags: ["AI - 사주 분석 결과"],
    security: [{ BearerAuth: [] }],
    request: {
      params: z.object({
        id: z.coerce.number().int().positive(),
      }),
    },
    responses: {
      200: {
        description: "분석 결과 상세 조회 성공",
        content: {
          "application/json": {
            schema: z.object({
              id: z.number().int(),
              analysis_type: z.string(),
              title: z.string(),
              saju_data: z.any(),
              user_prompt: z.string(),
              system_prompt: z.string().nullable(),
              ai_response: z.string(),
              model_used: z.string(),
              points_spent: z.number().int(),
              is_favorite: z.boolean(),
              created_at: z.string(),
              updated_at: z.string(),
              i18n: z.string().optional(),
              timezone: z.string().optional(),
            }),
          },
        },
      },
      401: { description: "인증 실패" },
      404: { description: "분석 결과를 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  const SajuAnalysisFavoriteRoute = createRoute({
    method: "patch",
    path: "/saju-analyses/{id}/favorite",
    summary: "사주 분석 결과 즐겨찾기 토글",
    description: "사주 분석 결과의 즐겨찾기 상태를 토글합니다.",
    tags: ["AI - 사주 분석 결과"],
    security: [{ BearerAuth: [] }],
    request: {
      params: z.object({
        id: z.coerce.number().int().positive(),
      }),
    },
    responses: {
      200: {
        description: "즐겨찾기 토글 성공",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              is_favorite: z.boolean(),
              message: z.string(),
            }),
          },
        },
      },
      401: { description: "인증 실패" },
      404: { description: "분석 결과를 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  const SajuAnalysisTitleRoute = createRoute({
    method: "patch",
    path: "/saju-analyses/{id}/title",
    summary: "사주 분석 결과 제목 수정",
    description: "사주 분석 결과의 제목을 수정합니다.",
    tags: ["AI - 사주 분석 결과"],
    security: [{ BearerAuth: [] }],
    request: {
      params: z.object({
        id: z.coerce.number().int().positive(),
      }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              title: z.string().min(1).max(100),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "제목 수정 성공",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              title: z.string(),
              message: z.string(),
            }),
          },
        },
      },
      400: { description: "잘못된 요청" },
      401: { description: "인증 실패" },
      404: { description: "분석 결과를 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  const SajuAnalysisDeleteRoute = createRoute({
    method: "delete",
    path: "/saju-analyses/{id}",
    summary: "사주 분석 결과 삭제",
    description: "사주 분석 결과를 삭제합니다.",
    tags: ["AI - 사주 분석 결과"],
    security: [{ BearerAuth: [] }],
    request: {
      params: z.object({
        id: z.coerce.number().int().positive(),
      }),
    },
    responses: {
      200: {
        description: "삭제 성공",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              message: z.string(),
            }),
          },
        },
      },
      401: { description: "인증 실패" },
      404: { description: "분석 결과를 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  // --- 라우트 등록 ---
  app.openapi(AnalysisSajuRoute, AnalysisSaju);
  app.openapi(AnalysisSajuStatusRoute, GetAnalysisSajuStatus);
  app.openapi(SajuAnalysisListRoute, getSajuAnalysisList);
  app.openapi(SajuAnalysisDetailRoute, getSajuAnalysisDetail);
  app.openapi(SajuAnalysisFavoriteRoute, toggleSajuAnalysisFavorite);
  app.openapi(SajuAnalysisTitleRoute, updateSajuAnalysisTitle);
  app.openapi(SajuAnalysisDeleteRoute, deleteSajuAnalysis);

  return app;
} 