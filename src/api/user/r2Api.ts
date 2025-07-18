import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Context, MiddlewareHandler } from "hono";
import { v4 as uuidv4 } from "uuid";
import { getUserFromToken } from "../../common/utils";

/* 운영 개발 분리 된 환경이 아님. dev 환경에서도, destiny 버킷에 업로드 가능하도록 되어있음. */
// R2 클라이언트 생성 함수
const createR2Client = (env: any): S3Client | null => {
  const {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
  } = env;

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    console.error("R2 credentials are not properly configured");
    return null;
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
};

// R2에서 객체 삭제
export async function deleteR2Object(objectKey: string, env: any): Promise<boolean> {
  try {
    const S3 = createR2Client(env);
    if (!S3) return false;

    await S3.send(new DeleteObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: objectKey,
    }));

    return true;
  } catch (error) {
    console.error("Failed to delete object from R2:", error);
    return false;
  }
}

export async function getUploadUrl(
  c: Context
): Promise<Response> {
  const userInfo = await getUserFromToken(c);
  if (!userInfo) return c.json({ error: "인증이 필요합니다." }, 401);

  try {
    const { fileName, contentType } = (await c.req.json()) as {
      fileName: string;
      contentType: string;
    };

    if (!fileName || !contentType) {
      return c.json(
        { error: "fileName and contentType are required." },
        400
      );
    }

    const objectKey = `uploads/user-${userInfo.id}/${uuidv4()}-${fileName}`;

    const {
      R2_ACCOUNT_ID,
      R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY,
      R2_BUCKET_NAME,
      R2_PUBLIC_URL,
    } = c.env;

    if (
      !R2_ACCOUNT_ID ||
      !R2_ACCESS_KEY_ID ||
      !R2_SECRET_ACCESS_KEY ||
      !R2_BUCKET_NAME ||
      !R2_PUBLIC_URL
    ) {
      console.error(
        "R2 environment variables are not set",
        R2_ACCOUNT_ID,
        R2_ACCESS_KEY_ID,
        R2_SECRET_ACCESS_KEY,
        R2_BUCKET_NAME,
        R2_PUBLIC_URL
      );
      return c.json({ error: "Server configuration error" }, 500);
    }

    const S3 = createR2Client(c.env);
    if (!S3) {
      return c.json({ error: "Failed to create R2 client" }, 500);
    }

    const signedUrl = await getSignedUrl(
      S3,
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: objectKey,
        ContentType: contentType,
      }),
      { expiresIn: 300 } // 5 minutes
    );

    return c.json({
      success: true,
      uploadUrl: signedUrl,
      fileUrl: `${R2_PUBLIC_URL}/${objectKey}`,
    });
  } catch (error) {
    console.error("Failed to get upload URL:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return c.json(
      { error: "Failed to get upload URL", message: errorMessage },
      500
    );
  }
}
