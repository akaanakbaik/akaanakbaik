import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient, runPool, compact, thousandSep, dateStamp } from './lib/engine.mjs';
import { ensureClones, scanRepository, aggregateCodeMetrics } from './lib/loc.mjs';
import { codeTotalsBadgeSvg } from './lib/charts.mjs';

const username = process.env.PROFILE_USERNAME || 'akaanakbaik';
const token = process.env.GITHUB_TOKEN || '';
const cacheDir = process.env.CODE_CACHE_DIR || join('.cache', 'repos');

async function main() {
  const log = (msg) => console.log(`[code-totals] ${msg}`);
  const client = createClient({ token, owner: username, log });
  const allRepos = (await client.paginate(`/users/${username}/repos?type=owner&sort=updated&direction=desc`)).filter((r) => !r.private);
  log(`found ${allRepos.length} public repositories`);
  const outcomes = await ensureClones(allRepos, cacheDir, { token, owner: username, log });
  const cloned = outcomes.filter((o) => o.status.startsWith('cloned'));
  const cached = outcomes.filter((o) => o.status === 'cached');
  const skipped = outcomes.filter((o) => o.status === 'skipped');
  log(`clones: ${cloned.length} new, ${cached.length} cached, ${skipped.length} skipped`);
  const scans = [];
  const scanTasks = allRepos.map((repo) => async () => {
    const dir = join(cacheDir, repo.name);
    try {
      const scan = await scanRepository(dir);
      scans.push(scan);
    } catch (error) {
      log(`scan skip ${repo.name}: ${error.message}`);
    }
  });
  await runPool(scanTasks, 10);
  const aggregate = aggregateCodeMetrics(scans);
  const totals = aggregate.totals;
  const perLangTop = aggregate.perLang.slice(0, 5).map((x) => x.name).join(', ');
  const badge = codeTotalsBadgeSvg({
    totalLines: totals.lines,
    totalChars: totals.chars,
    repoCount: allRepos.length,
    files: totals.files,
    generatedAt: dateStamp(),
    perLangTop
  });
  await mkdir('badges', { recursive: true });
  await mkdir('generated', { recursive: true });
  await mkdir('stats', { recursive: true });
  await writeFile(
    'badges/total-lines.json',
    JSON.stringify({ schemaVersion: 1, label: 'lines of code', message: compact(totals.lines), color: '667eea' }, null, 2) + '\n'
  );
  await writeFile(
    'badges/total-chars.json',
    JSON.stringify({ schemaVersion: 1, label: 'code characters', message: compact(totals.chars), color: 'f59e0b' }, null, 2) + '\n'
  );
  await writeFile('generated/code-totals.svg', badge);
  const snapshot = {
    username,
    generatedAt: dateStamp(),
    reposScanned: allRepos.length,
    skippedRepos: skipped.map((o) => o.repo),
    files: totals.files,
    lines: totals.lines,
    codeLines: totals.codeLines,
    chars: totals.chars,
    nonWhitespaceChars: totals.nonWsChars,
    bytes: totals.bytes,
    perLanguage: aggregate.perLang
  };
  await writeFile('stats/code-totals.json', JSON.stringify(snapshot, null, 2) + '\n');
  log(`lines=${thousandSep(totals.lines)} chars=${thousandSep(totals.chars)} files=${thousandSep(totals.files)} langs=${aggregate.perLang.length}`);
}

main().catch((error) => {
  console.error(`[code-totals] FATAL: ${error.stack || error.message}`);
  process.exit(1);
});
