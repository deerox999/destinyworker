
export function generateSwaggerHTML(): string {
  return `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Destiny API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui.css" />
  <style>
    html {
      box-sizing: border-box;
      overflow: -moz-scrollbars-vertical;
      overflow-y: scroll;
    }
    *, *:before, *:after {
      box-sizing: inherit;
    }
    body {
      margin:0;
      background: #fafafa;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  
  <script src="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: '/api/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>`;
}

export function generateApiListHTML(): string {
  const endpoints = [
    { method: 'GET', path: '/api/users', description: '사용자 목록 조회' },
    { method: 'POST', path: '/api/users', description: '새 사용자 생성' },
    { method: 'GET', path: '/api/users/{id}', description: '특정 사용자 조회' },
    { method: 'GET', path: '/api/comments', description: '댓글 목록 조회' },
    { method: 'POST', path: '/api/saju/calculate', description: '사주 계산' },
    { method: 'GET', path: '/api/health', description: '서버 상태 확인' },
    { method: 'GET', path: '/docs', description: 'Swagger UI 문서' },
    { method: 'GET', path: '/api/openapi.json', description: 'OpenAPI 스펙' }
  ];

  return `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Destiny API 목록</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      max-width: 1000px;
      margin: 0 auto;
      padding: 20px;
      background: #f8f9fa;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
      padding: 30px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-radius: 10px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
    }
    .header h1 {
      margin: 0;
      font-size: 2.5em;
    }
    .header p {
      margin: 10px 0 0 0;
      opacity: 0.9;
    }
    .api-list {
      background: white;
      border-radius: 10px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .api-item {
      display: flex;
      align-items: center;
      padding: 20px;
      border-bottom: 1px solid #eee;
      transition: background-color 0.2s;
    }
    .api-item:hover {
      background-color: #f8f9fa;
    }
    .api-item:last-child {
      border-bottom: none;
    }
    .method {
      padding: 6px 12px;
      border-radius: 6px;
      font-weight: bold;
      font-size: 0.85em;
      min-width: 60px;
      text-align: center;
      margin-right: 15px;
    }
    .method.GET {
      background: #61affe;
      color: white;
    }
    .method.POST {
      background: #49cc90;
      color: white;
    }
    .method.PUT {
      background: #fca130;
      color: white;
    }
    .method.DELETE {
      background: #f93e3e;
      color: white;
    }
    .path {
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-weight: bold;
      color: #333;
      margin-right: 15px;
      flex: 1;
    }
    .description {
      color: #666;
      flex: 2;
    }
    .nav-links {
      text-align: center;
      margin: 30px 0;
    }
    .nav-links a {
      display: inline-block;
      margin: 0 10px;
      padding: 12px 24px;
      background: #007bff;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      transition: background-color 0.2s;
    }
    .nav-links a:hover {
      background: #0056b3;
    }
    .status-info {
      background: white;
      padding: 20px;
      border-radius: 10px;
      margin-bottom: 20px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .status-info h3 {
      margin-top: 0;
      color: #333;
    }
    .server-info {
      background: #e8f5e8;
      padding: 10px;
      border-radius: 6px;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🔮 Destiny API</h1>
    <p>사주 서비스를 위한 백엔드 API 서버</p>
  </div>
  
  <div class="status-info">
    <h3>📊 서버 정보</h3>
    <div class="server-info">
      <strong>서버 주소:</strong> http://localhost:9393<br>
      <strong>상태:</strong> 🟢 온라인<br>
      <strong>버전:</strong> 1.0.0
    </div>
  </div>

  <div class="nav-links">
    <a href="/docs">📖 Swagger 문서</a>
    <a href="/api/openapi.json">📋 OpenAPI 스펙</a>
  </div>

  <div class="api-list">
    ${endpoints.map(endpoint => `
      <div class="api-item">
        <span class="method ${endpoint.method}">${endpoint.method}</span>
        <span class="path">${endpoint.path}</span>
        <span class="description">${endpoint.description}</span>
      </div>
    `).join('')}
  </div>
</body>
</html>`;
} 