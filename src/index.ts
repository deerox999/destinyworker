import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { createAppRouter } from "./api/routes";
import { SajuAnalysisWorker } from "./api/ai/durable-objects/SajuAnalysisWorker";
import { saju_analysis_queue_handler } from "./queue-consumers/sajuAnalysisConsumer";

type Env = {
  Bindings: {
    KV: KVNamespace;
    SAJU_ANALYSIS_WORKER: DurableObjectNamespace;
    analysis: Queue;
    GOOGLE_GEMINI_API_KEY: string;
    DB: D1Database;
  }
}

const app = new OpenAPIHono<Env>();
// app.use(compress()) // 현재 압축 설정하면, 프론트에서 데이터 파싱이 안됨.

app.use(
  "*", // CORS 미들웨어 적용
  cors({
    origin: [
      "http://localhost:9999",
      "http://127.0.0.1:9999",
      "http://localhost:9393",
      "http://127.0.0.1:9393",
      "https://youram.me",
      "https://destiny-91f.pages.dev",
    ],
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 86400, // Access-Control-Max-Age
  })
);

// 에러 핸들링
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    // HTTPException의 경우, 예외에 포함된 상태 코드와 메시지를 사용하여 응답합니다.
    return c.json({ success: false, error: err.message }, err.status as any);
  }
  // 그 외의 모든 오류는 500 내부 서버 오류로 처리합니다.
  console.error("Internal Server Error:", err);
  return c.json({ success: false, error: "Internal Server Error" }, 500);
});

// 404 핸들링
app.notFound((c) => {
  return c.json({ error: "엔드포인트를 찾을 수 없습니다." }, 404);
});

// API 라우트 등록
const routes = createAppRouter();
app.route("/", routes);

// Durable Object 등록
export { SajuAnalysisWorker };

// Queue Consumer 등록
export { saju_analysis_queue_handler };

export default app;
