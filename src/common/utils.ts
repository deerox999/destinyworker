// CORS 헤더 추가 함수
export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

// JSON 응답 생성 함수
export function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

// HTML 응답 생성 함수
export function htmlResponse(html: string, status = 200) {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html",
      ...corsHeaders(),
    },
  });
}

export function route(
  url: URL,
  request: Request,
  path: string,
  method: string
) {
  return url.pathname === path && request.method === method ? true : false;
}

// export async function route2(
//   url: URL,
//   request: Request,
//   path: string,
//   method: string,
//   doSomething: () => Promise<Response>
// ): Promise<Response | false> {
//   const isMatch = url.pathname === path && request.method === method;
//   if (isMatch) {
//     return await doSomething();
//   }
//   return false;
// }
