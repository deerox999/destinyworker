#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Prisma 스키마를 D1 데이터베이스에 적용 중...\n');

try {
  // 1. Prisma에서 SQL DDL 생성
  console.log('📝 1단계: Prisma 스키마에서 SQL 생성 중...');
  const sqlOutput = execSync(
    'npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script',
    { encoding: 'utf8' }
  );
  
  // 2. SQL을 IF NOT EXISTS로 변환
  console.log('🔄 2단계: SQL을 안전한 형태로 변환 중...');
  const safeSql = sqlOutput
    .replace(/CREATE TABLE "([^"]+)"/g, 'CREATE TABLE IF NOT EXISTS "$1"')
    .replace(/CREATE UNIQUE INDEX "([^"]+)"/g, 'CREATE UNIQUE INDEX IF NOT EXISTS "$1"')
    .replace(/CREATE INDEX "([^"]+)"/g, 'CREATE INDEX IF NOT EXISTS "$1"');
  
  // 3. 임시 SQL 파일 생성
  const tempSqlFile = 'temp_migration.sql';
  fs.writeFileSync(tempSqlFile, safeSql);
  console.log('✅ 안전한 SQL 파일 생성 완료');

  // 4. 로컬 D1에 적용 (선택사항)
  if (process.argv.includes('--local')) {
    console.log('\n🏠 3단계: 로컬 D1에 적용 중...');
    execSync(`npx wrangler d1 execute destiny --file=${tempSqlFile}`, { stdio: 'inherit' });
    console.log('✅ 로컬 D1 적용 완료');
  }

  // 5. 원격 D1에 적용
  if (process.argv.includes('--remote') || !process.argv.includes('--local')) {
    console.log('\n☁️  4단계: 원격 D1에 적용 중...');
    execSync(`npx wrangler d1 execute destiny --remote --file=${tempSqlFile}`, { stdio: 'inherit' });
    console.log('✅ 원격 D1 적용 완료');
  }

  // 6. Prisma 클라이언트 재생성
  console.log('\n🔄 5단계: Prisma 클라이언트 재생성 중...');
  execSync('npx prisma generate', { stdio: 'inherit' });
  console.log('✅ Prisma 클라이언트 재생성 완료');

  // 7. 임시 파일 정리
  fs.unlinkSync(tempSqlFile);
  console.log('🧹 임시 파일 정리 완료');

  console.log('\n🎉 D1 마이그레이션 완료!');
  console.log('💡 기존 테이블은 유지되고, 새로운 테이블만 생성되었습니다.');
  
} catch (error) {
  console.error('❌ 마이그레이션 중 오류 발생:', error.message);
  
  // 임시 파일이 있다면 정리
  const tempSqlFile = 'temp_migration.sql';
  if (fs.existsSync(tempSqlFile)) {
    fs.unlinkSync(tempSqlFile);
    console.log('🧹 임시 파일 정리 완료');
  }
  
  process.exit(1);
} 