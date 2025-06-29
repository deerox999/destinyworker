import { Router } from './router';
import { API_TAGS } from '../openapi/tags';

interface ApiConfig {
  title: string;
  version: string;
  description: string;
  tags: { name: string; description: string }[];
}

interface RouteConfig {
  summary: string;
  description: string;
  tags: string[];
  auth?: boolean;
  requestBody?: any;
  responses?: any;
  parameters?: any[];
}

// 라우터에서 OpenAPI 스펙 자동 생성
export function generateOpenApiFromRouter(router: Router, config: ApiConfig) {
  const paths: Record<string, any> = {};
  const routes = router.getRoutes();
  
  // 각 라우트를 OpenAPI paths로 변환
  for (const route of routes) {
    const pathKey = route.path;
    
    if (!paths[pathKey]) {
      paths[pathKey] = {};
    }
    
    // 기본적인 OpenAPI 스펙 생성
    const operation: any = {
      summary: getOperationSummary(route.method, route.path),
      description: getOperationDescription(route.method, route.path),
      tags: [getTagFromPath(route.path)],
      responses: {
        "200": {
          description: "성공",
          content: {
            "application/json": {
              schema: {
                type: "object"
              }
            }
          }
        },
        "400": {
          description: "잘못된 요청",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse"
              }
            }
          }
        },
        "401": {
          description: "인증 필요",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse"
              }
            }
          }
        },
        "403": {
          description: "권한 없음",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse"
              }
            }
          }
        },
        "500": {
          description: "서버 오류",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse"
              }
            }
          }
        }
      }
    };
    
    // 인증이 필요한 경로에 보안 스키마 추가
    if (isAuthRequired(route.path)) {
      operation.security = [{ bearerAuth: [] }];
    }
    
    // POST 요청에 requestBody 추가
    if (route.method === 'POST' || route.method === 'PUT') {
      operation.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object"
            }
          }
        }
      };
    }
    
    // 경로 파라미터가 있는 경우 parameters 추가
    const pathParams = extractPathParameters(route.path);
    if (pathParams.length > 0) {
      operation.parameters = pathParams.map(param => ({
        name: param,
        in: "path",
        required: true,
        description: `${param} 파라미터`,
        schema: {
          type: "string"
        }
      }));
    }
    
    // 쿼리 파라미터 추가
    const queryParams = getQueryParameters(route.path);
    if (queryParams.length > 0) {
      if (!operation.parameters) operation.parameters = [];
      operation.parameters.push(...queryParams);
    }
    
    paths[pathKey][route.method.toLowerCase()] = operation;
  }
  
  return {
    openapi: "3.0.0",
    info: {
      title: config.title,
      version: config.version,
      description: config.description,
    },
    servers: [
      {
        url: "http://localhost:9393",
        description: "로컬 개발 서버"
      }
    ],
    tags: config.tags,
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

// 경로에서 태그 추출
function getTagFromPath(path: string): string {
  if (path.startsWith('/api/auth')) {
    return "인증";
  } else if (path.startsWith('/api/saju-profiles')) {
    return "사주 프로필";
  } else if (path.startsWith('/api/celebrities')) {
    return "유명인물";
  } else if (path.startsWith('/api/admin')) {
    return "관리자";
  } else if (path.startsWith('/api/json') || path.startsWith('/api/comments')) {
    return "데이터베이스";
  } else {
    return "기타";
  }
}

// 인증이 필요한 경로인지 확인
function isAuthRequired(path: string): boolean {
  const authPaths = [
    '/api/auth/logout',
    '/api/auth/me',
    '/api/auth/refresh',
    '/api/saju-profiles',
    '/api/celebrities',
    '/api/admin'
  ];
  
  return authPaths.some(authPath => path.startsWith(authPath));
}

// 경로에서 파라미터 추출
function extractPathParameters(path: string): string[] {
  const params: string[] = [];
  const parts = path.split('/');
  
  for (const part of parts) {
    if (part.startsWith(':')) {
      params.push(part.slice(1));
    }
  }
  
  return params;
}

// API 요약 정보 생성
function getOperationSummary(method: string, path: string): string {
  if (path === '/api/admin/users') {
    return '가입한 유저 목록 조회';
  } else if (path === '/api/admin/users/:userId/profiles') {
    return '특정 유저의 프로필 조회';
  } else if (path === '/api/admin/stats') {
    return '전체 통계 정보 조회';
  } else if (path === '/api/saju-profiles') {
    return method === 'GET' ? '내 사주 프로필 목록 조회' : '사주 프로필 생성';
  } else if (path.startsWith('/api/saju-profiles/')) {
    if (method === 'GET') return '특정 사주 프로필 조회';
    if (method === 'PUT') return '사주 프로필 수정';
    if (method === 'DELETE') return '사주 프로필 삭제';
  } else if (path === '/api/auth/google/login') {
    return 'Google OAuth 로그인';
  } else if (path === '/api/auth/logout') {
    return '로그아웃';
  } else if (path === '/api/auth/me') {
    return '사용자 정보 조회';
  } else if (path === '/api/auth/refresh') {
    return '토큰 갱신';
  }
  
  return `${method} ${path}`;
}

// API 상세 설명 생성
function getOperationDescription(method: string, path: string): string {
  if (path === '/api/admin/users') {
    return '가입한 모든 유저의 목록을 조회합니다. 페이지네이션과 검색 기능을 지원합니다.';
  } else if (path === '/api/admin/users/:userId/profiles') {
    return '특정 유저가 보유한 모든 사주 프로필을 조회합니다.';
  } else if (path === '/api/admin/stats') {
    return '전체 시스템의 통계 정보를 조회합니다. (총 사용자 수, 프로필 수, 관리자 수 등)';
  } else if (path === '/api/saju-profiles') {
    return method === 'GET' ? '현재 로그인한 사용자의 사주 프로필 목록을 조회합니다.' : '새로운 사주 프로필을 생성합니다.';
  } else if (path.startsWith('/api/saju-profiles/')) {
    if (method === 'GET') return '특정 사주 프로필의 상세 정보를 조회합니다.';
    if (method === 'PUT') return '기존 사주 프로필을 수정합니다.';
    if (method === 'DELETE') return '사주 프로필을 삭제합니다.';
  } else if (path === '/api/auth/google/login') {
    return 'Google OAuth를 통해 로그인합니다.';
  } else if (path === '/api/auth/logout') {
    return '현재 세션을 종료합니다.';
  } else if (path === '/api/auth/me') {
    return '현재 로그인한 사용자의 정보를 조회합니다.';
  } else if (path === '/api/auth/refresh') {
    return 'JWT 토큰을 갱신합니다.';
  }
  
  return `${method} 요청을 처리합니다.`;
}

// 쿼리 파라미터 정보 생성
function getQueryParameters(path: string): any[] {
  if (path === '/api/admin/users') {
    return [
      {
        name: 'page',
        in: 'query',
        required: false,
        description: '페이지 번호 (기본값: 1)',
        schema: {
          type: 'integer',
          default: 1,
          minimum: 1
        }
      },
      {
        name: 'limit',
        in: 'query',
        required: false,
        description: '페이지당 항목 수 (기본값: 20)',
        schema: {
          type: 'integer',
          default: 20,
          minimum: 1,
          maximum: 100
        }
      },
      {
        name: 'search',
        in: 'query',
        required: false,
        description: '검색어 (이름 또는 이메일)',
        schema: {
          type: 'string'
        }
      }
    ];
  }
  
  return [];
}

// JSDoc 주석에서 OpenAPI 정보 추출
export function parseJSDocToOpenApi(comment: string): RouteConfig {
  const lines = comment.split('\n').map(line => line.trim());
  
  const config: RouteConfig = {
    summary: '',
    description: '',
    tags: [],
  };
  
  for (const line of lines) {
    if (line.startsWith('@summary')) {
      config.summary = line.replace('@summary', '').trim();
    } else if (line.startsWith('@description')) {
      config.description = line.replace('@description', '').trim();
    } else if (line.startsWith('@tags')) {
      config.tags = line.replace('@tags', '').split(',').map(t => t.trim());
    } else if (line.startsWith('@auth')) {
      config.auth = true;
    }
  }
  
  return config;
}

// 사용 예시:
/*
router.get('/api/celebrities', 
  // JSDoc 주석으로 API 정보 정의
  // @summary 유명인물 목록 조회
  // @description 유명인물 사주 프로필 목록을 페이징과 검색 기능으로 조회합니다.
  // @tags 유명인물
  celebrityProfileApiHandlers.getCelebrites
);
*/ 