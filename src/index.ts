import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { createAppRouter } from "./api/routes";

const app = new OpenAPIHono();

// CORS 미들웨어 적용
app.use(
  "*",
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
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    maxAge: 86400,
  })
);

// 에러 핸들링
app.onError((err, c) => {
  console.error(`Global Error:`, err);
  if (err.cause) {
    console.error(`Error Cause:`, err.cause);
  }
  return c.json(
    {
      error: "서버 내부 오류가 발생했습니다.",
      message: err instanceof Error ? err.message : "Unknown error",
      stack: err instanceof Error ? err.stack : undefined,
      cause: err.cause,
    },
    500
  );
});

// 404 핸들링
app.notFound((c) => {
  return c.json({ error: "엔드포인트를 찾을 수 없습니다." }, 404);
});

// 라우트 등록
// Hono v4부터는 .route()를 사용하여 여러 라우트를 한 번에 연결할 수 있습니다.
// createAppRouter가 Hono 인스턴스를 반환하도록 수정해야 합니다.
const routes = createAppRouter();
app.route("/", routes);

export default app;
