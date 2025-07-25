// ===== Gemini AI API 사용 예시 =====
// Base URL: https://your-domain.com/api/ai
// 주의: 모든 API는 인증이 필요합니다 (JWT 토큰 포함)

// ===== 0. 테스트용 간단한 Gemini API =====
async function testWithSystemPrompt() {
    const response = await fetch('/api/ai/test-gemini', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer YOUR_JWT_TOKEN'
        },
        body: JSON.stringify({
            systemPrompt: "당신은 친절하고 유머러스한 AI 어시스턴트입니다. 항상 재미있게 답변해주세요.",
            userPrompt: "오늘 날씨가 어때요?"
        })
    });

    const data = await response.json();
    console.log('systemPrompt 포함 테스트 결과:', data);
    // Response: {
    //   success: true,
    //   response: "오늘 날씨에 대해 재미있게 답변합니다...",
    //   model: "gemini-2.5-flash",
    //   timestamp: "2023-01-01T00:00:00.000Z"
    // }
}

// ===== 1. 기본 사주 분석 =====

// 1-2. 사주 정보를 포함한 상세 분석 (첫 대화)
async function detailedSajuAnalysisWithData() {
    const response = await fetch('/api/ai/gemini-saju-analysis', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer YOUR_JWT_TOKEN'
        },
        body: JSON.stringify({
            model: "gemini-2.5-pro-latest",
            userPrompt: "제 사주를 자세히 분석해주세요.",
            systemPrompt: "당신은 20년 경력의 사주명리 전문가입니다. 구체적이고 실용적인 조언을 제공해주세요.",
            sajuData: {
                // 방대한 계산된 사주 데이터
            },
            generationConfig: {
                temperature: 0.7,
                topP: 0.9,
                topK: 40,
                maxOutputTokens: 4096 // Gemini 2.5는 더 긴 응답 지원
            },
            safetySettings: [
                {
                    category: "HARM_CATEGORY_HARASSMENT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    category: "HARM_CATEGORY_HATE_SPEECH",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                }
            ]
        })
    });

    const data = await response.json();
    console.log('상세 사주 분석 결과:', data);
    // Response: {
    //   conversationId: "a1b2c3d4-e5f6-7890-1234-567890abcdef",
    //   answer: "안녕하세요! 계산된 사주 정보를 바탕으로 상세한 분석을 제공해드리겠습니다...",
    //   metadata: { ... }
    // }
    
    return data.conversationId; // 다음 대화에서 사용할 ID
}

// ===== 2. 대화 기록을 포함한 연속 분석 =====

// 2-1. 새로운 대화 시작
async function startNewConversation() {
    const response = await fetch('/api/ai/gemini-saju-analysis', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer YOUR_JWT_TOKEN'
        },
        body: JSON.stringify({
            userPrompt: "제 사주는 어떤가요? 1990년 3월 15일 오후 2시에 태어났어요.",
            systemPrompt: "당신은 전문 사주명리학자입니다. 친절하고 상세하게 분석해주세요."
        })
    });

    const data = await response.json();
    console.log('새 대화 시작 결과:', data);
    // Response: {
    //   conversationId: "a1b2c3d4-e5f6-7890-1234-567890abcdef",
    //   answer: "안녕하세요! 1990년 3월 15일 오후 2시 출생하신 분의 사주를 분석해드리겠습니다...",
    //   metadata: { ... }
    // }
    
    return data.conversationId; // 다음 대화에서 사용할 ID
}

// 2-2. 기존 대화 이어가기 (사주 정보 자동 참조)
async function continueConversation(conversationId, message) {
    const response = await fetch('/api/ai/gemini-saju-analysis', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer YOUR_JWT_TOKEN'
        },
        body: JSON.stringify({
            conversationId: conversationId, // 기존 대화 ID (사주 정보 자동 참조)
            userPrompt: message,
            systemPrompt: "당신은 사주 전문가입니다. 이전 대화와 저장된 사주 정보를 참고하여 답변해주세요."
        })
    });

    const data = await response.json();
    console.log('대화 이어가기 결과:', data);
    // Response: {
    //   conversationId: "a1b2c3d4-e5f6-7890-1234-567890abcdef",
    //   answer: "이전 대화와 사주 정보를 참고하여 답변합니다...",
    //   metadata: { ... }
    // }
}

// ===== 3. 스트리밍 응답 =====

// 3-1. 스트리밍 사주 분석
async function streamingSajuAnalysis() {
    const response = await fetch('/api/ai/gemini-saju-analysis', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer YOUR_JWT_TOKEN'
        },
        body: JSON.stringify({
            userPrompt: "제 사주를 자세히 분석해주세요.",
            stream: true
        })
    });

    if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            console.log('스트리밍 응답:', chunk);
            // 실제로는 이 데이터를 UI에 실시간으로 표시
        }
    }
}

