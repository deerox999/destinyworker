import { PrismaD1 } from '@prisma/adapter-d1';
import { PrismaClient } from '@prisma/client';

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
  request: Request,
  env: any,
  params: any
): Promise<Response> {
  try {
    const adapter = new PrismaD1(env.DB);
    const prisma = new PrismaClient({ adapter });

    const body = await request.json() as CelebrityRequestData;
    
    // 필수 필드 검증
    if (!body.name || !body.description || !body.birthDate || !body.occupation) {
      return new Response(
        JSON.stringify({ 
          error: 'name, description, birthDate, occupation은 필수 항목입니다.' 
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // 생년월일 형식 검증 (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(body.birthDate)) {
      return new Response(
        JSON.stringify({ 
          error: 'birthDate는 YYYY-MM-DD 형식이어야 합니다.' 
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
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

    return new Response(
      JSON.stringify({
        success: true,
        data: celebrityRequest,
        message: '유명인물 요청이 성공적으로 등록되었습니다.'
      }),
      { 
        status: 201,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );

  } catch (error) {
    console.error('Celebrity request creation error:', error);
    return new Response(
      JSON.stringify({ 
        error: '유명인물 요청 등록 중 오류가 발생했습니다.',
        details: error instanceof Error ? error.message : '알 수 없는 오류'
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * 유명인물 요청 목록 조회 (관리자용)
 */
export async function getCelebrityRequests(
  request: Request,
  env: any,
  params: any
): Promise<Response> {
  try {
    const adapter = new PrismaD1(env.DB);
    const prisma = new PrismaClient({ adapter });

    const requests = await prisma.celebrityRequest.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: requests
      }),
      { 
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );

  } catch (error) {
    console.error('Celebrity requests fetch error:', error);
    return new Response(
      JSON.stringify({ 
        error: '유명인물 요청 목록 조회 중 오류가 발생했습니다.',
        details: error instanceof Error ? error.message : '알 수 없는 오류'
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

export const celebrityRequestApiHandlers = {
  createCelebrityRequest,
  getCelebrityRequests,
}; 