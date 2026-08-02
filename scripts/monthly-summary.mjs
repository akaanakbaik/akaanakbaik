import { mkdir, writeFile } from 'node:fs/promises';
import { createClient, runPool, thousandSep, compact, dateStamp, writeBadge, hourInTz, weekdayInTz } from './lib/engine.mjs';
import { monthlySummarySvg } from './lib/charts.mjs';

const username = process.env.PROFILE_USERNAME || 'akaanakbaik';
const token = process.env.GITHUB_TOKEN || '';
const DAYS_BACK = 30;

function iso(d) {
  return d.toISOString().slice(0, 10);
}

function shortDate(isoStr) {
  const d = new Date(isoStr);
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short' }).format(d);
}

async function fetchRepoCommits(client, username, repo, sinceIso, log) {
  try {
    const ref = encodeURIComponent(repo.default_branch || 'main');
    const commits = await client.request(`/repos/${username}/${encodeURIComponent(repo.name)}/commits?since=${sinceIso}&per_page=100`);
    if (!Array.isArray(commits)) return { repo: repo.name, commits: [] };
    const owned = [];
    for (const c of commits) {
      if (c.author && c.author.login !== username) continue;
      const date = c.commit && c.commit.author && c.commit.author.date;
      if (!date) continue;
      owned.push({ date, sha: c.sha, message: (c.commit.message || '').split('\n')[0] });
    }
    return { repo: repo.name, commits: owned };
  } catch (error) {
    log(`monthly commits skip ${repo.name}: ${error.message}`);
    return { repo: repo.name, commits: [] };
  }
}

function computeStats(allCommits, daysBack) {
  const perRepo = new Map();
  const dayCounts = new Map();
  const hourCounts = Array.from({ length: 24 }, () => 0);
  const weekdayCounts = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
  const langRepo = new Map();
  let total = 0;
  for (const { repo, commits, language } of allCommits) {
    if (!commits.length) continue;
    perRepo.set(repo, (perRepo.get(repo) || 0) + commits.length);
    if (language) langRepo.set(language, (langRepo.get(language) || 0) + 1);
    for (const c of commits) {
      total += 1;
      const day = iso(new Date(c.date));
      dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
      const h = hourInTz(c.date);
      if (h !== null) hourCounts[h] += 1;
      const wd = weekdayInTz(c.date);
      if (wd && wd in weekdayCounts) weekdayCounts[wd] += 1;
    }
  }
  const days = [...dayCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const busiestDay = days.length ? [...days].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] : null;
  const weekdayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const busiestWeekday = weekdayOrder.reduce((best, w) => (weekdayCounts[w] > weekdayCounts[best] ? w : best), 'Mon');
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
  const sortedRepos = [...perRepo.entries()].sort((a, b) => b[1] - a[1]);
  let currentStreak = 0;
  let cursor = new Date(Date.now() - 86400000);
  const daySet = new Set(dayCounts.keys());
  while (daySet.has(iso(cursor)) && currentStreak < daysBack) {
    currentStreak += 1;
    cursor = new Date(cursor.getTime() - 86400000);
  }
  const langs = [...langRepo.entries()].sort((a, b) => b[1] - a[1]);
  return {
    total,
    activeDays: dayCounts.size,
    busiestDay,
    busiestWeekday,
    peakHour,
    currentStreak,
    dayCounts,
    sortedRepos,
    langs,
    hourCounts
  };
}

function narrative(stats, rangeStart, rangeEnd, prs, issues) {
  const lines = [];
  const avg = stats.total ? (stats.total / stats.activeDays).toFixed(1) : '0';
  const top = stats.sortedRepos.slice(0, 3).map(([name, count]) => `${name} (${count})`).join(', ');
  const topLang = stats.langs.slice(0, 3).map(([l, n]) => `${l} ×${n}`).join(', ');
  lines.push(
    `Selama 30 hari terakhir (${rangeStart} – ${rangeEnd}), aku membuat ${thousandSep(stats.total)} commit di ${stats.sortedRepos.length} repositori dan aktif selama ${stats.activeDays} hari — rata-rata ${avg} commit per hari aktif.`
  );
  const dayPart = stats.busiestDay
    ? `Hari paling produktif adalah ${shortDate(stats.busiestDay[0])} dengan ${thousandSep(stats.busiestDay[1])} commit`
    : `Tidak ada hari dengan aktivitas dominan`;
  const rhythmPart =
    stats.peakHour >= 20 || stats.peakHour <= 4
      ? `Puncak aktivitas terjadi sekitar jam ${stats.peakHour}:00 WIB — aku paling produktif di malam hari (night owl mode).`
      : stats.peakHour >= 5 && stats.peakHour <= 10
        ? `Puncak aktivitas terjadi sekitar jam ${stats.peakHour}:00 WIB — aku bangun pagi dan langsung ngoding (early bird).`
        : `Puncak aktivitas terjadi sekitar jam ${stats.peakHour}:00 WIB.`;
  lines.push(`${dayPart}, dan ${stats.busiestWeekday} menjadi hari tersibuk dalam seminggu. ${rhythmPart}`);
  if (stats.currentStreak > 1) {
    lines.push(`Catatan penting: ada streak aktif ${stats.currentStreak} hari berturut-turut tanpa putus — konsistensi yang luar biasa!`);
  }
  if (top) {
    lines.push(`Repo paling sibuk bulan ini: ${top}.`);
  }
  if (topLang) {
    lines.push(`Bahasa yang paling sering kupakai: ${topLang}.`);
  }
  if (prs > 0 || issues > 0) {
    const parts = [];
    if (prs > 0) parts.push(`${prs} pull request`);
    if (issues > 0) parts.push(`${issues} issue`);
    lines.push(`Selain itu aku juga membuka ${parts.join(' dan ')} — terus berkontribusi dan berkolaborasi.`);
  }
  lines.push(`Kesimpulan: ${stats.total > 150 ? 'bulan yang sangat produktif — energiku tinggi dan proyek terus bergerak maju.' : stats.total > 60 ? 'bulan yang solid — ritme konsisten, tinggal dijaga momentumnya.' : 'bulan yang santai — waktu untuk recharge dan mulai proyek baru.'} Terus ngoding, tetap semangat! 🚀`);
  return lines.join('\n\n');
}

