export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    /**
 * @cf/qwen/qwen2.5-coder-32b-instruct는 'Coder'로서의 논리적, 구조적 사고에 강점이 있습니다. 
 * 사주 명리학도 일종의 규칙과 패턴을 따르는 시스템이므로, 이 점이 파인튜닝 시 긍정적인 영향을 줄 수 있습니다.
 * 
 * price
 * 사용량은 10000개의 뉴런 당 US$0.11의 비율을 기준으로 청구서에 뉴런으로 표시됩니다.
 * US$0.66 per M input tokens
 * US$1 per M output tokens
 * 
 * 
 * 클라우드플레어 Workers AI는 Workers Paid 플랜을 사용해야 Neurons 기반의 AI 모델 추론 기능을 사용할 수 있습니다. 
 * Workers Paid 플랜의 기본 요금은 월 $5 USD이며, 이 안에 특정 양의 사용량이 포함되어 있습니다.
Workers AI는 Workers Platform의 일부이므로, Workers Paid 플랜을 구독하면 Workers AI 사용량에 대해 월 10,000 뉴런의 무료 할당량이 제공됩니다.
즉, 월 5달러를 지불하면 AI 모델 추론에 사용할 수 있는 10,000 뉴런을 기본으로 제공받고, 이 할당량을 초과하는 사용량에 대해서는 추가 비용이 발생합니다.
정확한 무료 할당량은 다음과 같습니다:
Workers AI: 월 10,000 뉴런 (Workers Paid 플랜에 포함)
이 10,000 뉴런은 모델의 종류와 입력/출력 토큰 양에 따라 다르게 소모됩니다. 예를 들어, @cf/qwen/qwen2.5-coder-32b-instruct 모델의 경우:
100만 입력 토큰당 60,000 뉴런
100만 출력 토큰당 90,909 뉴런
사용자님의 시나리오(7000 입력 토큰, 15000 출력 토큰)를 대략적으로 계산해 보면:
입력 토큰 뉴런: (7,000 / 1,000,000) * 60,000 = 0.42 뉴런
출력 토큰 뉴런: (15,000 / 1,000,000) * 90,909 = 약 1.36 뉴런
총 한 번의 요청당 약 1.78 뉴런이 소모됩니다.
월 10,000 뉴런의 무료 할당량으로 이 요청을 약 5,617번 (10,000 / 1.78) 수행할 수 있습니다.
따라서, 월 $5의 기본 요금 내에서 꽤 많은 양의 사주 분석 요청을 처리할 수 있으며, 이 할당량을 초과해야만 추가 비용이 발생합니다
.
 * @param newSajuData 
 * @returns 
 */
    if (url.pathname === "/api/detailed-fortune-telling" && request.method === "POST") {
      try {
        const { systemPrompt, userPrompt, max_tokens, temperature, model }: any = await request.json();

        return await env.AI.run(model || "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b", {
          messages: [ 
            { role: "system", content:systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: max_tokens || 1000,
          temperature: temperature || 0.3, // 더 일관된 응답을 위해 낮춤
        }).then((res) => {
          console.log(`AI 응답(model:${model}) :`, res);
          return new Response(JSON.stringify(res), {
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type",
            },
          });
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
