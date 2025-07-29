const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// backup 폴더 생성
const backupDir = path.join(__dirname, '..', 'prisma', 'backup');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// 테이블별 데이터 추출 및 INSERT 문 생성
async function extractTableData(tableName, columns = null) {
  try {
    console.log(`🔄 ${tableName} 테이블 데이터 추출 중...`);
    
    // 컬럼 정보 가져오기
    let columnQuery = columns || '*';
    const result = execSync(
      `wrangler d1 execute destiny --remote --command "SELECT ${columnQuery} FROM ${tableName};"`,
      { encoding: 'utf8' }
    );
    
    console.log(`📄 ${tableName} 결과 길이: ${result.length}`);
    
    // 결과에서 JSON 부분 추출 - 더 정확한 방법
    const lines = result.split('\n');
    let jsonData = null;
    
    // JSON 배열이나 객체를 찾기
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('[') || line.startsWith('{')) {
        try {
          // 여러 줄에 걸친 JSON을 처리
          let jsonString = line;
          let braceCount = 0;
          
          // 시작 괄호 개수 세기
          for (let j = 0; j < line.length; j++) {
            if (line[j] === '[' || line[j] === '{') braceCount++;
            if (line[j] === ']' || line[j] === '}') braceCount--;
          }
          
          // 닫는 괄호가 부족하면 다음 줄들도 포함
          let currentLine = i;
          while (braceCount > 0 && currentLine + 1 < lines.length) {
            currentLine++;
            const nextLine = lines[currentLine];
            jsonString += nextLine;
            
            for (let j = 0; j < nextLine.length; j++) {
              if (nextLine[j] === '[' || nextLine[j] === '{') braceCount++;
              if (nextLine[j] === ']' || nextLine[j] === '}') braceCount--;
            }
          }
          
          jsonData = JSON.parse(jsonString);
          console.log(`✅ ${tableName} JSON 파싱 성공`);
          console.log(`📊 ${tableName} JSON 키들:`, Object.keys(jsonData));
          break;
        } catch (e) {
          console.log(`⚠️  ${tableName} JSON 파싱 실패: ${e.message}`);
          continue;
        }
      }
    }
    
    if (!jsonData) {
      console.log(`⚠️  ${tableName} JSON 데이터를 찾을 수 없습니다.`);
      return '';
    }
    
    // JSON 구조에 따라 데이터 추출
    let data = null;
    if (jsonData.results) {
      data = jsonData.results;
    } else if (Array.isArray(jsonData)) {
      // 배열의 첫 번째 요소가 객체이고 results 속성을 가지고 있는지 확인
      if (jsonData.length > 0 && jsonData[0] && jsonData[0].results) {
        data = jsonData[0].results;
      } else {
        data = jsonData;
      }
    } else {
      console.log(`⚠️  ${tableName} 알 수 없는 JSON 구조:`, Object.keys(jsonData));
      return '';
    }
    
    if (!data || data.length === 0) {
      console.log(`⚠️  ${tableName} 테이블에 데이터가 없습니다.`);
      return '';
    }
    
    console.log(`📊 ${tableName} 데이터 개수: ${data.length}`);
    
    const insertStatements = data.map(row => {
      const values = Object.values(row).map(value => {
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
      
      const cols = Object.keys(row);
      return `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${values.join(', ')});`;
    });
    
    const insertSQL = insertStatements.join('\n');
    const backupFile = path.join(backupDir, `${tableName}_insert.sql`);
    fs.writeFileSync(backupFile, insertSQL);
    console.log(`✅ ${tableName} 테이블 데이터 추출 완료 (${data.length}개 레코드) -> ${backupFile}`);
    
    return insertSQL;
  } catch (error) {
    console.error(`❌ ${tableName} 테이블 데이터 추출 실패:`, error.message);
    return '';
  }
}

// 메인 실행
async function main() {
  console.log('🚀 전체 데이터 추출 시작...\n');
  console.log(`📁 백업 폴더: ${backupDir}\n`);
  
  const tables = [
    'users',
    'boards', 
    'board_categories',
    'posts',
    'comments',
    'post_likes',
    'comment_likes',
    'tags',
    'post_tags',
    'sessions',
    'saju_profiles',
    'celebrities',
    'celebrity_translations',
    'celebrity_view_counts',
    'celebrity_comments',
    'celebrity_comment_likes',
    'celebrity_requests',
    'documents',
    'conversation_histories',
    'login_histories',
    'ai_usage_logs',
    'point_transactions',
    'push_subscriptions',
    'saju_analyses'
  ];
  
  const allInserts = [];
  
  for (const table of tables) {
    const insertSQL = await extractTableData(table);
    if (insertSQL) {
      allInserts.push(`-- ${table} 테이블 데이터`);
      allInserts.push(insertSQL);
      allInserts.push('');
    }
  }
  
  // 전체 INSERT 문을 하나의 파일로 저장
  const allDataFile = path.join(backupDir, 'all_data_insert.sql');
  fs.writeFileSync(allDataFile, allInserts.join('\n'));
  console.log('\n🎉 전체 데이터 추출 완료!');
  console.log(`📄 전체 데이터 파일: ${allDataFile}`);
}

main().catch(console.error); 