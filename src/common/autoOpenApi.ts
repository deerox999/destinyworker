import { Router } from './router';

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
  
  // 라우터의 내부 routes를 가져와서 처리
  // (실제 Router 클래스 구조에 따라 수정 필요)
  
  return {
    openapi: "3.0.0",
    info: {
      title: config.title,
      version: config.version,
      description: config.description,
    },
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
        // 자동 생성된 스키마들
      }
    }
  };
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