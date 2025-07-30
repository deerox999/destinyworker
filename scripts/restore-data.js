/*
D1 데이터베이스 백업 데이터 복구 스크립트

이 스크립트는 prisma/backup/all_data_insert.sql 파일을 읽어서
D1 데이터베이스에 데이터를 복구합니다.

npx wrangler d1 execute destiny-dev --remote --file=prisma/backup/all_data_insert.sql

사용법:
  node scripts/restore-data.js [환경옵션]

환경 옵션:
  --local     로컬 D1 데이터베이스 (destiny-local)
  --dev       개발 환경 D1 데이터베이스 (destiny-dev) - 기본값
  --remote    프로덕션 D1 데이터베이스 (destiny-new)

예시:
  node scripts/restore-data.js --dev
  node scripts/restore-data.js --local
  node scripts/restore-data.js --remote
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

const BACKUP_FILE = path.join(__dirname, '..', 'prisma', 'backup', 'all_data_insert.sql');

// --- 로깅 유틸리티 ---
const log = {
  info: (message) => console.log(`[INFO] ${message}`),
  warn: (message) => console.warn(`[WARN] ⚠️  ${message}`),
  error: (message) => console.error(`[ERROR] ❌ ${message}`),
  success: (message) => console.log(`[SUCCESS] ✅ ${message}`),
  step: (message) => console.log(`\n🚀 ${message}`),
};

/**
 * 실행 인자를 파싱하여 대상 환경 설정을 반환합니다.
 */
function getTargetConfig() {
  const args = process.argv.slice(2);
  let env = 'dev'; // 기본값
  if (args.includes('--local')) env = 'local';
  if (args.includes('--dev')) env = 'dev';
  if (args.includes('--remote')) env = 'remote';

  log.info(`Target environment: ${env.toUpperCase()}`);
  return DB_CONFIGS[env];
}

/**
 * 백업 파일이 존재하는지 확인합니다.
 */
async function checkBackupFile() {
  try {
    await fs.access(BACKUP_FILE);
    const stats = await fs.stat(BACKUP_FILE);
    log.info(`Backup file found: ${BACKUP_FILE}`);
    log.info(`File size: ${(stats.size / 1024).toFixed(2)} KB`);
    return true;
  } catch (error) {
    log.error(`Backup file not found: ${BACKUP_FILE}`);
    log.error('Please run "node scripts/extract-all-data.js" first to create backup.');
    return false;
  }
}

/**
 * 백업 데이터를 복구합니다.
 */
async function restoreData(config) {
  log.step('RESTORING BACKUP DATA...');
  const { name, flags } = config;

  try {
    log.info(`Executing backup SQL on D1 database: ${name}`);
    await execAsync(`npx wrangler d1 execute ${name} ${flags} --file=${BACKUP_FILE}`);
    log.success('Backup data restored successfully.');
  } catch (error) {
    log.error('Failed to restore backup data.');
    console.error(error);
    throw error;
  }
}

/**
 * 메인 실행 함수
 */
async function main() {
  const config = getTargetConfig();

  try {
    // 백업 파일 확인
    if (!await checkBackupFile()) {
      process.exit(1);
    }

    // 데이터 복구
    await restoreData(config);

    console.log('\n🎉 Data restoration completed successfully!');
    console.log('💡 Your database is now ready with the restored data.');
  } catch (error) {
    log.error('The restoration process failed.');
    console.error(error);
    process.exit(1);
  }
}

main(); 