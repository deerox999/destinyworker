/*
D1 데이터베이스 전체 데이터 추출 스크립트 (컬럼명 매핑 포함)

이 스크립트는 Cloudflare D1 데이터베이스의 모든 테이블에서 데이터를 추출하여
새로운 컬럼명으로 매핑한 INSERT 문을 생성하고 백업 파일로 저장합니다.

사용법:
  node scripts/extract-all-data.js
  node scripts/migrate-d1.js --dev --reset --force
  npx wrangler d1 execute destiny-dev --remote --file=prisma/backup/all_data_insert.sql
  
  node scripts/migrate-d1.js --remote --reset --force
  npx wrangler d1 execute destiny-new --remote --file=prisma/backup/all_data_insert.sql

기능:
- 모든 테이블의 데이터를 추출하여 INSERT 문 생성
- camelCase → snake_case 컬럼명 매핑
- 전체 데이터를 하나의 파일로 통합 (prisma/backup/all_data_insert.sql)
- JSON 파싱 오류 처리 및 로깅

출력 파일:
- prisma/backup/all_data_insert.sql (전체 통합 파일)

주의사항:
- 원격 데이터베이스(destiny-new)에서 데이터를 추출합니다
- 대용량 데이터의 경우 시간이 오래 걸릴 수 있습니다
- JSON 파싱 실패 시 해당 테이블은 건너뜁니다
*/

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// backup 폴더 생성
const backupDir = path.join(__dirname, '..', 'prisma', 'backup');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// 컬럼명 매핑 (snake_case → camelCase)
const fieldMappings = {
  // users 테이블
  'google_id': 'googleId',
  'user_name': 'userName',
  'privacy_consent': 'privacyConsent',
  'privacy_consent_version': 'privacyConsentVersion',
  'privacy_consent_at': 'privacyConsentAt',
  'report_storage_consent': 'reportStorageConsent',
  'report_storage_consent_version': 'reportStorageConsentVersion',
  'report_storage_consent_at': 'reportStorageConsentAt',
  'last_consent_at': 'lastConsentAt',
  'consent_status': 'consentStatus',
  'created_at': 'createdAt',
  'updated_at': 'updatedAt',
  
  // sessions 테이블
  'user_id': 'userId',
  'jwt_token': 'jwtToken',
  'expires_at': 'expiresAt',
  
  // saju_profiles 테이블
  'calculation_method': 'calculationMethod',
  
  // celebrities 테이블
  'birth_year': 'birthYear',
  'birth_month': 'birthMonth',
  'birth_day': 'birthDay',
  'birth_hour': 'birthHour',
  'birth_minute': 'birthMinute',
  'image_url': 'imageUrl',
  
  // celebrity_translations 테이블
  'celebrity_id': 'celebrityId',
  'language_code': 'languageCode',
  
  // celebrity_view_counts 테이블
  'view_count': 'viewCount',
  
  // celebrity_comments 테이블
  'like_count': 'likeCount',
  'parent_id': 'parentId',
  
  // celebrity_comment_likes 테이블
  'comment_id': 'commentId',
  
  // celebrity_requests 테이블
  'birth_date': 'birthDate',
  
  // conversation_histories 테이블
  'conversation_id': 'conversationId',
  
  // ai_usage_logs 테이블
  'prompt_tokens': 'promptTokens',
  'completion_tokens': 'completionTokens',
  'total_tokens': 'totalTokens',
  
  // point_transactions 테이블
  'analysis_id': 'analysisId',
  
  // push_subscriptions 테이블
  'p256dh': 'p256dh', // 이미 snake_case
  'auth': 'auth', // 이미 snake_case
  
  // boards 테이블
  'display_name': 'displayName',
  'sort_order': 'sortOrder',
  'is_active': 'isActive',
  
  // board_categories 테이블
  'board_id': 'boardId',
  
  // posts 테이블
  'board_id': 'boardId',
  'category_id': 'categoryId',
  'author_id': 'authorId',
  'author_name': 'authorName',
  'author_image': 'authorImage',
  'view_count': 'viewCount',
  'like_count': 'likeCount',
  'comment_count': 'commentCount',
  'is_notice': 'isNotice',
  'is_deleted': 'isDeleted',
  
  // comments 테이블
  'post_id': 'postId',
  'author_name': 'authorName',
  'author_image': 'authorImage',
  'parent_id': 'parentId',
  'like_count': 'likeCount',
  'is_deleted': 'isDeleted',
  
  // post_likes 테이블
  'post_id': 'postId',
  'user_id': 'userId',
  
  // comment_likes 테이블
  'comment_id': 'commentId',
  'user_id': 'userId',
  
  // post_tags 테이블
  'post_id': 'postId',
  'tag_id': 'tagId',
  
  // saju_analyses 테이블
  'analysis_type': 'analysisType',
  'user_prompt': 'userPrompt',
  'system_prompt': 'systemPrompt',
  'ai_response': 'aiResponse',
  'model_used': 'modelUsed',
  'points_spent': 'pointsSpent',
  'is_favorite': 'isFavorite',
  'analysis_started_at': 'analysisStartedAt',
  'analysis_completed_at': 'analysisCompletedAt'
};

// 컬럼명 매핑 함수
function mapColumnName(oldName) {
  return fieldMappings[oldName] || oldName;
}

// 테이블별 데이터 추출 및 INSERT 문 생성
async function extractTableData(tableName, columns = null) {
  try {
    console.log(`🔄 ${tableName} 테이블 데이터 추출 중...`);
    
    // 컬럼 정보 가져오기
    let columnQuery = columns || '*';
    const result = execSync(
      `wrangler d1 execute destiny-new --remote --command "SELECT ${columnQuery} FROM ${tableName};"`,
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
      
      // 컬럼명을 새 형식으로 매핑
      const cols = Object.keys(row).map(mapColumnName);
      return `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${values.join(', ')});`;
    });
    
    const insertSQL = insertStatements.join('\n');
    console.log(`✅ ${tableName} 테이블 데이터 추출 완료 (${data.length}개 레코드)`);
    
    return insertSQL;
  } catch (error) {
    console.error(`❌ ${tableName} 테이블 데이터 추출 실패:`, error.message);
    return '';
  }
}

// 메인 실행
async function main() {
  console.log('🚀 전체 데이터 추출 시작 (컬럼명 매핑 포함)...\n');
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
      allInserts.push(`-- ${table} 테이블 데이터 (컬럼명 매핑됨)`);
      allInserts.push(insertSQL);
      allInserts.push('');
    }
  }
  
  // 전체 INSERT 문을 하나의 파일로 저장
  const allDataFile = path.join(backupDir, 'all_data_insert.sql');
  fs.writeFileSync(allDataFile, allInserts.join('\n'));
  console.log('\n🎉 전체 데이터 추출 완료!');
  console.log(`📄 매핑된 데이터 파일: ${allDataFile}`);
  console.log('💡 이제 다음 단계를 진행하세요:');
  console.log('   1. node scripts/migrate-d1.js --dev --reset --force');
  console.log('   2. 생성된 all_data_insert.sql 파일을 새 DB에 실행');
}

main().catch(console.error); 