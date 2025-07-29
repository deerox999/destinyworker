const fs = require('fs');

// JSON 데이터를 INSERT 문으로 변환하는 함수
function convertJsonToInsert(jsonData, tableName) {
  const data = JSON.parse(jsonData);
  const results = data.results || data;
  
  if (!results || results.length === 0) {
    return '';
  }
  
  const columns = Object.keys(results[0]);
  const insertStatements = results.map(row => {
    const values = columns.map(col => {
      const value = row[col];
      if (value === null || value === undefined) {
        return 'NULL';
      } else if (typeof value === 'string') {
        return `'${value.replace(/'/g, "''")}'`;
      } else if (typeof value === 'boolean') {
        return value ? '1' : '0';
      } else {
        return value;
      }
    });
    
    return `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});`;
  });
  
  return insertStatements.join('\n');
}

// 파일에서 JSON 데이터 읽기
function readJsonFromFile(filename) {
  const content = fs.readFileSync(filename, 'utf8');
  // wrangler 출력에서 JSON 부분만 추출
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.trim().startsWith('[') || line.trim().startsWith('{')) {
      try {
        return line.trim();
      } catch (e) {
        continue;
      }
    }
  }
  return content;
}

// 메인 실행
try {
  console.log('🔄 데이터 변환 시작...');
  
  // users 데이터 변환
  if (fs.existsSync('users_data.sql')) {
    const usersJson = readJsonFromFile('users_data.sql');
    console.log('Users JSON:', usersJson.substring(0, 200) + '...');
    const usersInsert = convertJsonToInsert(usersJson, 'users');
    fs.writeFileSync('users_insert.sql', usersInsert);
    console.log('✅ users 데이터 변환 완료');
  }
  
  // boards 데이터 변환
  if (fs.existsSync('boards_data.sql')) {
    const boardsJson = readJsonFromFile('boards_data.sql');
    console.log('Boards JSON:', boardsJson.substring(0, 200) + '...');
    const boardsInsert = convertJsonToInsert(boardsJson, 'boards');
    fs.writeFileSync('boards_insert.sql', boardsInsert);
    console.log('✅ boards 데이터 변환 완료');
  }
  
  // posts 데이터 변환
  if (fs.existsSync('posts_data.sql')) {
    const postsJson = readJsonFromFile('posts_data.sql');
    console.log('Posts JSON:', postsJson.substring(0, 200) + '...');
    const postsInsert = convertJsonToInsert(postsJson, 'posts');
    fs.writeFileSync('posts_insert.sql', postsInsert);
    console.log('✅ posts 데이터 변환 완료');
  }
  
  console.log('🎉 모든 데이터 변환 완료!');
} catch (error) {
  console.error('❌ 데이터 변환 중 오류:', error);
} 