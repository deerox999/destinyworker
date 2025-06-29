import { generateOpenApiFromRouter } from './common/autoOpenApi';
import { createAppRouter } from './common/routes';
import { API_TAGS } from './openapi/tags';

// OpenAPI 스펙 생성 함수
export function generateOpenApiSpec() {
  // 라우터 기반으로 OpenAPI 스펙 자동 생성
  const appRouter = createAppRouter();
  return generateOpenApiFromRouter(appRouter, {
    title: "Destiny API",
    version: "1.0.0",
    description: "사주 서비스를 위한 백엔드 API",
    tags: [...API_TAGS]
  });
}

// 기본 export
export const openApiSpec = generateOpenApiSpec();
