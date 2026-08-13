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
  const empty = outcomes.filter((o) => o.status === 'empty');
  const skipped = outcomes.filter((o) => o.status === 'skipped');
  log(`clones: ${cloned.length} new, ${cached.length} cached, ${empty.length} empty, ${skipped.length} skipped`);
  if (skipped.length) throw new Error(`code scan aborted: ${skipped.length} repositories could not be cloned`);
  const scans = [];
  const scanErrors = [];
  const scanTasks = allRepos.map((repo) => async () => {
    const dir = join(cacheDir, repo.name);
    try {
      scans.push({ repo: repo.name, ...await scanRepository(dir) });
    } catch (error) {
      scanErrors.push(`${repo.name}: ${error.message}`);
    }
  });
  await runPool(scanTasks, 10);
  if (scanErrors.length) throw new Error(`code scan aborted: ${scanErrors.join('; ')}`);
  const aggregate = aggregateCodeMetrics(scans);
  const totals = aggregate.totals;
  const perLangTop = aggregate.perLang.slice(0, 5).map((x) => x.name).join(', ');
  const badge = codeTotalsBadgeSvg({
    totalLines: totals.codeLines,
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
    JSON.stringify({ schemaVersion: 1, label: 'nonblank code lines', message: compact(totals.codeLines), color: '4338ca' }, null, 2) + '\n'
  );
  await writeFile(
    'badges/total-chars.json',
    JSON.stringify({ schemaVersion: 1, label: 'Unicode code characters', message: compact(totals.chars), color: 'b45309' }, null, 2) + '\n'
  );
  await writeFile(
    'badges/code-files.json',
    JSON.stringify({ schemaVersion: 1, label: 'tracked code files', message: compact(totals.files), color: '0e7490' }, null, 2) + '\n'
  );
  await writeFile('generated/code-totals.svg', badge);
  const snapshot = {
    username,
    generatedAt: dateStamp(),
    reposScanned: allRepos.length,
    skippedRepos: skipped.map((o) => o.repo),
    emptyRepos: empty.map((o) => o.repo),
    files: totals.files,
    lines: totals.lines,
    chars: totals.chars,
    physicalLines: totals.lines,
    sourceLines: totals.codeLines,
    unicodeCharacters: totals.chars,
    nonWhitespaceCharacters: totals.nonWsChars,
    scannedFiles: aggregate.scannedFiles,
    excludedFiles: aggregate.excludedFiles,
    exclusionSamples: aggregate.exclusionSamples,
    bytes: totals.bytes,
    policy: aggregate.policy,
    perLanguage: aggregate.perLang
  };
  await writeFile('stats/code-totals.json', JSON.stringify(snapshot, null, 2) + '\n');
  await writeFile(
    'stats/code-census-manifest.json',
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: snapshot.generatedAt,
      policy: aggregate.policy,
      repositories: allRepos.map((repo) => ({ name: repo.name, defaultBranch: repo.default_branch || 'main', pushedAt: repo.pushed_at || null })),
      totals
    }, null, 2) + '\n'
  );
  log(`sourceLines=${thousandSep(totals.codeLines)} physicalLines=${thousandSep(totals.lines)} unicodeChars=${thousandSep(totals.chars)} files=${thousandSep(totals.files)} langs=${aggregate.perLang.length}`);
}

main().catch((error) => {
  console.error(`[code-totals] FATAL: ${error.stack || error.message}`);
  process.exit(1);
});