// ===== 4. 함수 호출 기능 =====

// 4-1. 함수 호출을 포함한 분석
async function functionCallingAnalysis() {
    const response = await fetch('/api/ai/gemini-saju-analysis', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer YOUR_JWT_TOKEN'
        },
        body: JSON.stringify({
            userPrompt: "제 사주에서 오늘의 운세를 알려주세요.",
            tools: [
                {
                    functionDeclarations: [
                        {
                            name: "getDailyFortune",
                            description: "특정 날짜의 운세를 계산합니다.",
                            parameters: {
                                type: "object",
                                properties: {
                                    date: {
                                        type: "string",
                                        description: "운세를 계산할 날짜 (YYYY-MM-DD 형식)"
                                    },
                                    birthDate: {
                                        type: "string",
                                        description: "사용자의 생년월일 (YYYY-MM-DD 형식)"
                                    }
                                },
                                required: ["date", "birthDate"]
                            }
                        }
                    ]
                }
            ],
            toolConfig: {
                functionCallingConfig: {
                    mode: "AUTO"
                }
            }
        })
    });

    const data = await response.json();
    console.log('함수 호출 분석 결과:', data);
}

// ===== 5. 에러 처리 =====

async function handleGeminiApiError(apiCall) {
    try {
        const result = await apiCall();
        return result;
    } catch (error) {
        console.error('Gemini API 호출 오류:', error);

        if (error.response) {
            const errorData = await error.response.json();
            console.error('에러 메시지:', errorData.error);
            console.error('상세 정보:', errorData.details);

            switch (error.response.status) {
                case 400:
                    alert('잘못된 요청입니다. 입력값을 확인해주세요.');
                    break;
                case 401:
                    alert('로그인이 필요합니다.');
                    break;
                case 429:
                    alert('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
                    break;
                case 500:
                    alert('서버 오류가 발생했습니다.');
                    break;
                default:
                    alert('알 수 없는 오류가 발생했습니다.');
            }
        }
    }
}

// ===== 6. 실제 사용 예시 =====

// 사주 분석 페이지 예시
class SajuAnalysisPage {
    constructor() {
        this.currentConversationId = null;
        this.isLoading = false;
    }

    // 기본 사주 분석 (새 대화 시작)
    async analyzeBasicSaju(birthInfo) {
        this.isLoading = true;
        this.updateUI('분석 중입니다...');

        try {
            const response = await fetch('/api/ai/gemini-saju-analysis', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getToken()}`
                },
                body: JSON.stringify({
                    userPrompt: `제 사주를 분석해주세요. ${birthInfo}`,
                    systemPrompt: "당신은 전문 사주명리학자입니다. 친절하고 상세하게 분석해주세요."
                })
            });

            const data = await response.json();
            
            if (data.answer) {
                this.updateUI(data.answer);
                this.currentConversationId = data.conversationId;
                console.log('새 대화 시작됨, ID:', this.currentConversationId);
            }
        } catch (error) {
            this.handleError(error);
        } finally {
            this.isLoading = false;
        }
    }

    // 사주 정보를 포함한 상세 분석 (새 대화 시작)
    async analyzeDetailedSaju(sajuData) {
        this.isLoading = true;
        this.updateUI('상세 분석 중입니다...');

        try {
            const response = await fetch('/api/ai/gemini-saju-analysis', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getToken()}`
                },
                body: JSON.stringify({
                    userPrompt: "제 사주를 자세히 분석해주세요.",
                    systemPrompt: "당신은 전문 사주명리학자입니다. 계산된 사주 정보를 바탕으로 친절하고 상세하게 분석해주세요.",
                    sajuData: sajuData, // 방대한 계산된 사주 데이터
                    model: "gemini-2.5-pro-latest",
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 4096
                    }
                })
            });

            const data = await response.json();
            
            if (data.answer) {
                this.updateUI(data.answer);
                this.currentConversationId = data.conversationId;
                console.log('상세 분석 완료, 대화 ID:', this.currentConversationId);
            }
        } catch (error) {
            this.handleError(error);
        } finally {
            this.isLoading = false;
        }
    }

    // 연속 대화 (기존 대화 이어가기)
    async continueConversation(message) {
        if (!this.currentConversationId) {
            this.updateUI('먼저 사주 분석을 시작해주세요.');
            return;
        }

        this.isLoading = true;
        this.updateUI('답변을 생성하고 있습니다...');

        try {
            const response = await fetch('/api/ai/gemini-saju-analysis', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getToken()}`
                },
                body: JSON.stringify({
                    conversationId: this.currentConversationId,
                    userPrompt: message,
                    systemPrompt: "당신은 사주 전문가입니다. 이전 대화를 참고하여 답변해주세요."
                })
            });

            const data = await response.json();
            
            if (data.answer) {
                this.updateUI(data.answer);
                console.log('대화 이어가기 완료, ID:', data.conversationId);
            }
        } catch (error) {
            this.handleError(error);
        } finally {
            this.isLoading = false;
        }
    }

    // 스트리밍 분석
    async streamingAnalysis(message) {
        this.isLoading = true;
        this.updateUI('');

        try {
            const response = await fetch('/api/ai/gemini-saju-analysis', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getToken()}`
                },
                body: JSON.stringify({
                    userPrompt: message,
                    stream: true
                })
            });

            if (response.body) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let fullResponse = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value);
                    fullResponse += chunk;
                    this.updateUI(fullResponse);
                }

                this.addToHistory('user', message);
                this.addToHistory('assistant', fullResponse);
            }
        } catch (error) {
            this.handleError(error);
        } finally {
            this.isLoading = false;
        }
    }

    // UI 업데이트 (실제 구현 필요)
    updateUI(content) {
        const outputElement = document.getElementById('analysis-output');
        if (outputElement) {
            outputElement.innerHTML = content;
        }
    }

    // 에러 처리
    handleError(error) {
        console.error('API 오류:', error);
        this.updateUI('오류가 발생했습니다. 다시 시도해주세요.');
    }

    // 토큰 가져오기 (실제 구현 필요)
    getToken() {
        return localStorage.getItem('jwt_token');
    }
}

