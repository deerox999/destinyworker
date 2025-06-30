import { Router } from "../../common/router";
import DestinyTellerApi from "../ai/DestinyTellerApi";

/**
 * AI 관련 라우트 등록
 */
export function registerAiRoutes(router: Router): void {
  // AI 사주 풀이 API
  router.post("/api/fortune-telling", async (request: Request, env: any) => {
    return await DestinyTellerApi.fetch(request, env);
  });
}
