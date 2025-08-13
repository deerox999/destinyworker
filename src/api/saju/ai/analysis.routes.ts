import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { MiddlewareHandler } from "hono";
import { PaginationResponseSchema } from "../../../common/schemas";
import {
  deleteSajuAnalysis,
  getSajuAnalysisDetail,
  getSajuAnalysisList,
  toggleSajuAnalysisFavorite,
  updateSajuAnalysisTitle,
} from "./analysisManageApi";
import { AnalysisSaju, GetAnalysisSajuStatus } from "./analysisSajuApi";
import { FollowUpAnalysisSaju } from "./followupApi";

export function createAnalysisRouter(
  authMiddleware: MiddlewareHandler
): OpenAPIHono {
  const app = new OpenAPIHono();
  app.use(authMiddleware);

  // --- 라우트 정의 ---
  const AnalysisSajuRoute = createRoute({
    method: "post",
    path: "/analysis",
    summary: "통합 사주 분석",
    description: "통합 사주 분석 API",
    tags: ["AI - 사주 분석"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                // 사주 데이터 (필수)
                sajuData: z.object({}).openapi({
                  description: "사주 데이터 (필수)",
                }),

                // 분석 옵션
                options: z.object({
                  // 분석 설정
                  analysisType: z.string().optional().openapi({
                    description: "분석 유형",
                    example: "종합운세",
                  }),
                  type: z.string().optional().openapi({
                    description: "분석 타입 (예: individual, compatibility)",
                    example: "individual",
                  }),
                  userQuestion: z.string().optional().openapi({
                    description: "사용자 추가 질문",
                    example: "특별히 궁금한 점이 있나요?",
                  }),
                  analysisStyle: z.string().optional().openapi({
                    description: "분석 톤 옵션 (예: 현실적, 약간긍정, 약간부정)",
                    example: "현실적",
                  }),
                  understandingLevel: z.string().optional().openapi({
                    description: "사용자 이해도 레벨 (예: 초보, 중수, 전문가)",
                    example: "중수",
                  }),
                  selectedAnalysisElements: z
                    .array(z.string())
                    .optional()
                    .openapi({
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
                  highQuality: z.boolean().optional().openapi({
                    description: "고품질 분석 여부 (pro 모델 사용 여부). 기본값 false",
                    example: false,
                  }),
                }).optional().openapi({
                  description: "분석 옵션",
                }),
              })
              .openapi({ type: "object" }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "분석 작업 등록 성공",
        content: {
          "application/json": {
            schema: z
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
              .openapi({ type: "object" }),
          },
        },
      },
      400: {
        description:
          "잘못된 요청 (sajuData 누락, 궁합 분석 시 person1/person2 누락 등)",
      },
      401: { description: "인증 실패" },
      402: { description: "포인트 부족" },
      500: { description: "서버 오류" },
    },
  });

  // 재질문 전용 라우트
  const FollowUpSajuRoute = createRoute({
    method: "post",
    path: "/analysis/follow-up",
    summary: "사주 재질문 (기존 보고서 기반)",
    description:
      "이전 분석 보고서를 컨텍스트로 사용하여 후속 질문에만 집중해 답변합니다.",
    tags: ["AI - 사주 분석"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                options: z
                  .object({
                    followUpOfAnalysisId: z
                      .number()
                      .int()
                      .positive(),
                    userQuestion: z.string().min(1),
                  })
                  .openapi({
                    description: "재질문 옵션",
                  }),
              })
              .openapi({ type: "object" }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "재질문 작업 등록 성공 (디버그용 프롬프트 반환 포함)",
        content: {
          "application/json": {
            schema: z
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
                debugPrompts: z.object({
                  model: z.string(),
                  systemPrompt: z.string(),
                  userPrompt: z.string(),
                }),
              })
              .openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 요청 (필수 필드 누락)" },
      401: { description: "인증 실패" },
      402: { description: "포인트 부족" },
      404: { description: "이전 분석 없음" },
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
            schema: z
              .object({
                success: z.boolean(),
                jobId: z.string(),
                status: z.enum([
                  "pending",
                  "processing",
                  "completed",
                  "failed",
                ]),
                createdAt: z.string().optional(),
                result: z.any().optional(),
                error: z.string().optional(),
              })
              .openapi({ type: "object" }),
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
    description:
      "사용자의 사주 분석 결과 목록을 페이지네이션과 필터링과 함께 조회합니다.",
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
              analyses: z.array(
                z.object({
                  id: z.number().int(),
                  analysisType: z.string(),
                  type: z.string(),
                  title: z.string(),
                  aiResponse: z.string(),
                  chartJson: z.any().nullable(),
                  modelUsed: z.string(),
                  pointsSpent: z.number().int(),
                  isFavorite: z.boolean(),
                  createdAt: z.string(),
                  i18n: z.string().optional(),
                  timezone: z.string().optional(),
                  isFollowUp: z.boolean().openapi({ example: false }),
                  optionsJson: z.string().nullable().optional(),
                  options: z.any().nullable().optional(),
                })
              ),
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
              analysisType: z.string(),
              type: z.string(),
              title: z.string(),
              sajuData: z.any().nullable(),
              aiResponse: z.string(),
              chartJson: z.any().nullable(),
              modelUsed: z.string(),
              pointsSpent: z.number().int(),
              isFavorite: z.boolean(),
              i18n: z.string().optional(),
              timezone: z.string().optional(),
              analysisStartedAt: z.string().nullable(),
              analysisCompletedAt: z.string().nullable(),
              usageMetadata: z.any().nullable().optional(),
              isFollowUp: z.boolean().openapi({ example: false }),
              optionsJson: z.string().nullable().optional(),
              options: z.any().nullable().optional(),
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
              isFavorite: z.boolean(),
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
    path: "/saju-analyses",
    summary: "사주 분석 결과 다중 삭제",
    description: "여러 사주 분석 결과를 한 번에 삭제합니다.",
    tags: ["AI - 사주 분석 결과"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                ids: z.array(z.number().int().positive()).openapi({
                  description: "삭제할 분석 결과 ID 배열",
                  example: [1, 2, 3],
                }),
              })
              .openapi({ type: "object" }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "삭제 성공",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              message: z.string(),
              deletedCount: z.number().int().openapi({ example: 3 }),
              failedIds: z
                .array(z.number())
                .optional()
                .openapi({ example: [] }),
            }),
          },
        },
      },
      400: { description: "잘못된 데이터 형식" },
      401: { description: "인증 실패" },
      500: { description: "서버 오류" },
    },
  });

  // --- 라우트 등록 ---
  app.openapi(AnalysisSajuRoute, AnalysisSaju);
  app.openapi(FollowUpSajuRoute, FollowUpAnalysisSaju);
  app.openapi(AnalysisSajuStatusRoute, GetAnalysisSajuStatus);
  app.openapi(SajuAnalysisListRoute, getSajuAnalysisList);
  app.openapi(SajuAnalysisDetailRoute, getSajuAnalysisDetail);
  app.openapi(SajuAnalysisFavoriteRoute, toggleSajuAnalysisFavorite);
  app.openapi(SajuAnalysisTitleRoute, updateSajuAnalysisTitle);
  app.openapi(SajuAnalysisDeleteRoute, deleteSajuAnalysis);

  return app;
}
