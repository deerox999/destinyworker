import { Router } from "../../common/router";
import DestinyTellerApi from "../ai/DestinyTellerApi";

/**
 * AI 관련 라우트 등록
 */
export function registerAiRoutes(router: Router): void {
  // 🌟 새로운 전문적인 상세 사주 풀이 API
  router.post("/api/detailed-fortune-telling", async (request: Request, env: any) => {
    return await DestinyTellerApi.fetch(request, env);
  });
  
  // 🔄 기존 간단한 사주 풀이 API (하위 호환성)
  router.post("/api/fortune-telling", async (request: Request, env: any) => {
    return await DestinyTellerApi.fetch(request, env);
  });
  
  // AI 데이터 처리 API (기존 D1 관련)
  router.get("/api/data/*", async (request: Request, env: any) => {
    return await DestinyTellerApi.fetch(request, env);
  });
}
