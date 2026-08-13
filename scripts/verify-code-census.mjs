import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { aggregateCodeMetrics, scanRepository } from './lib/loc.mjs';
import { runPool } from './lib/engine.mjs';

const cacheDir = process.env.CODE_CACHE_DIR || join('.cache', 'repos');

function equalTotals(left, right) {
  const fields = ['files', 'lines', 'codeLines', 'chars', 'nonWsChars', 'bytes'];
  return fields.every((field) => Number(left[field]) === Number(right[field]));
}

async function main() {
  const manifest = JSON.parse(await readFile('stats/code-census-manifest.json', 'utf8'));
  const profile = JSON.parse(await readFile('stats/profile-summary.json', 'utf8'));
  if (!Array.isArray(manifest.repositories) || !manifest.repositories.length) throw new Error('Code Census manifest has no repositories');
  const missing = manifest.repositories.filter((repo) => !existsSync(join(cacheDir, repo.name)));
  if (missing.length) throw new Error(`Code Census verification is missing ${missing.length} clone directories: ${missing.slice(0, 20).map((repo) => repo.name).join(', ')}`);
  const scans = [];
  const tasks = manifest.repositories.map((repo) => async () => {
    const scan = await scanRepository(join(cacheDir, repo.name));
    scans.push({ repo: repo.name, ...scan });
  });
  await runPool(tasks, 10);
  const aggregate = aggregateCodeMetrics(scans);
  if (aggregate.repositories !== manifest.repositories.length) throw new Error(`Code Census verification scanned ${aggregate.repositories} repositories but manifest declares ${manifest.repositories.length}`);
  if (!equalTotals(aggregate.totals, manifest.totals)) throw new Error(`Code Census manifest mismatch: expected ${JSON.stringify(manifest.totals)}, got ${JSON.stringify(aggregate.totals)}`);
  if (!profile.codeTotals || !equalTotals(aggregate.totals, profile.codeTotals.totals)) throw new Error('Code Census profile summary mismatch');
  await writeFile(
    'stats/code-census-verification.json',
    JSON.stringify({
      schemaVersion: 1,
      verifiedAt: new Date().toISOString(),
      repositories: aggregate.repositories,
      scannedFiles: aggregate.scannedFiles,
      excludedFiles: aggregate.excludedFiles,
      policy: aggregate.policy,
      totals: aggregate.totals
    }, null, 2) + '\n'
  );
  console.log(`Verified complete Code Census: ${aggregate.repositories} repositories, ${aggregate.totals.files} files, ${aggregate.totals.codeLines} nonblank lines, ${aggregate.totals.chars} Unicode characters`);
}

main().catch((error) => {
  console.error(`Code Census verification failed: ${error.stack || error.message}`);
  process.exit(1);
});
