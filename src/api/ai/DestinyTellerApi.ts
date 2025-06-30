interface SajuData {
  year: number;
  month: number;
  day: number;
  hour: number;
  gender: string;
  isLunar?: boolean;
}

interface AiResponse {
  운세: string;
  재물운: string;
  건강운: string;
  애정운: string;
  종합_조언: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/fortune-telling" && request.method === "POST") {
      try {
        const sajuData: SajuData = await request.json(); // 프론트엔드에서 받은 사주 데이터
        // --- 여기부터 AI 풀이 로직 시작 ---
        // 🚨 중요: 사주 데이터를 바탕으로 AI 프롬프트 구성
        const prompt = `
당신은 전문적인 사주 풀이 상담가입니다. 다음 사주 데이터를 바탕으로 상세한 운세, 재물운, 건강운, 애정운을 풀이하고, 명확한 조언을 덧붙여 주세요.

사주 정보:
- 생년월일: ${sajuData.year}년 ${sajuData.month}월 ${sajuData.day}일 ${
          sajuData.hour
        }시
- 성별: ${sajuData.gender}
- 음력/양력: ${sajuData.isLunar ? "음력" : "양력"}

각 항목별로 구체적이고 실용적인 조언을 제공해 주세요.`;

        // AI 모델 호출 (품질과 비용의 균형을 맞춘 모델 사용)
        const enhancedPrompt = `${prompt}

중요: 응답은 반드시 유효한 JSON 형식으로만 제공해주세요. 예시:
{
  "운세": "구체적이고 긍정적인 운세 설명을 한국어로 작성",
  "재물운": "재정과 투자에 대한 실용적인 조언을 한국어로 작성",
  "건강운": "건강 관리 방법과 주의사항을 한국어로 작성", 
  "애정운": "연애와 인간관계에 대한 조언을 한국어로 작성",
  "종합_조언": "전반적인 조언과 권고사항을 한국어로 작성"
}

- 한국어로만 응답하세요
- JSON 형식을 정확히 지켜주세요
- 각 항목당 2-3문장으로 구체적으로 작성하세요`;

        const aiResponse = await env.AI.run("@cf/meta/llama-3.2-3b-instruct", {
          messages: [
            {
              role: "system",
              content:
                "당신은 한국의 전문 사주명리학자입니다. 정확한 JSON 형식으로 한국어로만 응답하세요.",
            },
            {
              role: "user",
              content: enhancedPrompt,
            },
          ],
          max_tokens: 800,
          temperature: 0.5,
        });

        // --- AI 풀이 로직 끝 ---

        // AI 응답에서 JSON 추출 및 파싱
        let parsedResult: AiResponse;
        try {
          let responseText = "";

          // AI 응답에서 텍스트 추출 (실제 응답 구조에 맞게 수정)
          if (typeof aiResponse === "object" && "response" in aiResponse) {
            responseText = (aiResponse as any).response;
          } else if (typeof aiResponse === "string") {
            responseText = aiResponse;
          } else {
            responseText = JSON.stringify(aiResponse);
          }

          // JSON 블록 추출 (```json과 ``` 사이의 내용 또는 { }로 감싸진 내용)
          const jsonMatch =
            responseText.match(/```json\s*(.*?)\s*```/s) ||
            responseText.match(/(\{.*\})/s);

          if (jsonMatch) {
            parsedResult = JSON.parse(jsonMatch[1]);
          } else {
            // JSON이 추출되지 않으면 직접 파싱 시도
            parsedResult = JSON.parse(responseText);
          }

          // 응답 검증
          if (
            !parsedResult.운세 ||
            !parsedResult.재물운 ||
            !parsedResult.건강운 ||
            !parsedResult.애정운 ||
            !parsedResult.종합_조언
          ) {
            throw new Error("응답에 필수 항목이 누락되었습니다");
          }
        } catch (parseError) {
          console.error("JSON 파싱 오류:", parseError);
          // 파싱 실패 시 기본 응답 제공
          parsedResult = {
            운세: "현재 AI 시스템에 일시적인 문제가 있어 상세한 운세를 제공할 수 없습니다.",
            재물운:
              "재정 관리에 신중함을 기하시고, 무리한 투자는 피하시기 바랍니다.",
            건강운:
              "규칙적인 생활과 적절한 운동을 통해 건강을 관리하시기 바랍니다.",
            애정운:
              "주변 사람들과의 소통을 늘리고 진실한 마음으로 대하시기 바랍니다.",
            종합_조언:
              "차분한 마음으로 현재 상황을 분석하고 점진적인 개선을 추구하시기 바랍니다.",
          };
        }

        // (선택 사항) 풀이 결과를 D1에 저장
        // 예: await env.DB.prepare("INSERT INTO fortune_logs (saju, result) VALUES (?, ?)").bind(JSON.stringify(sajuData), JSON.stringify(parsedResult)).run();

        // 프론트엔드로 AI 풀이 결과 반환
        return new Response(JSON.stringify(parsedResult), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*", // 실제 배포 시에는 특정 도메인으로 제한
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      } catch (error) {
        console.error("AI 풀이 중 오류 발생:", error);

        let errorMessage = "AI 풀이 오류 발생";
        let errorDetails = "알 수 없는 오류";

        if (error instanceof Error) {
          errorDetails = error.message;
        }

        return new Response(
          JSON.stringify({
            error: errorMessage,
            details: errorDetails,
          }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }
    }

    // CORS 프리플라이트 요청 처리 (필수!)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // 그 외 요청 처리
    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
