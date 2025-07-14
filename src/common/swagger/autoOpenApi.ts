import { Hono } from "hono";

interface ApiConfig {
  title: string;
  version: string;
  description: string;
}

// 라우터에서 OpenAPI 스펙 자동 생성
export function generateOpenApiFromRouter(
  app: Hono,
  config: ApiConfig,
  filterTags?: string[],
  environment?: string
) {
  const paths: Record<string, any> = {};
  const routes = app.routes;

  // 태그 목록 자동 수집
  const tagSet = new Set<string>();

  // 각 라우트를 OpenAPI paths로 변환
  for (const route of routes) {
    // Hono 라우트 객체에서 핸들러와 메타데이터 추출
    const handler = route.handler as any;
    const swagger = handler.swagger;

    // Hono 라우트의 경로를 OpenAPI 형식으로 변환 (예: /users/:id -> /users/{id})
    const openApiPath = route.path.replace(/:([^/]+)/g, "{$1}");

    // 태그 필터링 로직
    const routeTags = swagger?.tags || [];
    if (
      filterTags &&
      filterTags.length > 0 &&
      !routeTags.some((tag: string) => filterTags.includes(tag))
    ) {
      continue; // 필터에 포함되지 않으면 건너뜁니다.
    }

    if (!paths[openApiPath]) {
      paths[openApiPath] = {};
    }

    // swagger 메타데이터가 있으면 우선 사용, 없으면 자동 생성
    const operation: any = {
      summary:
        swagger?.summary || generateAutoSummary(route.method, route.path),
      description:
        swagger?.description ||
        generateAutoDescription(route.method, route.path),
      tags: routeTags,
      responses: swagger?.responses || getStandardResponses(),
    };

    // 태그 수집
    routeTags.forEach((tag: string) => tagSet.add(tag));

    // 인증 정보 (Hono 라우트의 security 속성 사용)
    if (swagger?.security) {
      operation.security = swagger.security;
    } else {
      // 기존 inferAuthRequirement 로직을 Hono 경로에 맞게 조정
      const autoAuth = inferAuthRequirement(route.path);
      if (autoAuth) {
        operation.security = [{ BearerAuth: [] }];
      }
    }

    // requestBody
    if (swagger?.requestBody) {
      operation.requestBody = swagger.requestBody;
    } else if (route.method === "POST" || route.method === "PUT") {
      // 기본 requestBody 스키마 (필요시 더 구체화)
      operation.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: { type: "object" },
          },
        },
      };
    }

    // parameters
    if (swagger?.parameters) {
      operation.parameters = swagger.parameters;
    } else {
      // 경로 파라미터 자동 추가
      const pathParams = extractPathParameters(route.path);
      if (pathParams.length > 0) {
        operation.parameters = pathParams.map((param) => ({
          name: param,
          in: "path",
          required: true,
          description: generateParamDescription(param, route.path),
          schema: { type: "string" },
        }));
      }

      // 쿼리 파라미터 자동 추가 (특정 패턴에서)
      const queryParams = inferQueryParameters(route.path, route.method);
      if (queryParams.length > 0) {
        operation.parameters = [
          ...(operation.parameters || []),
          ...queryParams,
        ];
      }
    }

    paths[openApiPath][route.method.toLowerCase()] = operation;
  }

  const servers = [
    {
      url: "http://localhost:9393",
      description: "로컬 개발 서버",
    },
  ];

  // 프로덕션 환경일 경우 실제 배포 URL 추가
  if (environment === "production") {
    servers.push({
      url: "https://youram.me", // 실제 프로덕션 도메인으로 변경 필요
      description: "프로덕션 서버",
    });
  }

  return {
    openapi: "3.0.0",
    info: config,
    servers: servers,
    tags: generateTagDescriptions(Array.from(tagSet)),
    paths,
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          properties: {
            error: {
              type: "string",
              description: "오류 메시지",
            },
          },
        },
      },
    },
  };
}

// 인증 필요 여부 자동 추론 (Hono 경로에 맞게 조정)
function inferAuthRequirement(path: string): boolean {
  // 공개 API 패턴들 (Hono 라우트의 상대 경로)
  const publicPatterns = [
    "/google/login",
    "/request", // 유명인물 요청은 공개
    "/", // 루트 경로 (API 목록, Swagger UI)
    "/docs",
    "/openapi.json",
    "/vapid-public-key", // 푸시 알림 VAPID 공개 키
  ];

  // 명시적으로 공개인 경우
  if (publicPatterns.some((pattern) => path === pattern)) {
    return false;
  }

  // auth 관련이지만 로그인이 아닌 경우는 인증 필요
  if (path.startsWith("/auth/") && !path.includes("/login")) {
    return true;
  }

  // admin, saju-profiles, users, celebrities 등은 인증 필요
  if (
    path.startsWith("/admin") ||
    path.startsWith("/saju-profiles") ||
    path.startsWith("/users") ||
    path.startsWith("/celebrities") ||
    path.startsWith("/ai") ||
    path.startsWith("/r2") ||
    path.startsWith("/push")
  ) {
    return true;
  }

  return false;
}

