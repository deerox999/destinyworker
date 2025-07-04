/**
 * 라우터 시스템
 * API 경로와 핸들러를 자동으로 매칭하여 처리하는 시스템
 */

export interface RouteHandler {
  (request: Request, env: any, params?: Record<string, string>): Promise<Response>;
}

// Swagger 메타데이터 인터페이스
export interface SwaggerMeta {
  summary?: string;
  description?: string;
  tags?: string[];
  auth?: boolean;
  requestBody?: any;
  responses?: any;
  parameters?: any[];
}

export interface Route {
  method: string;
  path: string;
  handler: RouteHandler;
  swagger?: SwaggerMeta; // Swagger 메타데이터 추가
}

export class Router {
  private routes: Route[] = [];

  /**
   * 라우트를 등록합니다
   */
  register(method: string, path: string, handler: RouteHandler, swagger?: SwaggerMeta) {
    this.routes.push({ method, path, handler, swagger });
  }

  /**
   * GET 메서드 라우트를 등록합니다
   */
  get(path: string, handler: RouteHandler, swagger?: SwaggerMeta) {
    this.register('GET', path, handler, swagger);
  }

  /**
   * POST 메서드 라우트를 등록합니다
   */
  post(path: string, handler: RouteHandler, swagger?: SwaggerMeta) {
    this.register('POST', path, handler, swagger);
  }

  /**
   * PUT 메서드 라우트를 등록합니다
   */
  put(path: string, handler: RouteHandler, swagger?: SwaggerMeta) {
    this.register('PUT', path, handler, swagger);
  }

  /**
   * DELETE 메서드 라우트를 등록합니다
   */
  delete(path: string, handler: RouteHandler, swagger?: SwaggerMeta) {
    this.register('DELETE', path, handler, swagger);
  }

  /**
   * 요청을 처리합니다
   */
  async handle(request: Request, env: any): Promise<Response | null> {
    const url = new URL(request.url);
    const method = request.method;
    const pathname = url.pathname;

    // 등록된 라우트들을 순회하며 매칭되는 라우트를 찾습니다
    for (const route of this.routes) {
      if (route.method !== method) continue;

      const match = this.matchPath(route.path, pathname);
      if (match) {
        try {
          return await route.handler(request, env, match.params);
        } catch (error) {
          console.error(`라우트 처리 오류 [${method} ${pathname}]:`, error);
          return new Response(JSON.stringify({
            error: "서버 내부 오류가 발생했습니다.",
            message: error instanceof Error ? error.message : "Unknown error"
          }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }
      }
    }

    return null; // 매칭되는 라우트가 없음
  }

  /**
   * 경로 패턴과 실제 경로를 매칭합니다
   * 예: "/api/json/:userId" 와 "/api/json/123" 매칭
   */
  private matchPath(pattern: string, pathname: string): { params: Record<string, string> } | null {
    const patternParts = pattern.split('/');
    const pathnameParts = pathname.split('/');

    if (patternParts.length !== pathnameParts.length) {
      return null;
    }

    const params: Record<string, string> = {};

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const pathnamePart = pathnameParts[i];

      if (patternPart.startsWith(':')) {
        // 파라미터 부분 (예: :userId)
        const paramName = patternPart.slice(1);
        params[paramName] = pathnamePart;
      } else if (patternPart !== pathnamePart) {
        // 고정 경로가 일치하지 않음
        return null;
      }
    }

    return { params };
  }

  /**
   * 등록된 모든 라우트 목록을 반환합니다 (디버깅용)
   */
  getRoutes(): Route[] {
    return [...this.routes];
  }

  /**
   * 다른 라우터의 경로들을 현재 라우터에 병합합니다.
   * @param router 병합할 라우터 인스턴스
   */
  merge(router: Router) {
    this.routes.push(...router.getRoutes());
  }
} 