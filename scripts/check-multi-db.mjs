#!/usr/bin/env node
/**
 * Build-time multi-database guard.
 *
 * The project supports at most FIVE Neon databases: 1 primary (DATABASE_URL) plus
 * up to 4 secondaries (DATABASE_URL_2 .. DATABASE_URL_5). If a build environment
 * has a 6th+ database variable set (DATABASE_URL_6 and beyond), the build FAILS with
 * a clear message instead of silently ignoring it — a misconfigured deployment should
 * not proceed.
 *
 * Exits 0 when the config is valid (or multi-db is fully unused). Exits 1 otherwise.
 */

const MAX_SECONDARY = 4; // DATABASE_URL_2..5 (plus 1 primary = 5 total)

function main() {
  // Detect any database variable beyond the supported 5.
  // Secondaries are DATABASE_URL_2..DATABASE_URL_5 (MAX_SECONDARY=4). Anything at
  // DATABASE_URL_6 and beyond is EXTRA and must fail the build.
  const extra = [];
  for (let i = MAX_SECONDARY + 2; i <= 20; i++) {
    const name = `DATABASE_URL_${i}`;
    if (process.env[name] && process.env[name].trim() !== '') {
      extra.push(name);
    }
  }

  if (extra.length > 0) {
    console.error('');
    console.error('==============================================================');
    console.error('  MULTI-DATABASE LIMIT REACHED');
    console.error('==============================================================');
    console.error(
      `  This project supports at most ${MAX_SECONDARY + 1} Neon databases ` +
        `(1 primary + ${MAX_SECONDARY} secondaries).`,
    );
    console.error('  The following EXTRA database variables are set in this environment:');
    for (const name of extra) console.error(`    - ${name}`);
    console.error('');
    console.error(
      '  Please remove any DATABASE_URL_6 or higher, or delete one of the existing',
      '  secondary databases, then rebuild.',
    );
    console.error('==============================================================');
    process.exit(1);
  }

  // Secondary databases actually present.
  const secondaries = [];
  for (let i = 2; i <= MAX_SECONDARY + 1; i++) {
    const name = `DATABASE_URL_${i}`;
    if (process.env[name] && process.env[name].trim() !== '') secondaries.push(name);
  }

  const optedIn = process.env.MULTI_DB_ENABLED === 'true';
  if (secondaries.length === 0) {
    console.log('[multi-db] no secondary databases configured — feature disabled.');
    return;
  }
  if (!optedIn) {
    console.log(
      `[multi-db] ${secondaries.length} secondary DB(s) present but MULTI_DB_ENABLED is not true — feature stays off.`,
    );
    return;
  }
  console.log(
    `[multi-db] OK: ${secondaries.length} secondary DB(s) (${secondaries.join(', ')}), within the ${MAX_SECONDARY} limit.`,
  );
}

try {
  main();
} catch (e) {
  console.error('[multi-db] unexpected error during check:', e);
  process.exit(1);
}
