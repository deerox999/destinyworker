import { Router } from './router';

interface ApiConfig {
  title: string;
  version: string;
  description: string
}

// 라우터에서 OpenAPI 스펙 자동 생성
export function generateOpenApiFromRouter(
  router: Router,
  config: ApiConfig,
  filterTags?: string[]
) {
  const paths: Record<string, any> = {};
  const routes = router.getRoutes();
  
  // 태그 목록 자동 수집
  const tagSet = new Set<string>();
  
  // 각 라우트를 OpenAPI paths로 변환
  for (const route of routes) {
    const swagger = route.swagger;
    const autoTag = extractTagFromPath(route.path);
    const routeTags = swagger?.tags || [autoTag];
    
    // 태그 필터링 로직
    if (
      filterTags &&
      filterTags.length > 0 &&
      !routeTags.some((tag) => filterTags.includes(tag))
    ) {
      continue; // 필터에 포함되지 않으면 건너뜁니다.
    }
    
    const pathKey = route.path;
    
    if (!paths[pathKey]) {
      paths[pathKey] = {};
    }
    
    // swagger 메타데이터가 있으면 우선 사용, 없으면 자동 생성
    const operation: any = {
      summary: swagger?.summary || generateAutoSummary(route.method, route.path),
      description: swagger?.description || generateAutoDescription(route.method, route.path),
      tags: routeTags,
      responses: swagger?.responses || getStandardResponses()
    };
    
    // 태그 수집
    routeTags.forEach((tag) => tagSet.add(tag));
    
    // 인증 정보
    const autoAuth = inferAuthRequirement(route.path);
    const authRequired = swagger?.auth !== undefined ? swagger.auth : autoAuth;
    if (authRequired) {
      operation.security = [{ bearerAuth: [] }];
    }
    
    // requestBody
    if (swagger?.requestBody) {
      operation.requestBody = swagger.requestBody;
    } else if (route.method === 'POST' || route.method === 'PUT') {
      operation.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: { type: "object" }
          }
        }
      };
    }
    
    // parameters
    if (swagger?.parameters) {
      operation.parameters = swagger.parameters;
    } else {
      // 경로 파라미터 자동 추가
      const pathParams = extractPathParameters(route.path);
      if (pathParams.length > 0) {
        operation.parameters = pathParams.map(param => ({
          name: param,
          in: "path",
          required: true,
          description: generateParamDescription(param, route.path),
          schema: { type: "string" }
        }));
      }
      
      // 쿼리 파라미터 자동 추가 (특정 패턴에서)
      const queryParams = inferQueryParameters(route.path, route.method);
      if (queryParams.length > 0) {
        operation.parameters = [
          ...(operation.parameters || []),
          ...queryParams
        ];
      }
    }
    
    paths[pathKey][route.method.toLowerCase()] = operation;
  }
  
  return {
    openapi: "3.0.0",
    info: config,
    servers: [
      {
        url: "http://localhost:9393",
        description: "로컬 개발 서버"
      }
    ],
    tags: generateTagDescriptions(Array.from(tagSet)),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT"
        }
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          properties: {
            error: {
              type: "string",
              description: "오류 메시지"
            }
          }
        }
      }
    }
  };
}

// 경로에서 태그 자동 추출
function extractTagFromPath(path: string): string {
  const segments = path.split('/').filter(segment => segment && !segment.startsWith(':'));
  
  if (segments.length >= 2 && segments[0] === 'api') {
    const mainSegment = segments[1];
    
    // 복합 단어를 한글로 변환
    const tagMap: Record<string, string> = {
      'auth': '인증',
      'saju-profiles': '사주 프로필',
      'celebrities': '유명인물',
      'admin': '관리자',
      'detailed-fortune-telling': 'AI 운세',
      'ai-models': 'AI 모델'
    };
    
    return tagMap[mainSegment] || capitalizeFirst(mainSegment.replace(/-/g, ' '));
  }
  
  return '기타';
}

// 인증 필요 여부 자동 추론
function inferAuthRequirement(path: string): boolean {
  // 공개 API 패턴들
  const publicPatterns = [
    '/api/auth/google/login',
    '/api/celebrities/request', // 유명인물 요청은 공개
    '/docs',
    '/',
    '/api/openapi.json'
  ];
  
  // 명시적으로 공개인 경우
  if (publicPatterns.some(pattern => path === pattern)) {
    return false;
  }
  
  // auth 관련이지만 로그인이 아닌 경우는 인증 필요
  if (path.startsWith('/api/auth/') && !path.includes('/login')) {
    return true;
  }
  
  // admin, profiles 등은 인증 필요
  if (path.includes('/admin') || path.includes('/profiles')) {
    return true;
  }
  
  // 기본적으로 /api/로 시작하는 것들은 인증 필요로 추정
  return path.startsWith('/api/');
}

