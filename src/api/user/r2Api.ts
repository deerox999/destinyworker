import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { jsonResponse, getUserIdFromToken } from "../../common/utils";
import { v4 as uuidv4 } from "uuid";

/* 운영 개발 분리 된 환경이 아님. dev 환경에서도, destiny 버킷에 업로드 가능하도록 되어있음. */
export async function getUploadUrl(
  request: Request,
  env: any
): Promise<Response> {
  const userId = await getUserIdFromToken(request);
  if (!userId) return jsonResponse({ error: "인증이 필요합니다." }, 401);

  try {
    const { fileName, contentType } = (await request.json()) as {
      fileName: string;
      contentType: string;
    };

    if (!fileName || !contentType) {
      return jsonResponse(
        { error: "fileName and contentType are required." },
        400
      );
    }

    const objectKey = `uploads/user-${userId}/${uuidv4()}-${fileName}`;

    const {
      R2_ACCOUNT_ID,
      R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY,
      R2_BUCKET_NAME,
    } = env;

    if (
      !R2_ACCOUNT_ID ||
      !R2_ACCESS_KEY_ID ||
      !R2_SECRET_ACCESS_KEY ||
      !R2_BUCKET_NAME
    ) {
      console.error("R2 environment variables are not set");
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    const S3 = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });

    const signedUrl = await getSignedUrl(
      S3,
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: objectKey,
        ContentType: contentType,
      }),
      { expiresIn: 300 } // 5 minutes
    );

    const publicBucketUrl = `https://pub-4354a322c954457ca67926934c8564a9.r2.dev`;

    return jsonResponse({
      success: true,
      uploadUrl: signedUrl,
      fileUrl: `${publicBucketUrl}/${objectKey}`,
    });
  } catch (error) {
    console.error("Failed to get upload URL:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(
      { error: "Failed to get upload URL", message: errorMessage },
      500
    );
  }
}
