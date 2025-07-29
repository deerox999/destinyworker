import { Hono } from "hono";
import {
  AsyncSajuAnalysis,
  GetAsyncSajuAnalysisStatus,
  AsyncSajuCompatibilityAnalysis,
  AsyncYearlyFortuneAnalysis,
} from "./asyncSajuApi";

const asyncSajuRouter = new Hono();

// 비동기 사주 분석 API
asyncSajuRouter.post("/analysis", AsyncSajuAnalysis);

// 비동기 궁합 분석 API
asyncSajuRouter.post("/compatibility", AsyncSajuCompatibilityAnalysis);

// 비동기 연간운세 분석 API
asyncSajuRouter.post("/yearly-fortune", AsyncYearlyFortuneAnalysis);

// 작업 상태 조회 API
asyncSajuRouter.get("/status", GetAsyncSajuAnalysisStatus);

export default asyncSajuRouter; 