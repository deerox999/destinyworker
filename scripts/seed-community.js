const { execSync } = require('child_process');

async function seedCommunity() {
  try {
    console.log('커뮤니티 기본 데이터를 추가하는 중...');

    // 공간 ID 조회 (이미 생성되어 있을 수 있으므로 먼저 조회)
    console.log('1. 공간 ID 조회 중...');
    const boardsResult = execSync(`npx wrangler d1 execute destiny --remote --command "SELECT id, name FROM boards WHERE name IN ('bug-report', 'saju-discussion', 'feature-request')"`, { encoding: 'utf8' });
    
    console.log('조회 결과:', boardsResult);
    
    // 결과 파싱 개선
    const boardLines = boardsResult.split('\n').filter(line => line.includes('|') && !line.includes('id') && !line.includes('─'));
    const boards = {};
    
    boardLines.forEach(line => {
      const parts = line.split('|').map(part => part.trim());
      if (parts.length >= 2 && parts[0] && parts[1] && !isNaN(parseInt(parts[0]))) {
        boards[parts[1]] = parseInt(parts[0]);
      }
    });

    console.log('파싱된 공간 ID:', boards);

    // 공간이 없으면 생성
    if (Object.keys(boards).length === 0) {
      console.log('2. 기본 공간 생성 중...');
      
      // 버그 제보 공간
      execSync(`npx wrangler d1 execute destiny --remote --command "INSERT OR REPLACE INTO boards (name, displayName, description, isActive, created_at, updated_at) VALUES ('bug-report', '버그 제보', '서비스에서 발견한 버그를 제보하는 공간입니다.', 1, datetime('now'), datetime('now'))"`, { stdio: 'inherit' });
      
      // 사주 이야기 공간
      execSync(`npx wrangler d1 execute destiny --remote --command "INSERT OR REPLACE INTO boards (name, displayName, description, isActive, created_at, updated_at) VALUES ('saju-discussion', '사주 이야기', '사주와 운세에 대한 이야기를 나누는 공간입니다.', 1, datetime('now'), datetime('now'))"`, { stdio: 'inherit' });
      
      // 기능/개선 요청 공간
      execSync(`npx wrangler d1 execute destiny --remote --command "INSERT OR REPLACE INTO boards (name, displayName, description, isActive, created_at, updated_at) VALUES ('feature-request', '기능/개선 요청', '새로운 기능을 요청하거나 기존 기능을 개선하고 싶은 공간입니다.', 1, datetime('now'), datetime('now'))"`, { stdio: 'inherit' });

      console.log('공간 생성 완료');

      // 다시 공간 ID 조회
      const boardsResult2 = execSync(`npx wrangler d1 execute destiny --remote --command "SELECT id, name FROM boards WHERE name IN ('bug-report', 'saju-discussion', 'feature-request')"`, { encoding: 'utf8' });
      const boardLines2 = boardsResult2.split('\n').filter(line => line.includes('|') && !line.includes('id') && !line.includes('─'));
      
      boardLines2.forEach(line => {
        const parts = line.split('|').map(part => part.trim());
        if (parts.length >= 2 && parts[0] && parts[1] && !isNaN(parseInt(parts[0]))) {
          boards[parts[1]] = parseInt(parts[0]);
        }
      });
    }

    console.log('최종 공간 ID:', boards);

    // 카테고리 생성
    console.log('3. 카테고리 생성 중...');
    
    // 버그 제보 공간 카테고리
    const bugCategories = [
      { name: '버그', sortOrder: 0 },
      { name: 'UI/UX 문제', sortOrder: 1 },
      { name: '성능 문제', sortOrder: 2 },
      { name: '기타', sortOrder: 3 }
    ];

    for (const category of bugCategories) {
      if (boards['bug-report']) {
        execSync(`npx wrangler d1 execute destiny --remote --command "INSERT OR REPLACE INTO board_categories (board_id, name, sort_order, isActive, created_at, updated_at) VALUES (${boards['bug-report']}, '${category.name}', ${category.sortOrder}, 1, datetime('now'), datetime('now'))"`, { stdio: 'inherit' });
      }
    }

    // 사주 이야기 공간 카테고리
    const sajuCategories = [
      { name: '사주 해석', sortOrder: 0 },
      { name: '운세 이야기', sortOrder: 1 },
      { name: '사주 궁금증', sortOrder: 2 },
      { name: '사주 팁', sortOrder: 3 },
      { name: '일상 이야기', sortOrder: 4 },
      { name: '기타', sortOrder: 5 }
    ];

    for (const category of sajuCategories) {
      if (boards['saju-discussion']) {
        execSync(`npx wrangler d1 execute destiny --remote --command "INSERT OR REPLACE INTO board_categories (board_id, name, sort_order, isActive, created_at, updated_at) VALUES (${boards['saju-discussion']}, '${category.name}', ${category.sortOrder}, 1, datetime('now'), datetime('now'))"`, { stdio: 'inherit' });
      }
    }

    // 기능/개선 요청 공간 카테고리
    const featureCategories = [
      { name: '새로운 기능', sortOrder: 0 },
      { name: '기존 기능 개선', sortOrder: 1 },
      { name: '사주 해석 기능', sortOrder: 2 },
      { name: 'UI/UX 개선', sortOrder: 3 },
      { name: '모바일 앱', sortOrder: 4 },
      { name: '기타', sortOrder: 5 }
    ];

    for (const category of featureCategories) {
      if (boards['feature-request']) {
        execSync(`npx wrangler d1 execute destiny --remote --command "INSERT OR REPLACE INTO board_categories (board_id, name, sort_order, isActive, created_at, updated_at) VALUES (${boards['feature-request']}, '${category.name}', ${category.sortOrder}, 1, datetime('now'), datetime('now'))"`, { stdio: 'inherit' });
      }
    }

    console.log('카테고리 생성 완료');

    // 기본 태그 생성
    console.log('4. 기본 태그 생성 중...');
    const defaultTags = [
      '버그', 'UI', 'UX', '성능', '모바일', '웹', 'API', '보안', '접근성', '호환성',
      '사주', '운세', '사주해석', '사주팁', '사주궁금증', '일상', '기능요청', '개선요청'
    ];

    for (const tagName of defaultTags) {
      execSync(`npx wrangler d1 execute destiny --remote --command "INSERT OR REPLACE INTO tags (name, created_at) VALUES ('${tagName}', datetime('now'))"`, { stdio: 'inherit' });
    }

    console.log('기본 태그 생성 완료');
    console.log('커뮤니티 기본 데이터 추가 완료!');
    
  } catch (error) {
    console.error('시드 데이터 추가 중 오류 발생:', error);
    process.exit(1);
  }
}

seedCommunity(); 