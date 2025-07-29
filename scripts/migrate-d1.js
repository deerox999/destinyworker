/*
wrangler d1 execute destiny-new --command "update users set role='admin' where id=1;"
*/
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Prisma 스키마를 D1 데이터베이스에 동기화 중...\n');

// 이전 스키마 저장 파일 경로
const lastSchemaFile = './scripts/last-schema.prisma';
const tempSqlFile = './scripts/temp_migration.sql';
const currentDbSchemaFile = './scripts/current-db-schema.sql';

try {
  let migrationSql = '';
  
  // 1. 현재 D1 데이터베이스 스키마 추출 (--reset 플래그가 있는 경우)
  if (process.argv.includes('--reset') || !fs.existsSync(lastSchemaFile)) {
    console.log('🔄 1단계: 현재 D1 데이터베이스 스키마 추출 중...');
    
    try {
      // 현재 D1의 테이블 스키마를 추출
      const dbSchema = execSync(
        `npx wrangler d1 execute destiny-new --remote --command ".schema"`,
        { encoding: 'utf8' }
      );
      
      // 스키마에서 실제 CREATE 문만 추출 (메타데이터 제거)
      const cleanSchema = dbSchema
        .split('\n')
        .filter(line => line.trim().startsWith('CREATE'))
        .join('\n');
      
      if (cleanSchema.trim()) {
        fs.writeFileSync(currentDbSchemaFile, cleanSchema);
        console.log('💾 현재 D1 스키마 추출 완료');
        
        // 현재 D1 스키마를 Prisma 스키마와 비교
        migrationSql = execSync(
          `npx prisma migrate diff --from-schema-datasource ${currentDbSchemaFile} --to-schema-datamodel prisma/schema.prisma --script`,
          { encoding: 'utf8' }
        );
        
        console.log('📊 현재 D1 상태와 Prisma 스키마 비교 완료');
      } else {
        // D1이 비어있는 경우
        migrationSql = execSync(
          'npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script',
          { encoding: 'utf8' }
        );
      }
      
    } catch (error) {
      console.log('⚠️  D1 스키마 추출 실패, 전체 스키마로 진행합니다.');
      migrationSql = execSync(
        'npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script',
        { encoding: 'utf8' }
      );
    }
  } 
  // 2. 로컬 D1의 실제 상태와 비교 (--local 플래그가 있는 경우)
  else if (process.argv.includes('--local')) {
    console.log('📊 1단계: 로컬 D1 실제 상태와 Prisma 스키마 비교 중...');
    
    try {
      // 로컬 D1의 실제 테이블 목록 조회
      const localTables = execSync(
        `npx wrangler d1 execute destiny-local --command "SELECT name FROM sqlite_master WHERE type='table';"`,
        { encoding: 'utf8' }
      );
      
      console.log('📋 로컬 D1에 있는 테이블들:');
      console.log(localTables);
      
      // 로컬 D1의 스키마를 추출
      const localSchema = execSync(
        `npx wrangler d1 execute destiny-local --command "SELECT sql FROM sqlite_master WHERE type='table';"`,
        { encoding: 'utf8' }
      );
      
      // CREATE 문들만 추출
      const createStatements = localSchema
        .split('\n')
        .filter(line => line && line.trim().startsWith('CREATE TABLE'))
        .join('\n');
      
      if (createStatements.trim()) {
        fs.writeFileSync(currentDbSchemaFile, createStatements);
        console.log('💾 로컬 D1 스키마 추출 완료');
        
        // 로컬 D1 스키마를 Prisma 스키마와 비교
        migrationSql = execSync(
          `npx prisma migrate diff --from-schema-datasource ${currentDbSchemaFile} --to-schema-datamodel prisma/schema.prisma --script`,
          { encoding: 'utf8' }
        );
        
        console.log('📊 로컬 D1 상태와 Prisma 스키마 비교 완료');
      } else {
        // 로컬 D1이 비어있는 경우
        migrationSql = execSync(
          'npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script',
          { encoding: 'utf8' }
        );
      }
      
    } catch (error) {
      console.log('⚠️  로컬 D1 스키마 추출 실패, 전체 스키마로 진행합니다.');
      migrationSql = execSync(
        'npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script',
        { encoding: 'utf8' }
      );
    }
  }
  // 3. 이전 스키마 상태와 비교
  else if (fs.existsSync(lastSchemaFile)) {
    console.log('📊 1단계: 이전 스키마와 현재 스키마 비교 중...');
    
    try {
      // 이전 스키마와 현재 스키마의 차이를 계산
      migrationSql = execSync(
        `npx prisma migrate diff --from-schema-datamodel ${lastSchemaFile} --to-schema-datamodel prisma/schema.prisma --script`,
        { encoding: 'utf8' }
      );
      
      if (migrationSql.trim() === '') {
        console.log('✅ 스키마에 변경사항이 없습니다.');
        process.exit(0);
      }
      
      console.log('📝 감지된 변경사항:');
      console.log(migrationSql);
      
    } catch (error) {
      console.log('⚠️  이전 스키마와 비교 실패, 전체 스키마로 진행합니다.');
      migrationSql = execSync(
        'npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script',
        { encoding: 'utf8' }
      );
    }
  } else {
    console.log('📝 1단계: 초기 스키마 생성 중...');
    migrationSql = execSync(
      'npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script',
      { encoding: 'utf8' }
    );
  }
  
  // 3. SQL을 안전한 형태로 변환
  console.log('🔄 2단계: SQL을 안전한 형태로 변환 중...');
  let safeSql = migrationSql;
  
  // CREATE 문들을 IF NOT EXISTS로 변환 (기존 테이블 보호)
  safeSql = safeSql
    .replace(/CREATE TABLE "([^"]+)"/g, 'CREATE TABLE IF NOT EXISTS "$1"')
    .replace(/CREATE UNIQUE INDEX "([^"]+)"/g, 'CREATE UNIQUE INDEX IF NOT EXISTS "$1"')
    .replace(/CREATE INDEX "([^"]+)"/g, 'CREATE INDEX IF NOT EXISTS "$1"');
  
  // DROP 문들을 IF EXISTS로 변환 (테이블이 없어도 오류 방지)
  safeSql = safeSql
    .replace(/DROP TABLE "([^"]+)"/g, 'DROP TABLE IF EXISTS "$1"')
    .replace(/DROP INDEX "([^"]+)"/g, 'DROP INDEX IF EXISTS "$1"');

  // 4. 변경사항이 있는지 확인
  if (safeSql.trim() === '') {
    console.log('✅ 적용할 변경사항이 없습니다.');
    // 임시 파일 정리
    if (fs.existsSync(currentDbSchemaFile)) {
      fs.unlinkSync(currentDbSchemaFile);
    }
    process.exit(0);
  }
  
  // 5. 임시 SQL 파일 생성
  fs.writeFileSync(tempSqlFile, safeSql);
  console.log('✅ 마이그레이션 SQL 파일 생성 완료');
  console.log('📄 적용될 SQL:');
  console.log('---');
  console.log(safeSql);
  console.log('---\n');

  // 6. 사용자 확인 (위험한 변경사항이 있는 경우)
  if (safeSql.includes('DROP TABLE') || safeSql.includes('DROP COLUMN')) {
    console.log('⚠️  위험한 변경사항이 감지되었습니다!');
    console.log('   데이터가 손실될 수 있는 DROP 작업이 포함되어 있습니다.');
    console.log('   계속하려면 --force 플래그를 사용하세요.');
    
    if (!process.argv.includes('--force')) {
      console.log('❌ 안전을 위해 마이그레이션을 중단합니다.');
      fs.unlinkSync(tempSqlFile);
      if (fs.existsSync(currentDbSchemaFile)) {
        fs.unlinkSync(currentDbSchemaFile);
      }
      process.exit(1);
    }
    
    console.log('⚠️  --force 플래그가 지정되어 위험한 변경사항을 진행합니다.\n');
  }

  // 4. D1에 SQL 적용
  if (process.argv.includes('--remote') || !process.argv.includes('--local')) {
    console.log('☁️  4단계: 원격 D1에 적용 중...');
    execSync(`npx wrangler d1 execute destiny-new --remote --file=${tempSqlFile}`, { stdio: 'inherit' });
    console.log('✅ 원격 D1 적용 완료');
  } else {
    console.log('🏠 4단계: 로컬 D1에 적용 중...');
    execSync(`npx wrangler d1 execute destiny-local --file=${tempSqlFile}`, { stdio: 'inherit' });
    console.log('✅ 로컬 D1 적용 완료');
  }

  // 9. Prisma 클라이언트 재생성
  console.log('🔄 5단계: Prisma 클라이언트 재생성 중...');
  execSync('npx prisma generate', { stdio: 'inherit' });
  console.log('✅ Prisma 클라이언트 재생성 완료');

  // 10. 현재 스키마를 이전 스키마로 저장
  fs.copyFileSync('prisma/schema.prisma', lastSchemaFile);
  console.log('💾 현재 스키마 상태 저장 완료');

  // 11. 임시 파일 정리
  fs.unlinkSync(tempSqlFile);
  if (fs.existsSync(currentDbSchemaFile)) {
    fs.unlinkSync(currentDbSchemaFile);
  }
  console.log('🧹 임시 파일 정리 완료');

  console.log('\n🎉 D1 마이그레이션 완료!');
  console.log('💡 스키마 변경사항이 성공적으로 동기화되었습니다.');
  
} catch (error) {
  console.error('❌ 마이그레이션 중 오류 발생:', error.message);
  
  // 임시 파일이 있다면 정리
  if (fs.existsSync(tempSqlFile)) {
    fs.unlinkSync(tempSqlFile);
  }
  if (fs.existsSync(currentDbSchemaFile)) {
    fs.unlinkSync(currentDbSchemaFile);
  }
  
  process.exit(1);
} 