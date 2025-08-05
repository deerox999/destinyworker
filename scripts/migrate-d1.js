/*
예시:
  # 로컬 환경에 일반 마이그레이션
  node scripts/migrate-d1.js --remote

  # 개발 환경에 강제 마이그레이션 (DROP 포함)
  node scripts/migrate-d1.js --dev --force
  # 프로덕션 환경 데이터베이스 초기화 (위험!)
  node scripts/migrate-d1.js --remote --reset --force
  # 로컬 환경에서 빈 스키마부터 전체 적용
  node scripts/migrate-d1.js --local --from-empty

  # 쿼리 직접실행
  npx prisma generate    (동기화)
  npx prisma migrate dev (마이그레이션 쿼리 생성)
  npx wrangler d1 execute destiny-local --local --file=prisma/migrations/20250805102303_/migration.sql
*/
/*
D1 데이터베이스 마이그레이션 스크립트

사용법:
  node migrate-d1.js [환경옵션] [동작옵션]

환경 옵션 (하나만 선택):
  --local     로컬 D1 데이터베이스 (destiny-local)
  --dev       개발 환경 D1 데이터베이스 (destiny-dev) 
  --remote    프로덕션 D1 데이터베이스 (destiny-new) - 기본값

동작 옵션:
  --reset     데이터베이스 초기화 (모든 테이블 삭제)
  --force     위험한 작업 강제 실행 (DROP, RESET 등)
  --from-empty 빈 스키마에서 시작하여 전체 스키마 적용



주의사항:
- --reset과 --force는 데이터 손실을 야기할 수 있습니다
- 프로덕션 환경에서는 --force 없이 실행하여 안전을 확인하세요
- 스크립트는 항상 빈 스키마에서 시작하여 전체 스키마를 적용합니다
- Prisma가 자동으로 중복 테이블/컬럼 생성을 방지하므로 안전합니다
*/
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises');
const path = require('path');

const execAsync = promisify(exec);

// --- 설정 ---
const DB_CONFIGS = {
  remote: { name: 'destiny-new', flags: '--remote' },
  dev: { name: 'destiny-dev', flags: '--remote' },
  local: { name: 'destiny-local', flags: '--local' },
};

const TEMP_FILES = {
  tempSql: path.join(__dirname, 'temp_migration.sql'),
  tempDropSql: path.join(__dirname, 'temp_drop.sql'),
};

// --- 로깅 유틸리티 ---
const log = {
  info: (message) => console.log(`[INFO] ${message}`),
  warn: (message) => console.warn(`[WARN] ⚠️  ${message}`),
  error: (message) => console.error(`[ERROR] ❌ ${message}`),
  success: (message) => console.log(`[SUCCESS] ✅ ${message}`),
  step: (message) => console.log(`
🚀 ${message}`),
};

/**
 * Wrangler D1 명령어를 실행하고 결과를 JSON으로 파싱합니다.
 */
async function executeD1(dbName, flags, { command, file }) {
  const commandStr = command ? `--command "${command.replace(/"/g, '\"')}"` : `--file=${file}`;
  const fullCommand = `npx wrangler d1 execute ${dbName} ${flags} ${commandStr} --json`;

  try {
    const { stdout } = await execAsync(fullCommand);
    if (!stdout.trim()) return [];
    const result = JSON.parse(stdout);
    return result[0]?.results || [];
  } catch (e) {
    log.error(`D1 execution failed for command: ${fullCommand}`);
    log.error(e.message);
    // Stderr might be useful for debugging wrangler issues
    if (e.stderr) {
      log.error(`Stderr: ${e.stderr}`);
    }
    throw new Error(`Failed to execute D1 command.`);
  }
}

/**
 * 실행 인자를 파싱하여 대상 환경 설정을 반환합니다.
 */
function getTargetConfig() {
  const args = process.argv.slice(2);
  let env = 'remote'; // 기본값
  if (args.includes('--local')) env = 'local';
  if (args.includes('--dev')) env = 'dev';

  log.info(`Target environment: ${env.toUpperCase()}`);
  return DB_CONFIGS[env];
}

/**
 * 데이터베이스를 초기화합니다 (모든 테이블 삭제).
 * 스키마를 분석하여 의존성의 역순으로, 실제 존재하는 테이블만 삭제합니다.
 */
