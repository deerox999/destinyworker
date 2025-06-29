import { Router } from './router';
import { openApiSpec } from '../openapi';
import { generateSwaggerHTML, generateApiListHTML } from '../html/swaggerUI';
import { jsonResponse, htmlResponse } from './utils';

/**
 * 정적 페이지 관련 라우트들을 등록합니다
 * 문서, API 스펙 등의 정적 콘텐츠를 제공
 */
export function registerStaticRoutes(router: Router) {
  // 메인 페이지 - API 목록 표시
  router.get('/', async (request, env) => {
    return htmlResponse(generateApiListHTML());
  });

  // API 문서 페이지 - Swagger UI
  router.get('/docs', async (request, env) => {
    return htmlResponse(generateSwaggerHTML());
  });

  // OpenAPI 스펙 JSON - API 스키마 정의
  router.get('/api/openapi.json', async (request, env) => {
    return jsonResponse(openApiSpec);
  });
} 