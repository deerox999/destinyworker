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
  
  router.get("/api/ai-models", async (request: Request, env: any) => {
    return await DestinyTellerApi.fetch(request, env);
  });
}