async function resetDatabase(config) {
  log.step('RESETTING DATABASE...');
  const { name, flags } = config;
  const args = process.argv.slice(2);
  const isForced = args.includes('--force');

  if (!isForced) {
    log.warn('The --reset flag is a DESTRUCTIVE operation.');
    log.warn('All data in the database will be lost.');
    log.warn('To proceed, run the script with the --force flag as well (e.g., --reset --force).');
    throw new Error('Reset aborted for safety.');
  }

  const schemaContent = await fs.readFile('prisma/schema.prisma', 'utf-8');
  const models = {};
  const modelRegex = /model\s+(\w+)\s+\{([^}]+)\}/g;
  let modelMatch;
  while ((modelMatch = modelRegex.exec(schemaContent)) !== null) {
    const modelName = modelMatch[1];
    const modelBody = modelMatch[2];
    models[modelName] = { dependencies: new Set() };

    const relationRegex = /@relation\([^)]*fields:\s*\[[\w\s,]+\][^)]*references:\s*\[[\w\s,]+\][^)]*\)/g;
    const relationFields = [...modelBody.matchAll(relationRegex)];

    for (const rel of relationFields) {
        const relationLine = modelBody.split('\n').find(line => line.includes(rel[0]));
        if (relationLine) {
            const referencedModelName = relationLine.match(/\s(\w+)\s+@relation/)?.[1];
            if (referencedModelName && referencedModelName !== modelName) {
                models[modelName].dependencies.add(referencedModelName);
            }
        }
    }
  }

  const sorted = [];
  const visited = new Set();
  function visit(modelName) {
    if (!modelName || visited.has(modelName)) return;
    visited.add(modelName);
    models[modelName]?.dependencies.forEach(dep => visit(dep));
    sorted.push(modelName);
  }
  Object.keys(models).forEach(modelName => visit(modelName));
  const idealDeletionOrder = sorted.reverse();

  const existingTablesResult = await executeD1(name, flags, {
    command: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%';",
  });
  const existingTableNames = new Set(existingTablesResult.map((t) => t.name));

  const tableNamesToDrop = idealDeletionOrder.map(modelName => {
    const mapRegex = new RegExp(`model\\s+${modelName}[^}]+@@map\\(\\"([^\\"]+)\"\\)`);
    const mapMatch = schemaContent.match(mapRegex);
    return mapMatch ? mapMatch[1] : modelName;
  }).filter(tableName => existingTableNames.has(tableName));

  if (tableNamesToDrop.length > 0) {
    log.info(`Dropping tables in dependency order: ${tableNamesToDrop.join(', ')}`);
    
    // 각 테이블을 개별적으로 삭제 (트랜잭션 없이)
    for (const tableName of tableNamesToDrop) {
      log.info(`Dropping table: ${tableName}`);
      await executeD1(name, flags, {
        command: `DROP TABLE IF EXISTS "${tableName}";`
      });
    }
    
    log.success('All tables dropped successfully.');
  } else {
    log.info('No tables found to drop.');
  }
  log.success('Database has been reset.');
}


/**
 * Prisma를 사용하여 마이그레이션 SQL을 생성합니다.
 */
async function generateMigrationSql(config) {
  log.step('1. Generating migration SQL...');
  const args = process.argv.slice(2);
  const useEmpty = args.includes('--from-empty') || args.includes('--reset');

  let diffCommand;

  // 항상 빈 스키마에서 시작하여 전체 스키마 적용
  // Prisma가 자동으로 중복 테이블/컬럼 생성을 방지합니다
  log.info('Comparing from empty schema to current schema.prisma');
  diffCommand = `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`;

  const { stdout } = await execAsync(diffCommand);
  log.success('Migration SQL generated successfully.');
  return stdout;
}

/**
 * 생성된 SQL을 D1 데이터베이스에 적용합니다.
 */