// 경로에서 파라미터 추출
function extractPathParameters(path: string): string[] {
  return path
    .split("/")
    .filter((part) => part.startsWith(":"))
    .map((part) => part.slice(1));
}

// 자동 설명 생성
function generateAutoDescription(method: string, path: string): string {
  const action = getActionFromMethod(method);
  const resource = extractResourceFromPath(path);
  return `${resource}을(를) ${action}합니다.`;
}

// 경로에서 리소스명 자동 추출
function extractResourceFromPath(path: string): string {
  const segments = path
    .split("/")
    .filter((segment) => segment && !segment.startsWith(":"));

  // 특별한 경우들 처리
  if (path.includes("/comments")) return "댓글";
  if (path.includes("/request")) return "요청";
  if (path.includes("/stats")) return "통계";
  if (path.includes("/me")) return "사용자 정보";
  if (path.includes("/refresh")) return "토큰";
  if (path.includes("/logout")) return "세션";
  if (path.includes("/login")) return "로그인";
  if (path.includes("/upload-url")) return "R2 업로드 URL";
  if (path.includes("/saju-chat")) return "대화형 RAG";
  if (path.includes("/rag/documents")) return "RAG 문서";
  if (path.includes("/rag/metadata-schema")) return "RAG 메타데이터 스키마";
  if (path.includes("/detailed-fortune-telling")) return "상세 사주 풀이";
  if (path.includes("/gemini-saju-analysis")) return "Gemini 사주 분석";
  if (path.includes("/vapid-public-key")) return "VAPID 공개 키";
  if (path.includes("/subscribe")) return "푸시 구독";
  if (path.includes("/unsubscribe")) return "푸시 구독 해지";

  // 마지막 의미있는 세그먼트 사용
  if (segments.length >= 1) {
    const lastSegment = segments[segments.length - 1];

    // 복합 단어 처리
    const resourceMap: Record<string, string> = {
      profiles: "프로필",
      celebrities: "유명인물",
      users: "사용자",
      requests: "요청 목록",
      models: "모델 목록",
      "ai-usage-by-model": "모델별 AI 사용량",
      "ai-usage-by-user": "사용자별 AI 사용량",
      "ai-usage": "AI 사용 기록",
      login: "로그인 기록",
    };

    return resourceMap[lastSegment] || lastSegment;
  }

  return "데이터";
}

// 파라미터 설명 자동 생성
function generateParamDescription(param: string, path: string): string {
  const paramMap: Record<string, string> = {
    id: "식별자",
    userId: "사용자 ID",
    commentId: "댓글 ID",
    model: "AI 모델 이름",
  };

  return paramMap[param] || `${param} 값`;
}

// 태그 설명 자동 생성
function generateTagDescriptions(tags: string[]): any[] {
  return tags.map((tag) => {
    const descriptionMap: Record<string, string> = {
      인증: "Google OAuth 로그인 및 세션 관리",
      "사주 프로필": "개인 사주 프로필 관리",
      유명인물: "유명인물 사주 프로필 및 댓글",
      관리자: "관리자 전용 API",
      AI: "AI 기반 운세 및 RAG",
      "AI - RAG": "AI 지식 기반 (RAG) 문서 관리",
      "AI - 대화형 RAG": "AI 기반 대화형 사주 상담",
      사용자: "사용자 정보 및 R2 파일 업로드",
      푸시: "웹 푸시 알림 구독 관리",
    };

    return {
      name: tag,
      description: descriptionMap[tag] || `${tag} 관련 API`,
    };
  });
}

// 자동 요약 생성
function generateAutoSummary(method: string, path: string): string {
  const action = getActionFromMethod(method);
  const resource = extractResourceFromPath(path);
  return `${resource} ${action}`;
}

// HTTP 메서드에서 액션 추출
function getActionFromMethod(method: string): string {
  const methodMap: Record<string, string> = {
    GET: "조회",
    POST: "생성",
    PUT: "수정",
    DELETE: "삭제",
    PATCH: "부분 수정",
  };
  return methodMap[method] || method.toLowerCase();
}

