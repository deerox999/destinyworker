import { createPrismaClient } from "../../common/prismaUtils";
import { Context } from "hono";

export interface CelebrityRequestData {
  name: string;
  description: string;
  birthDate: string;
  occupation: string;
}

/**
 * 유명인물 요청 생성
 */
export async function createCelebrityRequest(
  c: Context
): Promise<Response> {
  try {
    const prisma = createPrismaClient(c.env.DB);
    const body = (await c.req.json()) as CelebrityRequestData;

    // 필수 필드 검증
    if (
      !body.name ||
      !body.description ||
      !body.birthDate ||
      !body.occupation
    ) {
      return c.json(
        {
          error: "name, description, birthDate, occupation은 필수 항목입니다.",
        },
        400
      );
    }

    // 생년월일 형식 검증 (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(body.birthDate)) {
      return c.json(
        { error: "birthDate는 YYYY-MM-DD 형식이어야 합니다." },
        400
      );
    }

    // 유명인물 요청 생성
    const celebrityRequest = await prisma.celebrityRequest.create({
      data: {
        name: body.name,
        description: body.description,
        birthDate: body.birthDate,
        occupation: body.occupation,
      },
    });

    return c.json(
      {
        success: true,
        data: celebrityRequest,
        message: "유명인물 요청이 성공적으로 등록되었습니다.",
      },
      201
    );
  } catch (error) {
    console.error("Celebrity request creation error:", error);
    return c.json(
      {
        error: "유명인물 요청 등록 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "알 수 없는 오류",
      },
      500
    );
  }
}
