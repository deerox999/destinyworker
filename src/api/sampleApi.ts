// 샘플 사용자 데이터 (실제로는 데이터베이스를 사용)
let users = [
  { id: 1, name: "김철수", email: "chulsoo@example.com", createdAt: "2024-01-01T00:00:00Z" },
  { id: 2, name: "이영희", email: "younghee@example.com", createdAt: "2024-01-02T00:00:00Z" },
  { id: 3, name: "박민수", email: "minsu@example.com", createdAt: "2024-01-03T00:00:00Z" }
];

let nextUserId = 4;

// 간단한 사주 계산 함수 (실제로는 복잡한 로직)
function calculateSaju(year: number, month: number, day: number, hour: number) {
  const 천간 = ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"];
  const 지지 = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"];
  
  const 년천간 = 천간[(year - 4) % 10];
  const 년지지 = 지지[(year - 4) % 12];
  const 월천간 = 천간[(month - 1) % 10];
  const 월지지 = 지지[(month - 1) % 12];
  const 일천간 = 천간[(day - 1) % 10];
  const 일지지 = 지지[(day - 1) % 12];
  const 시천간 = 천간[Math.floor(hour / 2) % 10];
  const 시지지 = 지지[Math.floor(hour / 2) % 12];
  
  return {
    년주: `${년천간}${년지지}`,
    월주: `${월천간}${월지지}`,
    일주: `${일천간}${일지지}`,
    시주: `${시천간}${시지지}`,
    대운: [`${천간[0]}${지지[0]}`, `${천간[1]}${지지[1]}`, `${천간[2]}${지지[2]}`]
  };
}

// JSON 응답 생성 함수
function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

// 샘플 API 핸들러들
export const sampleApiHandlers = {
  // 사용자 목록 조회
  async getUsers(request: Request): Promise<Response> {
    return jsonResponse(users);
  },

  // 새 사용자 생성
  async createUser(request: Request): Promise<Response> {
    const body = await request.json() as { name: string; email: string };
    
    if (!body.name || !body.email) {
      return jsonResponse({ error: "이름과 이메일은 필수입니다." }, 400);
    }

    const newUser = {
      id: nextUserId++,
      name: body.name,
      email: body.email,
      createdAt: new Date().toISOString(),
    };

    users.push(newUser);
    return jsonResponse(newUser, 201);
  },

  // 특정 사용자 조회
  async getUserById(request: Request, userId: number): Promise<Response> {
    const user = users.find(u => u.id === userId);
    
    if (!user) {
      return jsonResponse({ error: "사용자를 찾을 수 없습니다." }, 404);
    }

    return jsonResponse(user);
  },

  // 사주 계산
  async calculateSaju(request: Request): Promise<Response> {
    const body = await request.json() as {
      year: number;
      month: number;
      day: number;
      hour: number;
      minute?: number;
    };

    if (!body.year || !body.month || !body.day || body.hour === undefined) {
      return jsonResponse({ 
        error: "년, 월, 일, 시간은 필수입니다." 
      }, 400);
    }

    const result = calculateSaju(body.year, body.month, body.day, body.hour);
    return jsonResponse(result);
  },

  // 헬스체크
  async healthCheck(request: Request): Promise<Response> {
    return jsonResponse({
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: "1.0.0"
    });
  }
}; 