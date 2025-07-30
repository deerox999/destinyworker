/**
 * D1 데이터베이스 콘솔 스크립트
 *
 * 이 스크립트는 Cloudflare D1 데이터베이스와 상호작용하기 위한 간단한 CLI를 제공합니다.
 * 테이블 목록 조회, 특정 테이블의 모든 데이터 조회, 직접 SQL 쿼리 실행 등의 기능을 지원합니다.
 *
 * 사용법:
 * 1. 모든 테이블 목록 조회:
 *    node scripts/db-console.js --local --list-tables
 *    node scripts/db-console.js --remote --list-tables
 *
 * 2. 특정 테이블의 모든 데이터 조회 (상위 100개):
 *    node scripts/db-console.js --local --table users
 *    node scripts/db-console.js --remote --table celebrity_comments
 *
 * 3. 직접 SQL 쿼리 실행:
 *    node scripts/db-console.js --local --query "SELECT * FROM users WHERE id = 1;"
 *    node scripts/db-console.js --remote --query "SELECT COUNT(*) FROM posts;"
 */

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// --- 설정 ---
const DB_CONFIGS = {
  remote: { name: 'destiny-new', flags: '--remote' },
  dev: { name: 'destiny-dev', flags: '--remote' },
  local: { name: 'destiny-local', flags: '--local' },
};

// --- 로깅 유틸리티 ---
const log = {
  info: (message) => console.log(`[INFO] ${message}`),
  error: (message) => console.error(`[ERROR] ❌ ${message}`),
  success: (message) => console.log(`[SUCCESS] ✅ ${message}`),
  step: (message) => console.log(`
🚀 ${message}`),
};

/**
 * Wrangler D1 명령어를 실행하고 결과를 JSON으로 파싱합니다.
 */
async function executeD1(dbName, flags, query) {
  const command = `npx wrangler d1 execute ${dbName} ${flags} --command "${query.replace(/"/g, '\"')}" --json`;
  try {
    const { stdout } = await execAsync(command);
    return JSON.parse(stdout);
  } catch (e) {
    log.error(`D1 execution failed: ${e.message}`);
    log.error(`Stderr: ${e.stderr}`);
    throw new Error(`Failed to execute D1 command.`);
  }
}

/**
 * 메인 실행 함수
 */
async function main() {
  const args = process.argv.slice(2);

  // 환경 설정
  let env = 'remote'; // 기본값
  if (args.includes('--local')) env = 'local';
  if (args.includes('--dev')) env = 'dev';
  const config = DB_CONFIGS[env];

  log.info(`Target environment: ${env.toUpperCase()}`);

  try {
    // 기능 분기
    if (args.includes('--list-tables')) {
      log.step('Fetching list of tables...');
      const query = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%';";
      const result = await executeD1(config.name, config.flags, query);
      console.table(result[0]?.results || []);
      log.success('Finished listing tables.');

    } else if (args.includes('--table')) {
      const tableIndex = args.indexOf('--table') + 1;
      const tableName = args[tableIndex];
      if (!tableName) throw new Error('--table option requires a table name.');
      
      log.step(`Fetching all data from table: ${tableName} (LIMIT 100)...`);
      const query = `SELECT * FROM ${tableName} LIMIT 100;`;
      const result = await executeD1(config.name, config.flags, query);
      console.table(result[0]?.results || []);
      log.success(`Finished fetching data from ${tableName}.`);

    } else if (args.includes('--query')) {
      const queryIndex = args.indexOf('--query') + 1;
      const query = args[queryIndex];
      if (!query) throw new Error('--query option requires a SQL string.');

      log.step(`Executing custom query...`);
      console.log(`Query: ${query}`);
      const result = await executeD1(config.name, config.flags, query);
      console.table(result[0]?.results || []);
      log.success('Finished executing custom query.');

    } else {
      log.error('No valid option provided. Please use --list-tables, --table <name>, or --query "<SQL>".');
    }

  } catch (error) {
    log.error('Operation failed.');
    process.exit(1);
  }
}

main();