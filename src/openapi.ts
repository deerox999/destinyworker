import { generateOpenApiFromRouter } from './common/autoOpenApi';
import { createAppRouter } from './common/routes';
import { API_TAGS } from './openapi/tags';

// 라우터 기반으로 OpenAPI 스펙 자동 생성
const appRouter = createAppRouter();
const openApiSpec = generateOpenApiFromRouter(appRouter, {
  title: "Destiny API",
  version: "1.0.0",
  description: "사주 서비스를 위한 백엔드 API",
  tags: [...API_TAGS]
});

export { openApiSpec };
