import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compact, thousandSep, humanBytes, dateStamp, writeBadge, esc, colorFor } from './lib/engine.mjs';
import { fetchProfileData } from './lib/collect.mjs';
import { ensureClones, scanRepository, aggregateCodeMetrics } from './lib/loc.mjs';
import {
  githubStatsSvg,
  topLangsSvg,
  topReposSvg,
  cloudSvg,
  langDonutSvg,
  langParetoSvg,
  langRadarSvg,
  codeTotalsBadgeSvg,
  statsGridSvg,
  manifestLine
} from './lib/charts.mjs';
import { runPool } from './lib/engine.mjs';

const username = process.env.PROFILE_USERNAME || 'akaanakbaik';
const token = process.env.GITHUB_TOKEN || '';
const cacheDir = process.env.CODE_CACHE_DIR || join('.cache', 'repos');
const skipCodeTotals = process.env.SKIP_CODE_TOTALS === '1';

async function collectCodeTotals(allRepos) {
  const log = (msg) => console.log(`[code-totals] ${msg}`);
  const outcomes = await ensureClones(allRepos, cacheDir, { token, owner: username, log });
  const cloned = outcomes.filter((o) => o.status.startsWith('cloned'));
  const cached = outcomes.filter((o) => o.status === 'cached');
  const skipped = outcomes.filter((o) => o.status === 'skipped');
  log(`clones: ${cloned.length} new, ${cached.length} cached, ${skipped.length} skipped`);
  const scans = [];
  const tasks = allRepos.map((repo) => async () => {
    try {
      scans.push(await scanRepository(join(cacheDir, repo.name)));
    } catch (error) {
      log(`scan skip ${repo.name}: ${error.message}`);
    }
  });
  await runPool(tasks, 10);
  const aggregate = aggregateCodeMetrics(scans);
  return { aggregate, skipped };
}

function summaryMarkdown(data) {
  const code = data.codeTotals || null;
  const dist = data.languageDistribution;
  const topRows = data.topRepositories.map((r, i) => `| ${i + 1} | [${r.name}](${r.url}) | ${r.stars} | ${r.forks} | ${r.language} |`).join('\n');
  const langRows = dist.byBytes.map((x) => `| ${x.name} | ${x.repos} | ${x.bytes} | ${((x.bytes / (dist.totalBytes || 1)) * 100).toFixed(2)}% |`).join('\n');
  const codeRows = code ? code.perLang.map((x) => `| ${x.name} | ${thousandSep(x.lines)} | ${thousandSep(x.chars)} | ${thousandSep(x.files)} |`).join('\n') : '| - | 0 | 0 | 0 |';
  const frontRows = (data.frontendStack || []).map((x) => `| ${x.name} | ${x.count} |`).join('\n') || '| - | 0 |';
  const backRows = (data.backendStack || []).map((x) => `| ${x.name} | ${x.count} |`).join('\n') || '| - | 0 |';
  return `# Profile Metrics Summary

Generated: ${data.generatedAt}

## Account

| Metric | Value |
| --- | ---: |
| Public repos | ${data.publicRepos} |
| Original repos | ${data.originalRepos} |
| Forked repos | ${data.forkedRepos} |
| Archived repos | ${data.archivedRepos} |
| Followers | ${data.followers} |
| Following | ${data.following} |
| Public gists | ${data.publicGists} |
| Total stars | ${data.totalStars} |
| Total forks | ${data.totalForks} |
| Total watchers | ${data.totalWatchers} |
| Total repo size | ${data.totalSize} |
| Top language | ${data.topLanguage} |

## Code Totals (scanned from all repositories)

| Metric | Value |
| --- | ---: |
| Files scanned | ${code ? thousandSep(code.totals.files) : '0'} |
| Total lines | ${code ? thousandSep(code.totals.lines) : '0'} |
| Code lines (non-empty) | ${code ? thousandSep(code.totals.codeLines) : '0'} |
| Total characters | ${code ? thousandSep(code.totals.chars) : '0'} |
| Non-whitespace characters | ${code ? thousandSep(code.totals.nonWsChars) : '0'} |
| Bytes scanned | ${code ? humanBytes(code.totals.bytes) : '0'} |

## Lines of Code per Language

| Language | Lines | Chars | Files |
| --- | ---: | ---: | ---: |
${codeRows}

## Language Distribution Statistics

| Statistic | Value |
| --- | ---: |
| Distinct languages | ${dist.languagesCount} |
| Shannon entropy | ${dist.entropy.toFixed(3)} bits (max ${dist.entropyMax.toFixed(3)}) |
| Redundancy | ${(dist.redundancy * 100).toFixed(1)}% |
| Herfindahl-Hirschman Index | ${dist.hhi.toFixed(1)} (×10⁴) |
| Gini coefficient | ${dist.gini.toFixed(4)} |
| CR₃ concentration | ${dist.cr3.toFixed(2)}% |
| CR₅ concentration | ${dist.cr5.toFixed(2)}% |
| Pareto 80% coverage | top ${dist.pareto80.count} of ${dist.pareto80.totalCount} languages |
| Top language share | ${dist.topShare.toFixed(2)}% |
| Geometric mean bytes | ${compact(dist.geomeanBytes)} |
| Coefficient of variation | ${dist.cv.toFixed(3)} |

## Language Bytes

| Language | Repos | Bytes | Share |
| --- | ---: | ---: | ---: |
${langRows}

## Top 3 Repositories

| # | Repo | Stars | Forks | Language |
| --- | --- | --- | ---: | --- |
${topRows}

## Frontend Stack

| Stack | Repos |
| --- | ---: |
${frontRows}

## Backend Stack

| Stack | Repos |
| --- | ---: |
${backRows}
`;
}

