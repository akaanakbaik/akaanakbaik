import { createClient, runPool, preciseAge, compact, hourInTz, weekdayInTz } from './lib/engine.mjs';

const username = 'akaanakbaik';
const token = process.env.GITHUB_TOKEN || '';

async function gql(token, query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'akaanakbaik-profile-engine'
    },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map((e) => e.message).join('; '));
  return json.data;
}

const CAL_QUERY = `query($login: String!) {
  user(login: $login) {
    createdAt
    followers { totalCount }
    following { totalCount }
    gists { totalCount }
    pullRequests { totalCount }
    issues { totalCount }
    contributionsCollection {
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}`;

function iso(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function shift(date, days) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function independentStreak(daysMap) {
  let current = 0;
  let cursor = new Date();
  if ((daysMap.get(iso(cursor)) || 0) === 0) cursor = shift(cursor, -1);
  while ((daysMap.get(iso(cursor)) || 0) > 0 && current < 3650) {
    current += 1;
    cursor = shift(cursor, -1);
  }
  const sorted = [...daysMap.keys()].sort();
  let longest = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    if ((daysMap.get(sorted[i]) || 0) > 0) {
      if (i > 0 && new Date(sorted[i] + 'T00:00:00Z').getTime() - new Date(sorted[i - 1] + 'T00:00:00Z').getTime() === 86400000) run += 1;
      else run = 1;
      longest = Math.max(longest, run);
    } else run = 0;
  }
  return { current, longest };
}