// 쿼리 파라미터 자동 추론
function inferQueryParameters(path: string, method: string): any[] {
  // 목록 조회 API에 대해서만 페이징 파라미터 추가
  if (
    method === "GET" &&
    (
      path.includes("/users") ||
      path.includes("/requests") ||
      path.includes("/profiles") ||
      path.includes("/celebrities") ||
      path.includes("/history") ||
      path.includes("/stats") ||
      path.includes("/saju-chat") ||
      path.includes("/rag/documents")
    )
  ) {
    const params: any[] = [
      {
        name: "page",
        in: "query",
        required: false,
        description: "페이지 번호",
        schema: { type: "integer", default: 1, minimum: 1 },
      },
      {
        name: "limit",
        in: "query",
        required: false,
        description: "페이지당 항목 수",
        schema: { type: "integer", default: 20, minimum: 1, maximum: 100 },
      },
    ];

    // 특정 경로에 대한 추가 쿼리 파라미터
    if (path.includes("/history/login")) {
      params.push(
        {
          name: "search",
          in: "query",
          schema: { type: "string" },
          description: "사용자 이름 또는 이메일로 검색",
        },
        {
          name: "action",
          in: "query",
          schema: { type: "string", enum: ["login", "logout"] },
          description: "활동 종류 필터링",
        }
      );
    } else if (path.includes("/stats/ai-usage-by-model")) {
      params.push(
        {
          name: "startDate",
          in: "query",
          description: "조회 시작일 (YYYY-MM-DD)",
          schema: { type: "string", format: "date" },
        },
        {
          name: "endDate",
          in: "query",
          description: "조회 종료일 (YYYY-MM-DD)",
          schema: { type: "string", format: "date" },
        },
        {
          name: "sort",
          in: "query",
          description:
            "정렬 필드 (model, total_tokens, total_calls, unique_users)",
          schema: { type: "string", default: "total_tokens" },
        },
        {
          name: "order",
          in: "query",
          description: "정렬 순서",
          schema: { type: "string", enum: ["asc", "desc"], default: "desc" },
        }
      );
    } else if (path.includes("/stats/ai-usage-by-user")) {
      params.push(
        {
          name: "startDate",
          in: "query",
          description: "조회 시작일 (YYYY-MM-DD)",
          schema: { type: "string", format: "date" },
        },
        {
          name: "endDate",
          in: "query",
          description: "조회 종료일 (YYYY-MM-DD)",
          schema: { type: "string", format: "date" },
        },
        {
          name: "sort",
          in: "query",
          description: "정렬 필드 (total_tokens, total_calls)",
          schema: { type: "string", default: "total_tokens" },
        },
        {
          name: "order",
          in: "query",
          description: "정렬 순서",
          schema: { type: "string", enum: ["asc", "desc"], default: "desc" },
        }
      );
    } else if (path.includes("/users/") && path.includes("/ai-usage")) {
      params.push(
        {
          name: "startDate",
          in: "query",
          schema: { type: "string", format: "date" },
          description: "조회 시작일 (YYYY-MM-DD)",
        },
        {
          name: "endDate",
          in: "query",
          schema: { type: "string", format: "date" },
          description: "조회 종료일 (YYYY-MM-DD)",
        },
        {
          name: "sort",
          in: "query",
          description: "정렬 필드 (e.g., total_tokens, created_at)",
          schema: { type: "string", default: "created_at" },
        },
        {
          name: "order",
          in: "query",
          description: "정렬 순서",
          schema: { type: "string", enum: ["asc", "desc"], default: "desc" },
        }
      );
    } else if (path.includes("/celebrities")) {
      params.push(
        {
          name: "sort",
          in: "query",
          description: "정렬 필드",
          required: false,
          schema: { type: "string", default: "createdAt" },
        },
        {
          name: "order",
          in: "query",
          description: "정렬 순서",
          required: false,
          schema: { type: "string", enum: ["asc", "desc"], default: "desc" },
        },
        {
          name: "id",
          in: "query",
          description: "ID로 검색 (정확한 ID 매칭)",
          required: false,
          schema: { type: "string" },
        },
        {
          name: "search",
          in: "query",
          description: "통합 검색 (ID, 이름, 직업, 설명에서 검색, 모든 언어 지원)",
          required: false,
          schema: { type: "string" },
        }
      );
    } else if (path.includes("/comments")) {
      params.push(
        {
          name: "sort",
          in: "query",
          description: "정렬 기준 (latest 또는 likes)",
          schema: {
            type: "string",
            enum: ["latest", "likes"],
            default: "latest",
          },
        }
      );
    } else if (path.includes("/requests")) {
      params.push(
        {
          name: "search",
          in: "query",
          description: "검색어 (요청된 이름으로 검색)",
          required: false,
          schema: { type: "string" },
        },
        {
          name: "sort",
          in: "query",
          description: "정렬 필드",
          required: false,
          schema: { type: "string", default: "created_at" },
        },
        {
          name: "order",
          in: "query",
          description: "정렬 순서",
          required: false,
          schema: { type: "string", enum: ["asc", "desc"], default: "desc" },
        }
      );
    }
    return params;
  }

  return [];
}

// 표준 응답 정의
function getStandardResponses() {
  return {
    "200": {
      description: "성공",
      content: {
        "application/json": {
          schema: { type: "object" },
        },
      },
    },
    "400": {
      description: "잘못된 요청",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ErrorResponse" },
        },
      },
    },
    "401": {
      description: "인증 필요",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ErrorResponse" },
        },
      },
    },
    "403": {
      description: "권한 없음",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ErrorResponse" },
        },
      },
    },
    "404": {
      description: "찾을 수 없음",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ErrorResponse" },
        },
      },
    },
    "500": {
      description: "서버 오류",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ErrorResponse" },
        },
      },
    },
  };
}
