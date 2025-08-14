import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Context } from "hono";
import { v4 as uuidv4 } from "uuid";
import { getUserFromToken } from "../../common/utils";

/* 운영 개발 분리 된 환경이 아님. dev 환경에서도, destiny 버킷에 업로드 가능하도록 되어있음. */
// R2 클라이언트 생성 함수
export const createR2Client = (env: any): S3Client | null => {
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

// R2 이미지 URL 추출 함수
export function extractR2ImageUrls(content: string, r2PublicUrl: string): string[] {
  if (!content || typeof content !== 'string') {
    return [];
  }

  // HTML img 태그에서 src 속성 추출
  const imgSrcRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  const imgMatches = content.match(imgSrcRegex) || [];
  
  // src 속성 값만 추출
  const imgUrls: string[] = [];
  imgMatches.forEach(match => {
    const srcMatch = match.match(/src=["']([^"']+)["']/i);
    if (srcMatch && srcMatch[1]) {
      imgUrls.push(srcMatch[1]);
    }
  });

  // R2 URL만 필터링
  return imgUrls.filter(url => url.startsWith(r2PublicUrl));
}

// R2에서 이미지를 삭제하는 비동기 함수
export async function deleteImagesFromR2(content: string, env: any): Promise<void> {
  try {
    if (!content || typeof content !== 'string') {
      console.log('삭제할 이미지가 없습니다: content가 비어있거나 문자열이 아님');
      return;
    }

    // 정확한 이미지 URL 추출
    const matches = extractR2ImageUrls(content, env.R2_PUBLIC_URL);
    
    if (!matches || matches.length === 0) {
      console.log('삭제할 R2 이미지 URL을 찾을 수 없습니다');
      return;
    }

    console.log(`삭제할 이미지 URL 개수: ${matches.length}`);
    console.log('삭제할 이미지 URL들:', matches);

    const S3 = createR2Client(env);
    if (!S3) {
      throw new Error('R2 클라이언트 생성 실패');
    }

    // 각 이미지 파일을 비동기로 삭제
    const deletePromises = matches.map(async (url) => {
      try {
        // URL에서 파일 경로 추출
        const filePath = url.replace(env.R2_PUBLIC_URL + '/', '');
        
        console.log(`R2 이미지 삭제 시도: ${filePath}`);
        
        await S3.send(new DeleteObjectCommand({
          Bucket: env.R2_BUCKET_NAME,
          Key: filePath,
        }));
        
        console.log(`R2 이미지 삭제 성공: ${filePath}`);
        return { success: true, path: filePath };
      } catch (error) {
        console.error(`R2 이미지 삭제 실패: ${url}`, error);
        return { success: false, path: url, error };
      }
    });

    // 모든 삭제 작업을 병렬로 실행
    const results = await Promise.all(deletePromises);
    
    // 결과 요약
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    console.log(`R2 이미지 삭제 완료: 성공 ${successCount}개, 실패 ${failCount}개`);
    
    if (failCount > 0) {
      const failedPaths = results.filter(r => !r.success).map(r => r.path);
      console.error('삭제 실패한 이미지들:', failedPaths);
    }
  } catch (error) {
    console.error('R2 이미지 삭제 중 오류:', error);
    throw error; // 상위에서 처리할 수 있도록 에러를 다시 던짐
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