async function main() {
  const log = (m) => console.log(`[monthly] ${m}`);
  const client = createClient({ token, owner: username, log });
  const now = new Date();
  const since = new Date(now.getTime() - DAYS_BACK * 86400000);
  const sinceIso = since.toISOString();
  const rangeStart = shortDate(sinceIso);
  const rangeEnd = shortDate(now.toISOString());
  log(`collecting commits since ${sinceIso}`);
  const allRepos = (await client.paginate(`/users/${username}/repos?type=owner&sort=updated&direction=desc`)).filter((r) => !r.private);
  const tasks = allRepos.map((repo) => async () => fetchRepoCommits(client, username, repo, sinceIso, log));
  const results = await runPool(tasks, 12);
  const enriched = results.map((r) => {
    const repo = allRepos.find((x) => x.name === r.repo);
    return { ...r, language: repo ? repo.language : 'Unknown' };
  });
  const stats = computeStats(enriched, DAYS_BACK);
  log(`total commits 30d = ${stats.total}, active days = ${stats.activeDays}, peak hour = ${stats.peakHour}:00, busiest weekday = ${stats.busiestWeekday}`);

  let prs = 0;
  let issues = 0;
  try {
    const sinceSearch = sinceIso.slice(0, 10);
    const prRes = await client.request(`/search/issues?q=author:${username}+is:pr+created:>=${sinceSearch}&per_page=1`);
    const isRes = await client.request(`/search/issues?q=author:${username}+is:issue+created:>=${sinceSearch}&per_page=1`);
    prs = prRes && prRes.total_count ? prRes.total_count : 0;
    issues = isRes && isRes.total_count ? isRes.total_count : 0;
    log(`PRs opened = ${prs}, issues opened = ${issues}`);
  } catch (error) {
    log(`search skipped: ${error.message}`);
  }

  const monthName = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', month: 'long', year: 'numeric' }).format(now);
  const body = narrative(stats, rangeStart, rangeEnd, prs, issues);
  await mkdir('generated', { recursive: true });
  await mkdir('stats', { recursive: true });
  await mkdir('badges', { recursive: true });
  await writeFile('generated/monthly-summary.svg', monthlySummarySvg({ monthName, rangeStart, rangeEnd, body, stats, prs, issues }));
  const md = `# Ringkasan AI Bulanan — ${monthName}\n\n**Periode:** ${rangeStart} – ${rangeEnd} · dihasilkan otomatis oleh GitHub Actions\n\n${body.split('\n\n').map((p) => p + '\n').join('\n')}\n\n---\n\n## Statistik\n\n| Metrik | Nilai |\n| --- | ---: |\n| Total commit (30 hari) | ${thousandSep(stats.total)} |\n| Hari aktif | ${stats.activeDays} / ${DAYS_BACK} |\n| Commit per hari aktif | ${stats.total ? (stats.total / stats.activeDays).toFixed(1) : 0} |\n| Hari tersibuk | ${stats.busiestDay ? `${shortDate(stats.busiestDay[0])} (${thousandSep(stats.busiestDay[1])} commit)` : '-'} |\n| Hari tersibuk (pekan) | ${stats.busiestWeekday} |\n| Jam puncak | ${stats.peakHour}:00 WIB |\n| Streak aktif | ${stats.currentStreak} hari |\n| Repo tersibuk | ${stats.sortedRepos.slice(0, 3).map(([n, c]) => `${n} (${c})`).join(', ') || '-'} |\n| Pull request dibuka | ${prs} |\n| Issue dibuka | ${issues} |\n`;
  await writeFile('stats/monthly-summary.md', md);
  await writeBadge('monthly-commits', 'commits (30d)', compact(stats.total), '2563eb');
  await writeBadge('monthly-active-days', 'active days (30d)', `${stats.activeDays}`, '16a34a');
  await writeBadge('monthly-top-repo', 'top repo (30d)', stats.sortedRepos[0] ? stats.sortedRepos[0][0] : 'none', 'f59e0b');
  log('monthly summary complete');
}

main().catch((error) => {
  console.error(`[monthly] FATAL: ${error.stack || error.message}`);
  process.exit(1);
});
