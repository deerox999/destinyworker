const { execSync } = require('child_process');

async function copyRemoteToLocal() {
  try {
    console.log('🔄 원격 D1 데이터를 로컬 D1으로 복사하는 중...');

    // 1. 원격 D1의 모든 테이블 목록 조회
    console.log('1. 원격 D1 테이블 목록 조회 중...');
    const remoteTablesResult = execSync(
      'npx wrangler d1 execute destiny --remote --command "SELECT name FROM sqlite_master WHERE type=\'table\' AND name NOT IN (\'sqlite_sequence\', \'_cf_METADATA\', \'d1_migrations\') ORDER BY name;"',
      { encoding: 'utf8' }
    );

    // JSON 결과에서 테이블 목록 추출
    let tables = [];
    try {
      const jsonMatch = remoteTablesResult.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const jsonResult = JSON.parse(jsonMatch[0]);
        if (jsonResult[0] && jsonResult[0].results) {
          tables = jsonResult[0].results.map(row => row.name);
        }
      }
    } catch (e) {
      console.log('JSON 파싱 실패, 텍스트 파싱 시도...');
      const tableLines = remoteTablesResult.split('\n').filter(line => line.includes('|') && !line.includes('name') && !line.includes('─'));
      tables = tableLines.map(line => {
        const parts = line.split('|').map(part => part.trim());
        return parts[1];
      }).filter(name => name);
    }

    console.log('📋 복사할 테이블들:', tables);

    // 2. 각 테이블의 데이터를 로컬로 복사
    for (const tableName of tables) {
      console.log(`\n📊 ${tableName} 테이블 복사 중...`);
      
      try {
        // 원격 테이블의 모든 데이터 조회
        const dataResult = execSync(
          `npx wrangler d1 execute destiny --remote --command "SELECT * FROM ${tableName};"`,
          { encoding: 'utf8' }
        );

        // JSON 결과에서 데이터 추출
        let rows = [];
        try {
          const jsonMatch = dataResult.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const jsonResult = JSON.parse(jsonMatch[0]);
            if (jsonResult[0] && jsonResult[0].results) {
              rows = jsonResult[0].results;
            }
          }
        } catch (e) {
          console.log(`${tableName} JSON 파싱 실패, 텍스트 파싱 시도...`);
          const dataLines = dataResult.split('\n').filter(line => line.includes('|') && !line.includes('─'));
          if (dataLines.length > 0) {
            const headerLine = dataLines[0];
            const headers = headerLine.split('|').map(h => h.trim()).filter(h => h);
            
            rows = dataLines.slice(1).map(line => {
              const values = line.split('|').map(v => v.trim());
              const row = {};
              headers.forEach((header, index) => {
                row[header] = values[index] || null;
              });
              return row;
            });
          }
        }

        if (rows.length > 0) {
          console.log(`  📝 ${rows.length}개 행 복사 중...`);
          
          // 로컬 테이블 비우기 (기존 데이터 삭제)
          execSync(
            `npx wrangler d1 execute destiny --command "DELETE FROM ${tableName};"`,
            { stdio: 'inherit' }
          );

          // 데이터 삽입
          for (const row of rows) {
            const columns = Object.keys(row);
            const values = Object.values(row).map(value => {
              if (value === null || value === undefined) {
                return 'NULL';
              } else if (typeof value === 'string') {
                // SQL 인젝션 방지를 위한 이스케이프
                const escaped = value.replace(/'/g, "''");
                return `'${escaped}'`;
              } else {
                return value;
              }
            });

            const insertSql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});`;
            
            try {
              execSync(
                `npx wrangler d1 execute destiny --command "${insertSql}"`,
                { stdio: 'inherit' }
              );
            } catch (error) {
              console.log(`  ⚠️  행 삽입 실패: ${error.message}`);
            }
          }
          
          console.log(`  ✅ ${tableName} 테이블 복사 완료`);
        } else {
          console.log(`  ℹ️  ${tableName} 테이블은 비어있음`);
        }
        
      } catch (error) {
        console.log(`  ❌ ${tableName} 테이블 복사 실패: ${error.message}`);
      }
    }

    console.log('\n🎉 원격 D1 데이터 복사 완료!');
    console.log('💡 로컬 D1에서 모든 데이터를 확인할 수 있습니다.');
    
  } catch (error) {
    console.error('❌ 데이터 복사 중 오류 발생:', error);
    process.exit(1);
  }
}

copyRemoteToLocal(); 