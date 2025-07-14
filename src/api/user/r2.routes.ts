import { Context, Hono } from "hono";
import { getUploadUrl } from "./r2Api";

export function createR2Router(): Hono {
  const app = new Hono();

  const getUploadUrlHandler = (c: Context) => getUploadUrl(c);
  app.post("/upload-url", getUploadUrlHandler);
  getUploadUrlHandler.swagger = { 
    summary: "R2 업로드용 Pre-signed URL 생성",
    description:
      "프로필 사진 등 파일을 R2에 직접 업로드하기 위한 Pre-signed URL을 생성합니다. 요청 본문에 `fileName`과 `contentType`을 포함해야 합니다.",
    tags: ["사용자", "R2"],
    security: [{ BearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              fileName: {
                type: "string",
                description: "업로드할 파일의 원본 이름",
              },
              contentType: {
                type: "string",
                description: "업로드할 파일의 MIME 타입 (e.g., 'image/jpeg')",
              },
            },
            required: ["fileName", "contentType"],
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Pre-signed URL 생성 성공",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean" },
                uploadUrl: {
                  type: "string",
                  description: "파일을 PUT 메서드로 업로드할 Pre-signed URL",
                },
                fileUrl: {
                  type: "string",
                  description: "업로드 완료 후 파일에 접근할 최종 URL",
                },
              },
            },
          },
        },
      },
      "400": { description: "잘못된 요청" },
      "401": { description: "인증 실패" },
      "500": { description: "서버 설정 오류" },
    },
  };

  return app;
}

