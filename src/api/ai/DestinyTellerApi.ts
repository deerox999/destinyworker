/*
    입력 토큰 비용 계산:
        총 입력 토큰 수: 16,000 토큰
        100만 토큰당 비용: $0.075
        입력 비용 = (0.075/1,000,000)∗16,000
        입력 비용 = 0.000075∗16
        입력 비용 = $0.0012
        
    총 출력 토큰 수: 500 토큰
        100만 토큰당 비용: $0.250
        출력 비용 = (0.250/1,000,000)∗500
        출력 비용 = 0.00025∗0.5
        출력 비용 = $0.000125

    총 예상 비용 (1회 요청 시):
        총 비용 = 입력 비용 + 출력 비용
        총 비용 = $0.0012 + 0.000125
        총 비용 = $0.001325
*/
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 🌟 새로운 전문적인 상세 사주 풀이 API
    if (
      url.pathname === "/api/detailed-fortune-telling" &&
      request.method === "POST"
    ) {
      try {
        const 사주원국: any = await request.json();

        const professionalPrompt = `
당신은 30년 경력의 전문 사주명리학자입니다.
다음의 상세한 사주 정보를 바탕으로 정확하고 전문적인 운세를 풀이해 주세요.

=== 사주명리학 해석 가이드라인 ===
- 오행 편중: 25% 이상이면 강함, 15% 이하면 약함으로 판단

=== 생년월일 정보 ===
${사주원국.정보.생년월일}

=== 사주 정보 ===
${사주원국.사주}

=== 공망 정보 ===
${`일주(${사주원국.정보?.공망?.일주공망
  .map((item: any) => item.한자)
  .join("")})`}
${`일주(${사주원국.정보?.공망?.년주공망
  .map((item: any) => item.한자)
  .join("")})`}

=== 오행 비중 ===
${Object.entries(사주원국.정보?.오행?.오행별비중 || {}).map(
  ([key, value]: any, idx: number) => {
    return `${key}:value `;
  }
)}

=== 삼재 정보 ===
들삼재:${사주원국.정보?.삼재.들삼재} 눌삼재:${사주원국.정보?.삼재.눌삼재} 날삼재:${사주원국.정보?.삼재.날삼재}
`;

        const enhancedPrompt = `
${professionalPrompt}

**분석 시 중점 사항:**
- 지장간을 통한 숨겨진 기운과 잠재력 해석
- 십이운성으로 각 기둥의 생명력 상태와 흐름 파악  
- 형충파해 관계를 통한 길흉과 변화 시기 판단
- 신살과 십이신살의 복합적 영향과 특수 능력
- 대운과 현재 사주의 상호작용 및 시기별 운세
- 납음오행을 통한 추가적 성격과 운명 분석

위 모든 정보와 가이드라인을 종합하여 다음 항목별로 전문적이고 정확한 해석을 제공해 주세요:

1. 전반적 운세: 일간과 십성, 오행 균형, 신강약을 고려한 전체적인 운세
2. 재물운: 재성과 식상의 관계, 오행 흐름, 신강약에 따른 재물운
3. 건강운: 일간의 강약과 오행 편중을 고려한 건강 상태
4. 애정운: 관성과 재성의 배치, 신살을 고려한 인간관계
5. 종합 조언: 신강약과 용신을 고려한 실용적 조언

응답은 반드시 다음 JSON 형식으로 제공해주세요.
{
  "운세": "일간 기준 십성과 오행 분석을 바탕으로 한 전체 운세 (3-4문장)",
  "재물운": "재성과 식상 관계, 오행 흐름을 통한 재물운 분석 (3-4문장)",
  "건강운": "일간 강약과 오행 편중을 고려한 건강 관리법 (3-4문장)",
  "애정운": "관성과 재성 배치, 신살을 통한 인간관계 조언 (3-4문장)",
  "종합_조언": "신강약과 명리학적 원리에 따른 실용적 조언 (4-5문장)"
}

- 전문적인 사주명리학 용어를 활용하되 이해하기 쉽게 설명
- 구체적이고 실용적인 조언 포함
- 긍정적이면서도 현실적인 해석 제공`;

        // 🤖 안정적인 모델 사용 (정확성과 전문성 향상)
        const aiResponse = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
          messages: [
            {
              role: "system",
              content:
                "당신은 30년 경력의 전문 사주명리학자입니다. 정확한 사주명리학 지식을 바탕으로 JSON 형식으로 한국어 응답만 제공하세요.",
            },
            {
              role: "user",
              content: enhancedPrompt,
            },
          ],
          max_tokens: 1000,
          temperature: 0.3, // 더 일관된 응답을 위해 낮춤
        });

        // 🔄 JSON 파싱 로직
        let parsedResult: any;
        try {
          let responseText = "";

          if (typeof aiResponse === "object" && "response" in aiResponse) {
            responseText = (aiResponse as any).response;
          } else if (typeof aiResponse === "string") {
            responseText = aiResponse;
          } else {
            responseText = JSON.stringify(aiResponse);
          }

          const jsonMatch = responseText.match(/```json\s*(.*?)\s*```/s) || responseText.match(/(\{.*\})/s);

          if (jsonMatch) {
            parsedResult = JSON.parse(jsonMatch[1]);
          } else {
            parsedResult = JSON.parse(responseText);
          }
        } catch (parseError) {
          console.error("JSON 파싱 오류:", parseError);
          parsedResult = { // 파싱 실패 시 전문적인 기본 응답
            운세: "현재 시스템 점검 중으로 상세한 명리학적 분석을 제공할 수 없습니다. 일간의 기본 특성을 고려할 때 꾸준한 노력이 결실을 맺을 시기입니다.",
            재물운: "현재 재성의 흐름이 안정적이나 무리한 투자보다는 기존 자산의 관리에 집중하시기 바랍니다.",
            건강운: "오행의 균형을 고려할 때 규칙적인 생활 리듬과 적절한 운동을 통해 건강을 유지하시기 바랍니다.",
            애정운: "인간관계에서 진실함과 포용력을 발휘하시면 좋은 결과가 있을 것입니다.",
            종합_조언: "현재 신강약 상태를 고려할 때 차분하고 신중한 접근이 필요합니다. 급하게 변화를 추구하기보다는 단계적인 발전을 도모하시기 바랍니다.",
          };
        }

        return new Response(JSON.stringify(parsedResult), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      } catch (error) {
        console.error("상세 사주 풀이 오류:", error);

        return new Response(
          JSON.stringify({
            error: "상세 사주 풀이 중 오류가 발생했습니다",
            details: error instanceof Error ? error.message : "알 수 없는 오류",
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