async function main() {
  const client = createClient({ token, owner: username, log: () => {} });
  console.log('===== DEEP FORENSIC AUDIT =====');
  const user = await client.request(`/users/${username}`);
  console.log(`\n[ACCOUNT] followers=${user.followers} following=${user.following} gists=${user.public_gists} created=${user.created_at} public_repos_field=${user.public_repos}`);
  const age = preciseAge(user.created_at);
  console.log(`[ACCOUNT] preciseAge=${age.label} (${age.years}y ${age.months}m ${age.days}d, total ${age.totalDays}d)`);

  const allRepos = (await client.paginate(`/users/${username}/repos?type=owner&sort=updated&direction=desc`)).filter((r) => !r.private);
  console.log(`\n[REPOS] count=${allRepos.length}`);
  const stars = allRepos.reduce((a, r) => a + (r.stargazers_count || 0), 0);
  const forks = allRepos.reduce((a, r) => a + (r.forks_count || 0), 0);
  const sizeKb = allRepos.reduce((a, r) => a + (r.size || 0), 0);
  console.log(`[REPOS] totalStars=${stars} totalForks=${forks} totalSizeKb=${sizeKb} (${(sizeKb / 1024).toFixed(1)} MB)`);
  const langCount = new Map();
  for (const r of allRepos) if (r.language) langCount.set(r.language, (langCount.get(r.language) || 0) + 1);
  const topLang = [...langCount.entries()].sort((a, b) => b[1] - a[1])[0];
  console.log(`[REPOS] topLanguage=${topLang ? topLang[0] : 'none'} (${topLang ? topLang[1] : 0} repos)`);

  console.log('\n[SUBSCRIBERS] verifying real subscriber sum per repo...');
  const subTasks = allRepos.map((repo) => async () => {
    try {
      const full = await client.request(`/repos/${username}/${encodeURIComponent(repo.name)}`);
      return full && full.subscribers_count ? full.subscribers_count : 0;
    } catch {
      return 0;
    }
  });
  const subs = await runPool(subTasks, 14);
  const totalSubs = subs.reduce((a, b) => a + b, 0);
  console.log(`[SUBSCRIBERS] total=${totalSubs}`);

  console.log('\n[CALENDAR] fetching GraphQL contribution calendar...');
  const data = await gql(token, CAL_QUERY, { login: username });
  const u = data.user;
  const coll = u.contributionsCollection;
  const cal = coll.contributionCalendar;
  const daysMap = new Map();
  for (const w of cal.weeks) for (const d of w.contributionDays) daysMap.set(d.date, d.contributionCount || 0);
  const streak = independentStreak(daysMap);
  const activeDays = [...daysMap.values()].filter((c) => c > 0).length;
  const lastActiveDate = [...daysMap.keys()].sort().reverse().find((d) => (daysMap.get(d) || 0) > 0) || null;
  console.log(`[CALENDAR] totalContributions=${cal.totalContributions} totalCommitContributions=${coll.totalCommitContributions} totalPRContributions=${coll.totalPullRequestContributions} totalIssueContributions=${coll.totalIssueContributions} totalReviews=${coll.totalPullRequestReviewContributions}`);
  console.log(`[CALENDAR] days=${daysMap.size} activeDays=${activeDays} streak.current=${streak.current} streak.longest=${streak.longest} lastActiveDate=${lastActiveDate}`);
  console.log(`[CALENDAR] gql lifetime pullRequests=${u.pullRequests.totalCount} issues=${u.issues.totalCount} createdAt=${u.createdAt} followersGql=${u.followers.totalCount} gistsGql=${u.gists.totalCount}`);

  console.log('\n[LAST-ACTIVE] finding the TRUE latest commit datetime (REST, all repos, first page)...');
  const latest = [];
  const hourTasks = allRepos.map((repo) => async () => {
    try {
      const commits = await client.request(`/repos/${username}/${encodeURIComponent(repo.name)}/commits?per_page=1`);
      if (Array.isArray(commits) && commits.length) {
        const c = commits[0];
        if (c.author && c.author.login === username && c.commit && c.commit.author && c.commit.author.date) {
          latest.push(c.commit.author.date);
        }
      }
    } catch {}
  });
  await runPool(hourTasks, 14);
  const newest = latest.sort((a, b) => new Date(b) - new Date(a))[0] || null;
  console.log(`[LAST-ACTIVE] newest owned commit datetime = ${newest}`);
  if (newest) {
    const mins = Math.floor((Date.now() - new Date(newest).getTime()) / 60000);
    console.log(`[LAST-ACTIVE] true: ${mins} minutes ago`);
    console.log(`[LAST-ACTIVE] badge currently uses: ${lastActiveDate}T00:00:00Z (date midnight) -> hours since midnight`);
  }

  console.log('\n[DEEP HOUR SAMPLE] paginating up to 4 pages per repo...');
  const hours = [];
  const weekdays = [];
  const deepTasks = allRepos.map((repo) => async () => {
    try {
      for (let page = 1; page <= 4; page++) {
        const commits = await client.request(`/repos/${username}/${encodeURIComponent(repo.name)}/commits?per_page=100&page=${page}`);
        if (!Array.isArray(commits) || commits.length === 0) break;
        for (const c of commits) {
          if (!(c.author && c.author.login === username)) continue;
          const date = c.commit && c.commit.author && c.commit.author.date;
          if (!date) continue;
          const h = hourInTz(date);
          const wd = weekdayInTz(date);
          if (h !== null) hours.push(h);
          if (wd !== null) weekdays.push(wd);
        }
        if (commits.length < 100) break;
      }
    } catch {}
  });
  await runPool(deepTasks, 12);
  const hc = Array.from({ length: 24 }, (_, i) => hours.filter((h) => h === i).length);
  const peakH = hc.indexOf(Math.max(...hc));
  const wo = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const wc = wo.map((w) => weekdays.filter((x) => x === w).length);
  const peakW = wo[wc.indexOf(Math.max(...wc))];
  console.log(`[DEEP HOUR] sampled=${hours.length} peakHour=${peakH}:00 busiestWeekday=${peakW}`);
  console.log(`[DEEP HOUR] hour histogram: ${hc.join(',')}`);

  console.log('\n===== AUDIT COMPLETE =====');
}

main().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
