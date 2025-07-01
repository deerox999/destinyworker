export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    /**
     * Cloudflare Workers AI 고급 사용법 가이드
     *
     * 1. AI Gateway: 요청 로깅, 캐싱, 재시도, 폴백 모델 설정 가능
     * 2. 타입 안전성: 모델별 특화된 입력/출력 타입 활용
     * 3. 다양한 옵션: returnRawResponse, stream, 모델별 특수 파라미터
     * 4. AutoRAG: 자동 검색 증강 생성 (RAG) 기능
     * 5. 모델 검색: 사용 가능한 모델 동적 탐색
     *
     * @cf/qwen/qwen2.5-coder-32b-instruct는 'Coder'로서의 논리적, 구조적 사고에 강점이 있습니다.
     * 사주 명리학도 일종의 규칙과 패턴을 따르는 시스템이므로, 이 점이 파인튜닝 시 긍정적인 영향을 줄 수 있습니다.
     *
     * price
     * 사용량은 10000개의 뉴런 당 US$0.11의 비율을 기준으로 청구서에 뉴런으로 표시됩니다.
     * US$0.66 per M input tokens
     * US$1 per M output tokens
     *
     * Workers AI: 월 10,000 뉴런 (Workers Paid 플랜에 포함)
     * 예상 사용량: 한 번의 요청당 약 1.78 뉴런
     * 월 무료 할당량으로 약 5,617번의 요청 처리 가능
     */

    if (
      url.pathname === "/api/detailed-fortune-telling" &&
      request.method === "POST"
    ) {
      try {
        const {
          systemPrompt,
          userPrompt,
          max_tokens,
          temperature,
          model,
          // 고급 옵션들
          useGateway = false, // AI Gateway 사용 여부
          gatewayId, // Gateway ID (로깅/모니터링용)
          returnRawResponse = false, // 원시 응답 반환 여부
          stream = false, // 스트리밍 응답 여부
          top_p, // 핵 샘플링 파라미터
          frequency_penalty, // 빈도 페널티
          presence_penalty, // 존재 페널티
          seed, // 재현 가능한 결과를 위한 시드
        }: any = await request.json();

        // AI 인스턴스 준비 (Gateway 사용 시 향상된 기능 제공)
        let aiInstance: any = env.AI;

        if (
          useGateway &&
          gatewayId &&
          typeof gatewayId === "string" &&
          gatewayId.trim().length > 0
        ) {
          try {
            console.log("AI Gateway 초기화:", gatewayId);
            aiInstance = env.AI.gateway(gatewayId.trim());
            console.log("AI Gateway 초기화 성공");
          } catch (gatewayError) {
            console.warn(
              "AI Gateway 초기화 실패, 기본 AI 인스턴스 사용:",
              gatewayError
            );
            aiInstance = env.AI; // 폴백으로 기본 AI 사용
          }
        } else if (useGateway) {
          console.warn(
            "Gateway ID가 유효하지 않습니다. 기본 AI 인스턴스를 사용합니다."
          );
        }

        // 사용할 모델 결정 (폴백 체계 포함)
        const primaryModel = model || "@cf/qwen/qwen2.5-coder-32b-instruct";
        const fallbackModels = [
          "@cf/qwen/qwen2.5-coder-32b-instruct", // 논리적 사고에 강함
          "@cf/meta/llama-3.1-8b-instruct", // 일반적인 대화형 모델
          "@cf/google/gemma-7b-it", // 효율적인 추론 모델
          "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
        ];

        // AI Gateway는 파라미터에 대해 더 엄격하므로 기본/고급 옵션 분리
        const baseOptions: any = {
          messages: [
            {
              role: "system",
              content: systemPrompt || "당신은 전문 사주명리학자입니다.",
            },
            { role: "user", content: userPrompt || "사주 분석을 해주세요." },
          ],
          max_tokens: Math.max(1, Math.min(max_tokens || 1500, 32000)),
          temperature: Math.max(
            0,
            Math.min(temperature !== undefined ? temperature : 0.3, 2.0)
          ),
        };

        // Gateway 사용 시와 아닐 때 다른 옵션 구성
        let advancedOptions: any;

        if (useGateway) {
          // Gateway 사용 시: 기본 파라미터만 사용 (안정성 우선)
          console.log("Gateway 모드: 기본 파라미터만 사용");
          advancedOptions = { ...baseOptions };

          // Gateway에서도 안전한 파라미터만 추가
          if (stream === true) {
            advancedOptions.stream = true;
          }
        } else {
          // 일반 모드: 모든 고급 파라미터 사용 가능
          console.log("일반 모드: 고급 파라미터 사용");
          advancedOptions = { ...baseOptions };

          // 고급 파라미터들을 조건부로 추가 (유효한 값만)
          if (typeof top_p === "number" && top_p >= 0 && top_p <= 1) {
            advancedOptions.top_p = top_p;
          }
          if (
            typeof frequency_penalty === "number" &&
            frequency_penalty >= -2 &&
            frequency_penalty <= 2
          ) {
            advancedOptions.frequency_penalty = frequency_penalty;
          }
          if (
            typeof presence_penalty === "number" &&
            presence_penalty >= -2 &&
            presence_penalty <= 2
          ) {
            advancedOptions.presence_penalty = presence_penalty;
          }
          if (typeof seed === "number" && Number.isInteger(seed)) {
            advancedOptions.seed = seed;
          }
          if (stream === true) {
            advancedOptions.stream = true;
          }
          if (returnRawResponse === true) {
            advancedOptions.returnRawResponse = true;
          }
        }

        console.log(
          "AI 요청 파라미터:",
          JSON.stringify(
            {
              model: primaryModel,
              options: advancedOptions,
              useGateway: useGateway,
              gatewayId: gatewayId,
            },
            null,
            2
          )
        );

        const result = await aiInstance.run(
          primaryModel as any,
          advancedOptions
        );

        console.log(
          "AI 응답 타입:",
          typeof result,
          "instanceof Response:",
          result instanceof Response
        );
        console.log("AI 응답 내용:", result);
        console.log("AI 응답 constructor:", result?.constructor?.name);

        // 스트리밍 응답 처리 - ReadableStream 또는 Response 객체 감지
        if (
          stream &&
          (result instanceof Response ||
            result instanceof ReadableStream ||
            result?.constructor?.name === "ReadableStream")
        ) {
          console.log("스트리밍 응답 처리");

          // ReadableStream인 경우 Response로 래핑
          if (
            result instanceof ReadableStream ||
            result?.constructor?.name === "ReadableStream"
          ) {
            console.log("ReadableStream을 Response로 래핑");

            return new Response(result, {
              status: 200,
              headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
                "X-AI-Model": primaryModel,
                "X-Gateway-Enabled": useGateway.toString(),
                "X-Stream-Response": "true",
              },
            });
          }

          // Response 객체인 경우
          if (result instanceof Response) {
            console.log("Response 객체 스트리밍 처리");
            const headers = new Headers(result.headers);
            headers.set("X-AI-Model", primaryModel);
            headers.set("X-Gateway-Enabled", useGateway.toString());
            headers.set("Access-Control-Allow-Origin", "*");
            headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
            headers.set("Access-Control-Allow-Headers", "Content-Type");

            return new Response(result.body, {
              status: result.status,
              headers: headers,
            });
          }
        }

        // 스트리밍이 아닌 응답 처리
        console.log("일반 응답 처리");

        // result가 null이거나 빈 객체인 경우 검증
        if (
          !result ||
          (typeof result === "object" && Object.keys(result).length === 0)
        ) {
          console.warn("AI 응답이 비어있습니다:", result);
          throw new Error("AI 모델로부터 유효한 응답을 받지 못했습니다.");
        }

        /**
         * 응답 후처리 및 메타데이터 추가
         * - 사용된 모델 정보
         * - 토큰 사용량 (가능한 경우)
         * - 응답 시간 측정
         * - 품질 지표
         */
        const enhancedResponse = {
          ...(result || {}), // result가 null/undefined일 경우 빈 객체 사용
          metadata: {
            model_used: primaryModel,
            gateway_enabled: useGateway,
            timestamp: new Date().toISOString(),
            stream_enabled: stream,
            response_type: typeof result,
            // 추가 메타데이터는 여기에
          },
        };

        return new Response(JSON.stringify(enhancedResponse), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            // 사용된 모델 정보를 헤더로 전달
            "X-AI-Model": primaryModel,
            "X-Gateway-Enabled": useGateway.toString(),
          },
        });
      } catch (error) {
        console.error("상세 사주 풀이 오류:", error);
        return new Response(
          JSON.stringify({
            message: "상세 사주 풀이 중 오류가 발생했습니다",
            error: error,
            details: error instanceof Error ? error.message : "알 수 없는 오류",
            timestamp: new Date().toISOString(),
            // 디버깅을 위한 추가 정보
            debug_info: {
              url: request.url,
              method: request.method,
            },
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

    // 사용 가능한 AI 모델 목록 조회 엔드포인트
    if (url.pathname === "/api/ai-models" && request.method === "GET") {
      try {
        /**
         * 동적 모델 검색 기능
         * - 현재 사용 가능한 모델들을 실시간으로 조회
         * - 모델별 특성과 가격 정보 제공
         * - 사주 분석에 적합한 모델 추천
         */
        const searchParams = new URL(request.url).searchParams;
        const category = searchParams.get("category"); // 예: 'text-generation', 'embedding' 등
        const provider = searchParams.get("provider"); // 예: 'meta', 'google', 'openai' 등

        const modelsSearchParams: any = {};
        if (category) modelsSearchParams.task = category;
        if (provider) modelsSearchParams.provider = provider;

        const availableModels = await env.AI.models(modelsSearchParams);

        // 사주 분석에 특히 적합한 모델들을 표시
        const recommendedForSaju = availableModels.map((model: any) => ({
          ...(model || {}), // model이 null/undefined일 경우 빈 객체 사용
          recommended_for_saju:
            model?.name?.includes("coder") ||
            model?.name?.includes("instruct") ||
            model?.description?.toLowerCase()?.includes("reasoning"),
          saju_suitability_score: calculateSajuSuitability(model || {}),
        }));

        return new Response(
          JSON.stringify({
            total_count: availableModels.length,
            recommended_models: recommendedForSaju
              .filter((m: any) => m.recommended_for_saju)
              .sort(
                (a: any, b: any) =>
                  b.saju_suitability_score - a.saju_suitability_score
              )
              .slice(0, 5),
          }),
          {
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      } catch (error) {
        console.error("모델 목록 조회 오류:", error);
        return new Response(JSON.stringify({ error: "모델 목록 조회 실패" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
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

/**
 * 사주 분석에 대한 모델 적합성 점수 계산
 * @param model 모델 정보
 * @returns 0-100 사이의 점수
 */
function calculateSajuSuitability(model: any): number {
  // model이 null/undefined인 경우 기본 점수 반환
  if (!model || typeof model !== "object") {
    return 30; // 기본 최소 점수
  }

  let score = 50; // 기본 점수

  const name = (model.name || "").toLowerCase();
  const description = (model.description || "").toLowerCase();

  // 논리적 사고에 강한 모델들 가점
  if (name.includes("coder")) score += 20;
  if (name.includes("instruct")) score += 15;
  if (description.includes("reasoning")) score += 15;
  if (description.includes("logic")) score += 10;

  // 대화형 모델 가점
  if (name.includes("chat") || name.includes("assistant")) score += 10;

  // 큰 모델일수록 복잡한 사주 분석에 유리
  try {
    const parameterMatch = name.match(/(\d+)b/);
    if (parameterMatch && parameterMatch[1]) {
      const params = parseInt(parameterMatch[1]);
      if (!isNaN(params)) {
        if (params >= 30) score += 15;
        else if (params >= 13) score += 10;
        else if (params >= 7) score += 5;
      }
    }
  } catch (error) {
    console.warn("파라미터 매칭 중 오류:", error);
  }

  return Math.min(100, Math.max(0, score));
}