async function main() {
  const log = (msg) => console.log(`[metrics] ${msg}`);
  log(`starting profile metrics for ${username}${skipCodeTotals ? ' (skipping code totals)' : ''}`);
  const data = await fetchProfileData({ username, token, log });
  let codeTotals = null;
  if (!skipCodeTotals) {
    log('computing code totals across all repositories');
    const result = await collectCodeTotals(data.allRepos);
    codeTotals = result.aggregate;
    const t = codeTotals.totals;
    log(`code totals: ${thousandSep(t.lines)} lines, ${thousandSep(t.chars)} chars, ${thousandSep(t.files)} files`);
    const perLangTop = codeTotals.perLang.slice(0, 5).map((x) => x.name).join(', ');
    const badge = codeTotalsBadgeSvg({
      totalLines: t.lines,
      totalChars: t.chars,
      repoCount: data.publicRepos,
      files: t.files,
      generatedAt: data.generatedAt,
      perLangTop
    });
    await writeFile('generated/code-totals.svg', badge);
    await writeBadge('total-lines', 'lines of code', compact(t.lines), '667eea');
    await writeBadge('total-chars', 'code characters', compact(t.chars), 'f59e0b');
    await writeBadge('code-files', 'code files', compact(t.files), '06b6d4');
  }
  const distribution = data.languageDistribution;
  await writeBadge('language-count', 'languages', compact(distribution.languagesCount), 'a855f7');
  await mkdir('badges', { recursive: true });
  await mkdir('stats', { recursive: true });
  await mkdir('generated', { recursive: true });
  await writeBadge('public-repos', 'public repos', compact(data.publicRepos), '667eea');
  await writeBadge('original-repos', 'original repos', compact(data.originalRepos), '764ba2');
  await writeBadge('forked-repos', 'forked repos', compact(data.forkedRepos), '111827');
  await writeBadge('followers', 'followers', compact(data.followers), '2563eb');
  await writeBadge('following', 'following', compact(data.following), '06b6d4');
  await writeBadge('public-gists', 'public gists', compact(data.publicGists), '16a34a');
  await writeBadge('total-stars', 'total stars', compact(data.totalStars), 'f59e0b');
  await writeBadge('total-forks', 'total forks', compact(data.totalForks), '16a34a');
  await writeBadge('total-watchers', 'watchers', compact(data.totalWatchers), 'db2777');
  await writeBadge('repo-size', 'repo size', data.totalSize, '06b6d4');
  await writeBadge('top-language', 'top language', data.topLanguage, 'a855f7');
  await writeBadge('top-repo', 'top repo', data.topRepo, '764ba2');
  await writeBadge('recent-repo', 'recent repo', data.recentRepo, '667eea');
  await writeBadge('account-age', 'account age', data.accountAge, '16a34a');
  await writeBadge('last-updated', 'updated', data.generatedAt, 'ef4444');
  const payload = {
    username,
    generatedAt: data.generatedAt,
    publicRepos: data.publicRepos,
    originalRepos: data.originalRepos,
    forkedRepos: data.forkedRepos,
    archivedRepos: data.archivedRepos,
    followers: data.followers,
    following: data.following,
    publicGists: data.publicGists,
    totalStars: data.totalStars,
    totalForks: data.totalForks,
    totalWatchers: data.totalWatchers,
    totalSize: data.totalSize,
    totalSizeKb: data.totalSizeKb,
    topLanguage: data.topLanguage,
    accountAge: data.accountAge,
    topRepo: data.topRepo,
    recentRepo: data.recentRepo,
    largestRepo: data.largestRepo,
    languageDistribution: {
      totalBytes: distribution.totalBytes,
      languagesCount: distribution.languagesCount,
      entropy: distribution.entropy,
      entropyMax: distribution.entropyMax,
      redundancy: distribution.redundancy,
      hhi: distribution.hhi,
      gini: distribution.gini,
      cr3: distribution.cr3,
      cr5: distribution.cr5,
      pareto80: distribution.pareto80,
      topShare: distribution.topShare,
      geomeanBytes: distribution.geomeanBytes,
      medianBytes: distribution.medianBytes,
      cv: distribution.cv,
      byBytes: distribution.byBytes,
      byRepo: distribution.byRepo
    },
    codeTotals: codeTotals
      ? {
          totals: codeTotals.totals,
          perLang: codeTotals.perLang
        }
      : null,
    frontendStack: data.dependencyStacks.frontend,
    backendStack: data.dependencyStacks.backend,
    topRepositories: data.topRepositories,
    recentRepositories: data.recentRepositories
  };
  await writeFile('stats/profile-summary.json', JSON.stringify(payload, null, 2) + '\n');
  await writeFile('stats/profile-summary.md', summaryMarkdown(payload));
  await writeFile('generated/github-stats.svg', githubStatsSvg(payload));
  await writeFile('generated/stats-grid.svg', statsGridSvg(payload));
  await writeFile('generated/profile-dashboard.svg', githubStatsSvg(payload));
  await writeFile('generated/top-langs.svg', topLangsSvg({ byBytes: distribution.byBytes }));
  await writeFile('generated/top-repos.svg', topReposSvg(data.topRepositories));
  await writeFile('generated/lang-donut.svg', langDonutSvg({ ...distribution, repoCount: data.publicRepos }));
  await writeFile('generated/lang-pareto.svg', langParetoSvg({ ...distribution, repoCount: data.publicRepos }));
  await writeFile('generated/lang-radar.svg', langRadarSvg({ ...distribution, repoCount: data.publicRepos }));
  await writeFile(
    'generated/stack-languages.svg',
    cloudSvg(
      'Languages from All Repositories',
      'Rightmost badge is the most used language by scanned repository bytes',
      distribution.byBytes.map((x) => ({ name: x.name, count: x.repos })),
      [{ name: 'JavaScript', count: 1 }, { name: 'TypeScript', count: 1 }, { name: 'Python', count: 1 }]
    )
  );
  await writeFile(
    'generated/stack-frontend.svg',
    cloudSvg(
      'Frontend Stack from Repository Scan',
      'Detected from package.json dependencies across all public repositories',
      data.dependencyStacks.frontend,
      [{ name: 'React', count: 1 }, { name: 'Vite', count: 1 }, { name: 'Tailwind', count: 1 }]
    )
  );
  await writeFile(
    'generated/stack-backend.svg',
    cloudSvg(
      'Backend Stack from Repository Scan',
      'Detected from package.json dependencies across all public repositories',
      data.dependencyStacks.backend,
      [{ name: 'Node.js', count: 1 }, { name: 'Express', count: 1 }, { name: 'Supabase', count: 1 }]
    )
  );
  log(manifestLine(payload));
  log('profile metrics generation complete');
}

main().catch((error) => {
  console.error(`[metrics] FATAL: ${error.stack || error.message}`);
  process.exit(1);
});