// 경로에서 파라미터 추출
function extractPathParameters(path: string): string[] {
  return path.split('/').filter(part => part.startsWith(':')).map(part => part.slice(1));
}

// 자동 요약 생성
function generateAutoSummary(method: string, path: string): string {
  const action = getActionFromMethod(method);
  const resource = extractResourceFromPath(path);
  return `${resource} ${action}`;
}

// 자동 설명 생성
function generateAutoDescription(method: string, path: string): string {
  const action = getActionFromMethod(method);
  const resource = extractResourceFromPath(path);
  return `${resource}을(를) ${action}합니다.`;
}

// HTTP 메서드에서 액션 추출
function getActionFromMethod(method: string): string {
  const methodMap: Record<string, string> = {
    'GET': '조회',
    'POST': '생성',
    'PUT': '수정',
    'DELETE': '삭제',
    'PATCH': '부분 수정'
  };
  return methodMap[method] || method.toLowerCase();
}

// 경로에서 리소스명 자동 추출
function extractResourceFromPath(path: string): string {
  const segments = path.split('/').filter(segment => segment && !segment.startsWith(':'));
  
  // 특별한 경우들 처리
  if (path.includes('/comments')) return '댓글';
  if (path.includes('/request')) return '요청';
  if (path.includes('/stats')) return '통계';
  if (path.includes('/auth/me')) return '사용자 정보';
  if (path.includes('/auth/refresh')) return '토큰';
  if (path.includes('/auth/logout')) return '세션';
  if (path.includes('/auth/login')) return '로그인';
  
  // 마지막 의미있는 세그먼트 사용
  if (segments.length >= 2) {
    const lastSegment = segments[segments.length - 1];
    
    // 복합 단어 처리
    const resourceMap: Record<string, string> = {
      'profiles': '프로필',
      'celebrities': '유명인물',
      'users': '사용자',
      'requests': '요청 목록',
      'models': '모델 목록',
      'detailed-fortune-telling': '상세 운세'
    };
    
    return resourceMap[lastSegment] || lastSegment;
  }
  
  return '데이터';
}

// 파라미터 설명 자동 생성
function generateParamDescription(param: string, path: string): string {
  const paramMap: Record<string, string> = {
    'id': '식별자',
    'userId': '사용자 ID',
    'commentId': '댓글 ID'
  };
  
  return paramMap[param] || `${param} 값`;
}

// 쿼리 파라미터 자동 추론
function inferQueryParameters(path: string, method: string): any[] {
  // 목록 조회 API에 대해서만 페이징 파라미터 추가
  if (method === 'GET' && (
    path.includes('/users') || 
    path.includes('/requests') ||
    path.endsWith('/profiles') ||
    path.endsWith('/celebrities')
  )) {
    return [
      {
        name: 'page',
        in: 'query',
        required: false,
        description: '페이지 번호',
        schema: { type: 'integer', default: 1, minimum: 1 }
      },
      {
        name: 'limit',
        in: 'query',
        required: false,
        description: '페이지당 항목 수',
        schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 }
      }
    ];
  }
  
  return [];
}

// 태그 설명 자동 생성
function generateTagDescriptions(tags: string[]): any[] {
  return tags.map(tag => {
    const descriptionMap: Record<string, string> = {
      '인증': 'Google OAuth 로그인 및 세션 관리',
      '사주 프로필': '개인 사주 프로필 관리',
      '유명인물': '유명인물 사주 프로필 및 댓글',
      '관리자': '관리자 전용 API',
      'AI 운세': 'AI 기반 상세 운세 분석',
      'AI 모델': 'AI 모델 정보'
    };
    
    return {
      name: tag,
      description: descriptionMap[tag] || `${tag} 관련 API`
    };
  });
}

// 문자열 첫 글자 대문자화
function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// 표준 응답 정의
function getStandardResponses() {
  return {
    "200": {
      description: "성공",
      content: {
        "application/json": {
          schema: { type: "object" }
        }
      }
    },
    "400": {
      description: "잘못된 요청",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ErrorResponse" }
        }
      }
    },
    "401": {
      description: "인증 필요",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ErrorResponse" }
        }
      }
    },
    "403": {
      description: "권한 없음", 
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ErrorResponse" }
        }
      }
    },
    "500": {
      description: "서버 오류",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ErrorResponse" }
        }
      }
    }
  };
}

 