async function applySqlToD1(config, sql) {
  log.step('2. Applying SQL to D1 database...');
  const { name, flags } = config;
  const args = process.argv.slice(2);
  const isForced = args.includes('--force');

  if (sql.includes('DROP') && !isForced) {
    log.warn('Destructive "DROP" operation detected.');
    log.warn('To proceed, run the script with the --force flag.');
    throw new Error('Migration aborted for safety. Use --force to proceed.');
  }

  // SQL을 안전하게 변환
  let safeSql = sql;
  
  // CREATE TABLE을 CREATE TABLE IF NOT EXISTS로 변환 (이미 IF NOT EXISTS가 없는 경우만)
  safeSql = safeSql.replace(/CREATE TABLE (?!IF NOT EXISTS )"([^"]+)"/g, 'CREATE TABLE IF NOT EXISTS "$1"');
  safeSql = safeSql.replace(/CREATE TABLE (?!IF NOT EXISTS )`([^`]+)`/g, 'CREATE TABLE IF NOT EXISTS `$1`');
  safeSql = safeSql.replace(/CREATE TABLE (?!IF NOT EXISTS )(\w+)/g, 'CREATE TABLE IF NOT EXISTS $1');
  
  // DROP TABLE을 DROP TABLE IF EXISTS로 변환 (이미 IF EXISTS가 없는 경우만)
  safeSql = safeSql.replace(/DROP TABLE (?!IF EXISTS )"([^"]+)"/g, 'DROP TABLE IF EXISTS "$1"');
  safeSql = safeSql.replace(/DROP TABLE (?!IF EXISTS )`([^`]+)`/g, 'DROP TABLE IF EXISTS `$1`');
  safeSql = safeSql.replace(/DROP TABLE (?!IF EXISTS )(\w+)/g, 'DROP TABLE IF EXISTS $1');
  
  // CREATE INDEX를 CREATE INDEX IF NOT EXISTS로 변환 (이미 IF NOT EXISTS가 없는 경우만)
  safeSql = safeSql.replace(/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS )"([^"]+)" ON "([^"]+)"/g, 'CREATE $1INDEX IF NOT EXISTS "$2" ON "$3"');
  safeSql = safeSql.replace(/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS )`([^`]+)` ON `([^`]+)`/g, 'CREATE $1INDEX IF NOT EXISTS `$2` ON `$3`');
  safeSql = safeSql.replace(/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS )(\w+) ON (\w+)/g, 'CREATE $1INDEX IF NOT EXISTS $2 ON $3');

  // 변환된 SQL이 원본과 다른 경우 로그
  if (safeSql !== sql) {
    log.info('SQL has been made safe with IF NOT EXISTS / IF EXISTS clauses.');
    log.info('Transformed SQL preview:');
    console.log('─'.repeat(50));
    console.log(safeSql.substring(0, 500) + '...');
    console.log('─'.repeat(50));
  } else {
    log.warn('SQL transformation did not occur. Original SQL will be used.');
  }

  await fs.writeFile(TEMP_FILES.tempSql, safeSql);
  log.info(`Executing migration on D1 database: ${name}`);
  await execAsync(`npx wrangler d1 execute ${name} ${flags} --file=${TEMP_FILES.tempSql}`);
  log.success('SQL applied to D1 successfully.');
}

/**
 * 임시 파일을 정리합니다.
 */
async function cleanup() {
  log.step('5. Cleaning up temporary files...');
  try {
    await fs.rm(TEMP_FILES.tempSql, { force: true });
    await fs.rm(TEMP_FILES.tempDropSql, { force: true });
    log.success('Temporary files cleaned up.');
  } catch (error) {
    log.warn(`Could not clean up temporary files: ${error.message}`);
  }
}

/**
 * 메인 실행 함수
 */
async function main() {
  const config = getTargetConfig();
  const args = process.argv.slice(2);
  const isReset = args.includes('--reset');

  try {
    if (isReset) {
      await resetDatabase(config);
    }

    const migrationSql = await generateMigrationSql(config);

    if (!migrationSql.trim() || migrationSql.includes('-- This is an empty migration.')) {
      log.success('Schema is already up to date. No changes needed.');
      return;
    }

    log.info('Detected schema changes:');
    console.log(migrationSql);

    await applySqlToD1(config, migrationSql);

    log.step('3. Generating Prisma Client...');
    await execAsync('npx prisma generate');
    log.success('Prisma Client generated successfully.');

    log.step('4. Migration completed successfully.');
    log.success('Database schema is now up to date.');

    console.log('\n🎉 D1 migration completed successfully!');
  } catch (error) {
    log.error('The migration process failed.');
    // error 객체에 더 많은 정보가 있을 수 있으므로 전체를 로깅
    console.error(error);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

main();