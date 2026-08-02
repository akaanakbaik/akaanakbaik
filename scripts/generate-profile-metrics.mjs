import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compact, thousandSep, humanBytes, dateStamp, writeBadge, relativeTime, preciseAge, classifyRhythm, monthDay } from './lib/engine.mjs';
import { fetchProfileData } from './lib/collect.mjs';
import { ensureClones, scanRepository, aggregateCodeMetrics } from './lib/loc.mjs';
import { fetchUserActivity, computeStreak, fetchCommitTimestamps, fetchTopReposRanking } from './lib/activity.mjs';
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
  streakSvg,
  commitHoursSvg,
  calendarSvg,
  liveClockSvg,
  codingAgeSvg,
  codingRhythmSvg,
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

## Activity & Streak

| Metric | Value |
| --- | ---: |
| Current streak | ${data.streak.currentStreak} days |
| Longest streak | ${data.streak.longest} days |
| Active days (365d) | ${data.streak.activeDays} |
| Total contributions (365d) | ${data.streak.totalContributions} |
| Total commits | ${thousandSep(data.activity.totalCommitContributions)} |
| Pull requests | ${thousandSep(data.activity.pullRequests)} |
| Issues | ${thousandSep(data.activity.issues)} |
| PR reviews | ${thousandSep(data.activity.totalPRReviews)} |
| Repos contributed | ${thousandSep(data.activity.reposContributed)} |
| Peak coding hour | ${data.commitHours.peakHour}:00 WIB |
| Circular mean hour | ${data.commitHours.circularMean.toFixed(1)}:00 |
| Busiest weekday | ${data.commitHours.peakWeekday} |
| Commits sampled | ${thousandSep(data.commitHours.sampled)} |

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
  let activity = null;
  let streak = null;
  let commitHours = null;
  let topRanked = [];
  try {
    log('collecting activity and streak data');
    activity = await fetchUserActivity(token, username, log);
    streak = computeStreak(activity);
    commitHours = await fetchCommitTimestamps(data.client, username, data.allRepos, log);
    log(`streak: current=${streak.currentStreak}d longest=${streak.longest}d activeDays=${streak.activeDays} contributions=${streak.totalContributions}`);
    log(`commit hours: ${commitHours.sampled} sampled, peak ${commitHours.peakHour}:00, mean ${commitHours.circularMean.toFixed(1)}:00, busiest ${commitHours.peakWeekday}`);
    log('ranking top repositories by composite activity score');
    topRanked = await fetchTopReposRanking(data.client, token, username, data.allRepos, commitHours.perRepoCounts, log);
    log(`top 5: ${topRanked.slice(0, 5).map((r) => `${r.name}(${r.scorePct.toFixed(1)})`).join(', ')}`);
    await writeFile('generated/streak.svg', streakSvg({ ...activity, ...streak, activeDays: streak.activeDays }));
    await writeFile('generated/commit-hours.svg', commitHoursSvg({ ...commitHours, totalCommitContributions: activity.totalCommitContributions }));
    await writeFile('generated/calendar.svg', calendarSvg({ days: activity.days, level: activity.level, currentStreak: streak.currentStreak, longest: streak.longest }));
    await writeFile('generated/top-repos.svg', topReposSvg(topRanked));
    const rhythm = classifyRhythm(commitHours.hourCounts);
    const now = new Date();
    const wibParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(now);
    const wib = Object.fromEntries(wibParts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
    const dateText = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'long', year: 'numeric' }).format(now);
    const dayName = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', weekday: 'long' }).format(now);
    await writeFile('generated/live-clock.svg', liveClockSvg({ hour: Number(wib.hour), minute: Number(wib.minute), second: Number(wib.second), dateText, dayName, generatedAt: data.generatedAt }));
    await writeFile('generated/coding-rhythm.svg', codingRhythmSvg({ rhythm, hourCounts: commitHours.hourCounts, peakHour: commitHours.peakHour, sampled: commitHours.sampled, circularMean: commitHours.circularMean, circularStd: commitHours.circularStd, activeHours: commitHours.activeHours }));
    await writeBadge('streak-days', 'current streak', `${streak.currentStreak} days`, 'f59e0b');
    await writeBadge('total-commits', 'commits', compact(activity.totalCommitContributions), '2563eb');
    await writeBadge('total-prs', 'pull requests', compact(activity.pullRequests), '16a34a');
    await writeBadge('last-active', 'last active', streak.lastActiveDate ? relativeTime(`${streak.lastActiveDate}T00:00:00Z`) : 'unknown', '06b6d4');
    await writeBadge('peak-hour', 'peak coding hour', `${commitHours.peakHour}:00 WIB`, 'db2777');
    await writeBadge('coding-rhythm', 'coding rhythm', rhythm.label, 'a78bfa');
    await writeBadge('top-repo', 'top repo', topRanked[0] ? topRanked[0].name : 'none', 'fbbf24');
    await writeBadge('top-repo-score', 'top repo score', topRanked[0] ? topRanked[0].scorePct.toFixed(1) : '0', 'fbbf24');
  } catch (error) {
    log(`activity collection skipped: ${error.message}`);
  }
  const activitySafe = activity || {
    pullRequests: 0,
    issues: 0,
    reposContributed: 0,
    totalCommitContributions: 0,
    totalIssueContributions: 0,
    totalPRContributions: 0,
    totalPRReviews: 0,
    totalRepositoryContributions: 0,
    totalContributions: 0,
    days: [],
    level: () => 0
  };
  const streakSafe = streak || {
    currentStreak: 0,
    longest: 0,
    lastActiveDate: null,
    activeDays: 0,
    totalContributions: 0
  };
  const commitHoursSafe = commitHours || {
    sampled: 0,
    hourCounts: Array.from({ length: 24 }, () => 0),
    weekdayCounts: Array.from({ length: 7 }, () => 0),
    weekdayOrder: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    peakHour: 0,
    peakWeekday: 'Mon',
    circularMean: 0,
    circularStd: 0,
    activeHours: 0,
    reposWithCommits: 0,
    perRepoCounts: [],
    topCommitRepos: []
  };
  const codingAge = preciseAge(data.user.created_at);
  await writeFile('generated/coding-age.svg', codingAgeSvg({
    years: codingAge.years,
    months: codingAge.months,
    days: codingAge.days,
    totalDays: codingAge.totalDays,
    label: codingAge.label,
    createdAtText: monthDay(data.user.created_at),
    repos: data.publicRepos,
    commits: activitySafe.totalCommitContributions
  }));
  await writeBadge('coding-age', 'coding on GitHub', codingAge.label, '16a34a');
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
  if (topRanked.length === 0) await writeBadge('top-repo', 'top repo', data.topRepo, '764ba2');
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
    recentRepositories: data.recentRepositories,
    activity: {
      pullRequests: activitySafe.pullRequests,
      issues: activitySafe.issues,
      reposContributed: activitySafe.reposContributed,
      totalCommitContributions: activitySafe.totalCommitContributions,
      totalIssueContributions: activitySafe.totalIssueContributions,
      totalPRContributions: activitySafe.totalPRContributions,
      totalPRReviews: activitySafe.totalPRReviews,
      totalRepositoryContributions: activitySafe.totalRepositoryContributions,
      totalContributions: activitySafe.totalContributions
    },
    streak: streakSafe,
    commitHours: {
      sampled: commitHoursSafe.sampled,
      hourCounts: commitHoursSafe.hourCounts,
      weekdayCounts: commitHoursSafe.weekdayCounts,
      weekdayOrder: commitHoursSafe.weekdayOrder,
      peakHour: commitHoursSafe.peakHour,
      peakWeekday: commitHoursSafe.peakWeekday,
      circularMean: commitHoursSafe.circularMean,
      circularStd: commitHoursSafe.circularStd,
      activeHours: commitHoursSafe.activeHours,
      reposWithCommits: commitHoursSafe.reposWithCommits,
      topCommitRepos: commitHoursSafe.topCommitRepos,
      rhythm: classifyRhythm(commitHoursSafe.hourCounts)
    },
    codingAge: {
      years: codingAge.years,
      months: codingAge.months,
      days: codingAge.days,
      totalDays: codingAge.totalDays,
      label: codingAge.label,
      createdAt: data.user.created_at
    },
    top5Repos: topRanked.slice(0, 5)
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
