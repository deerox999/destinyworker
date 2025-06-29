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
      summary: `${route.method} ${route.path}`,
      description: `${route.method} 요청을 처리합니다.`,
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
    '/api/celebrities'
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