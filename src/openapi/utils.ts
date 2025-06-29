import { getTagFromPath } from './tags';

// OpenAPI 스펙에 자동으로 태그 추가
export function addTagsToOpenApiSpec(spec: any): any {
  const newSpec = JSON.parse(JSON.stringify(spec)); // 깊은 복사
  
  // 모든 path에 대해 태그 자동 추가
  for (const [path, pathItem] of Object.entries(newSpec.paths)) {
    const tag = getTagFromPath(path);
    
    // 각 HTTP 메서드에 태그 추가
    for (const [method, operation] of Object.entries(pathItem as any)) {
      if (typeof operation === 'object' && operation !== null) {
        const op = operation as any;
        if (!op.tags) {
          op.tags = [tag];
        }
      }
    }
  }
  
  return newSpec;
}

// 스키마 자동 생성 헬퍼
export function createApiResponse(description: string, schemaRef: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: { $ref: schemaRef }
      }
    }
  };
}

// 공통 에러 응답들
export const COMMON_RESPONSES = {
  "400": createApiResponse("잘못된 요청", "#/components/schemas/ErrorResponse"),
  "401": createApiResponse("인증 실패", "#/components/schemas/ErrorResponse"),
  "403": createApiResponse("권한 없음", "#/components/schemas/ErrorResponse"),
  "404": createApiResponse("리소스를 찾을 수 없음", "#/components/schemas/ErrorResponse"),
  "500": createApiResponse("서버 오류", "#/components/schemas/ErrorResponse"),
};

// 보안 스키마 헬퍼
export const BEARER_AUTH = [{ bearerAuth: [] }]; 