// ===== 7. 사용 예시 =====

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
    const sajuPage = new SajuAnalysisPage();

    // 기본 분석 버튼
    document.getElementById('analyze-btn')?.addEventListener('click', () => {
        const birthInfo = document.getElementById('birth-info').value;
        sajuPage.analyzeBasicSaju(birthInfo);
    });

    // 연속 대화 버튼
    document.getElementById('continue-btn')?.addEventListener('click', () => {
        const message = document.getElementById('message-input').value;
        sajuPage.continueConversation(message);
    });

    // 스트리밍 분석 버튼
    document.getElementById('stream-btn')?.addEventListener('click', () => {
        const message = document.getElementById('message-input').value;
        sajuPage.streamingAnalysis(message);
    });
});

// ===== 8. 유틸리티 함수 =====

// 응답 텍스트 추출
function extractResponseText(geminiResponse) {
    return geminiResponse.answer || null;
}

// 메타데이터 추출
function extractMetadata(geminiResponse) {
    return geminiResponse.metadata || {};
}

// 사용량 정보 추출
function extractUsage(geminiResponse) {
    return geminiResponse.usage || null;
}

// ===== 9. 배치 처리 예시 =====

// 여러 사주 일괄 분석
async function batchSajuAnalysis(sajuDataList) {
    const results = [];

    for (const sajuData of sajuDataList) {
        try {
            const response = await fetch('/api/ai/gemini-saju-analysis', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer YOUR_JWT_TOKEN'
                },
                body: JSON.stringify({
                    userPrompt: "제 사주를 분석해주세요.",
                    systemPrompt: "당신은 사주 전문가입니다. 계산된 사주 정보를 바탕으로 간결하게 분석해주세요.",
                    sajuData: sajuData, // 각각의 계산된 사주 데이터
                    model: "gemini-2.5-pro-latest"
                })
            });

            const data = await response.json();
            results.push({
                sajuData,
                conversationId: data.conversationId,
                analysis: extractResponseText(data),
                metadata: extractMetadata(data)
            });

            // API 호출 간격 조절
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            results.push({
                sajuData,
                error: error.message
            });
        }
    }

    return results;
}

// ===== 10. 성능 최적화 팁 =====

// 1. 적절한 temperature 설정
// - 0.0-0.3: 일관된 답변, 사실 기반
// - 0.4-0.7: 균형잡힌 창의성
// - 0.8-1.0: 높은 창의성

// 2. maxOutputTokens 설정
// - 짧은 답변: 500-1000
// - 일반적인 답변: 1000-2000
// - 긴 분석: 2000-4000

// 3. 대화 기록 관리
// - 너무 긴 대화 기록은 토큰 사용량 증가
// - 중요한 부분만 유지하거나 주기적으로 정리

// 4. 에러 재시도 로직
async function retryApiCall(apiCall, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await apiCall();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
}