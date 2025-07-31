import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  RagAddDocuments,
  RagDelete,
  RagDocuments,
  RagGetMetadataSchema,
  RagUpdate,
} from "./RagApi";
import { MiddlewareHandler } from "hono";
import {
  PaginationResponseSchema,
  SuccessSchema,
} from "../../../common/schemas";

export function createRagRouter(authMiddleware: MiddlewareHandler): OpenAPIHono {
  const app = new OpenAPIHono();
  app.use(authMiddleware);

  // --- 스키마 정의 ---
  // RAG 문서 스키마
  const RagMetadataSchema = z.object({
    text: z.string().min(1),
    metadata: z.object({
      source: z.string().min(1),
      category: z.string().min(1),
      author: z.string().optional(),
      relatedConcepts: z.array(z.string()).optional(),
      url: z.string().optional(),
    }),
  });

  const RagDocumentSchema = z
    .object({
      text: z
        .string()
        .openapi({ description: "저장할 텍스트 내용", example: "정관은..." }),
      metadata: RagMetadataSchema,
    })
    .openapi({ type: "object" });

  // --- 라우트 정의 ---

  const RagAddDocumentsRoute = createRoute({
    method: "post",
    path: "/rag/documents",
    summary: "[RAG] 문서 일괄 추가",
    description:
      "RAG 시스템에 여러 지식 문서를 한 번에 추가하고 벡터 인덱싱을 수행합니다.",
    tags: ["AI - RAG"],
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z
              .object({ documents: z.array(RagDocumentSchema) })
              .openapi({ type: "object" }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "문서 추가 및 인덱싱 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              count: z.number().int().openapi({ example: 5 }),
            }).openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 요청" },
      409: { description: "모든 문서가 이미 존재함" },
      500: { description: "서버 오류" },
    },
  });

  const RagUpdateRoute = createRoute({
    method: "put",
    path: "/rag/documents/{id}",
    summary: "[RAG] 문서 메타데이터 수정",
    description: "ID로 특정 문서의 메타데이터 전체를 수정합니다.",
    tags: ["AI - RAG"],
    security: [{ BearerAuth: [] }],
    request: {
      params: z
        .object({
          id: z.coerce
            .number()
            .int()
            .positive()
            .openapi({
              param: { name: "id", in: "path" },
              description: "문서 ID",
              example: 123,
            }),
        })
        .openapi({ type: "object" }),
      body: {
        content: {
          "application/json": { schema: RagMetadataSchema },
        },
      },
    },
    responses: {
      200: {
        description: "메타데이터 수정 성공",
        content: {
          "application/json": {
            schema: RagMetadataSchema,
          },
        },
      },
      400: { description: "잘못된 요청 (ID 또는 메타데이터 형식 오류)" },
      404: { description: "해당 ID의 문서를 찾을 수 없음" },
      500: { description: "서버 오류" },
    },
  });

  const RagGetDocumentsRoute = createRoute({
    method: "get",
    path: "/rag/documents",
    summary: "[RAG] 문서 목록 조회",
    description:
      "RAG 시스템에 저장된 모든 문서를 페이지네이션 및 검색 기능과 함께 조회합니다.",
    tags: ["AI - RAG"],
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        description: "성공적인 응답",
        content: {
          "application/json": {
            schema: z
              .object({
                documents: z.array(
                  RagDocumentSchema.extend({ id: z.number().int() }).openapi({
                    type: "object",
                  })
                ),
                pagination: PaginationResponseSchema,
              })
              .openapi({ type: "object" }),
          },
        },
      },
      500: { description: "서버 오류" },
    },
  });

  const RagDeleteRoute = createRoute({
    method: "delete",
    path: "/rag/documents/{id}",
    summary: "[RAG] 문서 삭제",
    description: "ID로 특정 문서를 RAG 시스템에서 삭제합니다.",
    tags: ["AI - RAG"],
    security: [{ BearerAuth: [] }],
    request: {
      params: z
        .object({
          id: z.coerce
            .number()
            .int()
            .positive()
            .openapi({
              param: { name: "id", in: "path" },
              description: "문서 ID",
              example: 123,
            }),
        })
        .openapi({ type: "object" }),
    },
    responses: {
      200: {
        description: "삭제 성공",
        content: {
          "application/json": {
            schema: SuccessSchema.extend({
              deletedCount: z.number().int().openapi({ example: 3 }),
            }).openapi({ type: "object" }),
          },
        },
      },
      400: { description: "잘못된 요청" },
      500: { description: "서버 오류" },
    },
  });

  const RagGetMetadataSchemaRoute = createRoute({
    method: "get",
    path: "/rag/metadata-schema",
    summary: "[RAG] 메타데이터 스키마 조회",
    description: "RAG 문서에 사용되는 메타데이터의 구조(enum 등)를 조회합니다.",
    tags: ["AI - RAG"],
    security: [{ BearerAuth: [] }],
    responses: {
      200: {
        description: "스키마 정보 조회 성공",
        content: {
          "application/json": {
            schema: z.object({
              schema: z.any().openapi({ type: "object" }), // 실제 스키마는 동적이므로 any로 처리
            }),
          },
        },
      },
      500: { description: "서버 오류" },
    },
  });

  // --- 라우트 등록 ---
  app.openapi(RagAddDocumentsRoute, RagAddDocuments);
  app.openapi(RagUpdateRoute, RagUpdate);
  app.openapi(RagGetDocumentsRoute, RagDocuments);
  app.openapi(RagDeleteRoute, RagDelete);
  app.openapi(RagGetMetadataSchemaRoute, RagGetMetadataSchema);

  return app;
} 