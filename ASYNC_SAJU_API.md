# 비동기 사주 분석 API

Cloudflare Queue와 Durable Object를 활용한 비동기 사주 분석 API입니다. 기존 스트리밍 API와 달리 즉시 응답하고 백그라운드에서 처리됩니다.

## 개요

- **즉시 응답**: 요청 시 즉시 jobId를 반환하고 백그라운드에서 처리
- **Queue 기반**: Cloudflare Queue를 통한 안정적인 작업 처리
- **상태 조회**: 작업 진행 상황을 실시간으로 확인 가능
- **DB 저장**: 완료된 분석 결과는 자동으로 DB에 저장

## API 엔드포인트

### 1. 비동기 사주 분석
```
POST /api/ai/async/analysis
```

**요청 본문:**
```json
{
  "userPrompt": "사주 분석 요청",
  "systemPrompt": "시스템 프롬프트 (선택사항)",
  "sajuData": {
    "정보": {
      "생년월일": {
        "이름": "홍길동",
        "년": 1990,
        "월": 1,
        "일": 1,
        "시": 12
      }
    }
  },
  "conversationHistory": [],
  "model": "gemini-2.5-pro",
  "analysisType": "general",
  "type": "individual",
  "i18n": "ko",
  "timezone": "Asia/Seoul"
}
```

**응답:**
```json
{
  "success": true,
  "jobId": "job_1703123456789_abc123def",
  "message": "분석 작업이 등록되었습니다. Queue에서 처리됩니다.",
  "status": "pending",
  "points": {
    "deducted": 1000,
    "remaining": 5000,
    "message": "포인트가 차감되었습니다."
  },
  "data": {
    "isAdmin": false,
    "points": 5000
  }
}
```

### 2. 비동기 궁합 분석
```
POST /api/ai/async/compatibility
```

**요청 본문:**
```json
{
  "userPrompt": "궁합 분석 요청",
  "sajuData": {
    "person1": {
      "name": "홍길동",
      "sajuData": { /* 사주 데이터 */ }
    },
    "person2": {
      "name": "김철수",
      "sajuData": { /* 사주 데이터 */ }
    }
  },
  "model": "gemini-2.5-flash",
  "analysisType": "compatibility",
  "type": "compatibility"
}
```

### 3. 비동기 연간운세 분석
```
POST /api/ai/async/yearly-fortune
```

**요청 본문:**
```json
{
  "userPrompt": "올해 운세 분석 요청",
  "sajuData": { /* 사주 데이터 */ },
  "fortuneType": "this_year",
  "analysisType": "yearly_fortune",
  "type": "yearly_fortune"
}
```

### 4. 작업 상태 조회
```
GET /api/ai/async/status?jobId=job_1703123456789_abc123def
```

**응답:**
```json
{
  "success": true,
  "jobId": "job_1703123456789_abc123def",
  "status": "completed",
  "createdAt": "2023-12-21T10:30:45.123Z",
  "result": {
    "answer": "분석 결과 텍스트...",
    "analysisId": 123,
    "metadata": {
      "model_used": "gemini-2.5-pro",
      "timestamp": "2023-12-21T10:31:15.456Z",
      "response_type": "text"
    },
    "points": {
      "deducted": 1000,
      "remaining": null,
      "message": null
    }
  }
}
```

## 작업 상태

- `pending`: 작업이 등록되었고 Queue에서 대기 중
- `processing`: Queue에서 처리 중
- `completed`: 작업 완료
- `failed`: 작업 실패

## 포인트 비용

- **일반 사주 분석**: 1,000 포인트
- **궁합 분석**: 1,500 포인트
- **연간운세 분석**: 200 포인트

## 에러 처리

작업 실패 시 자동으로 포인트가 환불되며, 에러 메시지가 포함된 응답을 받을 수 있습니다.

```json
{
  "success": true,
  "jobId": "job_1703123456789_abc123def",
  "status": "failed",
  "error": "AI 응답을 받을 수 없습니다."
}
```

## 사용 예시

### 1. 분석 요청
```javascript
const response = await fetch('/api/ai/async/analysis', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    userPrompt: "사주 분석을 해주세요",
    sajuData: { /* 사주 데이터 */ }
  })
});

const result = await response.json();
const jobId = result.jobId;
```

### 2. 상태 확인 (폴링)
```javascript
const checkStatus = async (jobId) => {
  const response = await fetch(`/api/ai/async/status?jobId=${jobId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const status = await response.json();
  
  if (status.status === 'completed') {
    console.log('분석 완료:', status.result.answer);
  } else if (status.status === 'failed') {
    console.log('분석 실패:', status.error);
  } else {
    // 계속 폴링
    setTimeout(() => checkStatus(jobId), 2000);
  }
};

checkStatus(jobId);
```

## 기존 API와의 차이점

| 구분 | 기존 API | 비동기 API |
|------|----------|------------|
| 응답 방식 | 스트리밍 | 즉시 응답 + 상태 조회 |
| 처리 방식 | 동기 | 비동기 (Queue) |
| 타임아웃 | 3분 | 무제한 |
| 안정성 | 연결 끊김 시 실패 | 재시도 및 복구 |
| 사용자 경험 | 실시간 스트리밍 | 폴링 기반 상태 확인 |

## 주의사항

1. **폴링 간격**: 상태 조회 시 적절한 간격(2-5초)으로 폴링하세요.
2. **타임아웃**: 작업이 오래 걸릴 수 있으므로 충분한 타임아웃을 설정하세요.
3. **에러 처리**: 실패 시 포인트 환불이 자동으로 처리되지만, 사용자에게 적절한 메시지를 표시하세요.
4. **DB 저장**: 완료된 분석은 자동으로 DB에 저장되므로 별도 저장 로직이 필요 없습니다. 