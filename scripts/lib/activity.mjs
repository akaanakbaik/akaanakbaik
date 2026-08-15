import { runPool, sleep, hourInTz, weekdayInTz, circularMeanHours, circularStdHours } from './engine.mjs';

async function gqlRequest(token, query, variables, { retries = 8, log = () => {} } = {}) {
  let last = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res;
    try {
      res = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'akaanakbaik-profile-engine'
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(30000)
      });
    } catch (error) {
      last = error;
      if (attempt >= retries) break;
      const wait = Math.min(60000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 800);
      log(`gql transport failure, retry ${attempt + 1}/${retries} in ${Math.ceil(wait / 1000)}s`);
      await sleep(wait);
      continue;
    }
    if (res.status === 403 || res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('retry-after') || 0) * 1000;
      const wait = retryAfter || Math.min(60000, 30000 * 2 ** attempt) + Math.floor(Math.random() * 800);
      last = new Error(`HTTP ${res.status}`);
      if (attempt >= retries) break;
      log(`gql transient HTTP ${res.status}, retry ${attempt + 1}/${retries} in ${Math.ceil(wait / 1000)}s`);
      await sleep(wait);
      continue;
    }
    const json = await res.json().catch((error) => {
      last = error;
      return null;
    });
    if (!res.ok) throw new Error(`gql HTTP ${res.status}: ${JSON.stringify(json).slice(0, 220)}`);
    if (!json) {
      if (attempt >= retries) break;
      continue;
    }
    if (json.errors) {
      const rateLimited = json.errors.some((e) => e.type === 'RATE_LIMITED' || /rate limit|secondary rate/i.test(e.message || ''));
      if (rateLimited && attempt < retries) {
        const wait = Math.min(60000, 30000 * 2 ** attempt) + Math.floor(Math.random() * 800);
        log(`gql rate limited, retry ${attempt + 1}/${retries} in ${Math.ceil(wait / 1000)}s`);
        await sleep(wait);
        continue;
      }
      throw new Error(`gql error: ${json.errors.map((e) => e.message).join('; ')}`);
    }
    if (!json.data) throw new Error('gql response did not contain data');
    return json.data;
  }
  throw new Error(`gql failed after ${retries + 1} attempts${last ? `: ${last.message}` : ''}`);
}

const USER_ACTIVITY_QUERY = `query($login: String!) {
  user(login: $login) {
    pullRequests { totalCount }
    issues { totalCount }
    repositoriesContributedTo { totalCount }
    contributionsCollection {
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      totalRepositoryContributions
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
          }
        }
      }
    }
  }
}`;

export function contributionLevel(count) {
  if (count <= 0) return 0;
  if (count <= 3) return 1;
  if (count <= 6) return 2;
  if (count <= 9) return 3;
  return 4;
}

const TOP_REPOS_QUERY = `query($login: String!, $cursor: String) {
  user(login: $login) {
    repositories(first: 100, after: $cursor, ownerAffiliations: OWNER, orderBy: {field: PUSHED_AT, direction: DESC}) {
      pageInfo { endCursor hasNextPage }
      nodes {
        name
        description
        url
        isFork
        stargazerCount
        forkCount
        watchers { totalCount }
        issues { totalCount }
        pullRequests { totalCount }
        discussions { totalCount }
        pushedAt
        createdAt
        primaryLanguage { name }
      }
    }
  }
}`;

function toNumber(value) {
  if (value == null) return 0;
  if (typeof value === 'object') return value.totalCount || 0;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function compositeRepoScore(repo) {
  const stars = toNumber(repo.stargazerCount);
  const forks = toNumber(repo.forkCount);
  const watchers = toNumber(repo.watchersTotal != null ? repo.watchersTotal : repo.watchers);
  const prs = toNumber(repo.pullRequests);
  const issues = toNumber(repo.issues);
  const discussions = toNumber(repo.discussions);
  const commits = toNumber(repo.commits);
  const daysSincePush = toNumber(repo.daysSincePush);
  const log1 = (v) => Math.log10(v + 1);
  const recency = Math.exp(-daysSincePush / 45);
  const raw =
    log1(stars) * 2.4 +
    log1(forks) * 1.7 +
    log1(watchers) * 1.3 +
    log1(prs) * 1.2 +
    log1(issues) * 0.7 +
    log1(discussions) * 0.6 +
    log1(commits) * 2.1 +
    recency * 2.0;
  return {
    score: raw,
    stars,
    forks,
    watchers,
    prs,
    issues,
    discussions,
    commits,
    recency,
    daysSincePush
  };
}

export async function fetchTopReposRanking(client, token, username, allRepos, perRepoCounts = [], log = () => {}) {
  const commitMap = new Map(perRepoCounts.map((p) => [p.repo, p.count]));
  const nodes = [];
  let cursor = null;
  for (let page = 0; page < 4; page++) {
    const variables = { login: username, cursor };
    const data = await gqlRequest(token, TOP_REPOS_QUERY, variables, { log });
    const repos = data && data.user && data.user.repositories;
    if (!repos || !repos.nodes || repos.nodes.length === 0) break;
    nodes.push(...repos.nodes);
    if (!repos.pageInfo || !repos.pageInfo.hasNextPage) break;
    cursor = repos.pageInfo.endCursor;
  }
  const ranked = nodes
    .filter((n) => !n.isFork)
    .map((n) => {
      const pushedMs = n.pushedAt ? new Date(n.pushedAt).getTime() : Date.now();
      const daysSincePush = Number.isFinite(pushedMs) ? Math.max(0, (Date.now() - pushedMs) / 86400000) : 0;
      const base = {
        name: n.name,
        url: n.url,
        language: (n.primaryLanguage && n.primaryLanguage.name) || 'Unknown',
        watchersTotal: n.watchers ? n.watchers.totalCount : 0,
        pullRequests: n.pullRequests ? n.pullRequests.totalCount : 0,
        issues: n.issues ? n.issues.totalCount : 0,
        discussions: n.discussions ? n.discussions.totalCount : 0,
        daysSincePush: Math.round(daysSincePush),
        commits: commitMap.get(n.name) || 0
      };
      const stats = compositeRepoScore({ ...n, ...base });
      return { ...base, ...stats };
    });
  const maxScore = Math.max(...ranked.map((r) => r.score), 1e-9);
  return ranked
    .map((r) => ({ ...r, scorePct: (r.score / maxScore) * 100 }))
    .sort((a, b) => b.score - a.score);
}


export async function fetchUserActivity(token, username, log = () => {}) {
  const data = await gqlRequest(token, USER_ACTIVITY_QUERY, { login: username }, { log });
  const user = data && data.user;
  const collection = user && user.contributionsCollection;
  const calendar = collection && collection.contributionCalendar;
  const days = [];
  for (const week of calendar && calendar.weeks ? calendar.weeks : []) {
    for (const day of week.contributionDays ? week.contributionDays : []) {
      days.push({ date: day.date, count: day.contributionCount || 0 });
    }
  }
  return {
    pullRequests: (user && user.pullRequests && user.pullRequests.totalCount) || 0,
    issues: (user && user.issues && user.issues.totalCount) || 0,
    reposContributed: (user && user.repositoriesContributedTo && user.repositoriesContributedTo.totalCount) || 0,
    totalCommitContributions: (collection && collection.totalCommitContributions) || 0,
    totalIssueContributions: (collection && collection.totalIssueContributions) || 0,
    totalPRContributions: (collection && collection.totalPullRequestContributions) || 0,
    totalPRReviews: (collection && collection.totalPullRequestReviewContributions) || 0,
    totalRepositoryContributions: (collection && collection.totalRepositoryContributions) || 0,
    totalContributions: (calendar && calendar.totalContributions) || 0,
    days,
    level: contributionLevel
  };
}

function isoDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function shiftDate(date, days) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

export function computeStreak(activity) {
  const map = new Map(activity.days.map((d) => [d.date, d.count]));
  const sortedDates = [...map.keys()].sort();
  let currentStreak = 0;
  let cursor = new Date();
  if ((map.get(isoDate(cursor)) || 0) === 0) cursor = shiftDate(cursor, -1);
  while ((map.get(isoDate(cursor)) || 0) > 0 && currentStreak < 3650) {
    currentStreak += 1;
    cursor = shiftDate(cursor, -1);
  }
  let longest = 0;
  let run = 0;
  for (let i = 0; i < sortedDates.length; i++) {
    if ((map.get(sortedDates[i]) || 0) > 0) {
      if (i > 0 && new Date(sortedDates[i] + 'T00:00:00Z').getTime() - new Date(sortedDates[i - 1] + 'T00:00:00Z').getTime() === 86400000) {
        run += 1;
      } else {
        run = 1;
      }
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }
  const lastActiveDate = [...sortedDates].reverse().find((d) => (map.get(d) || 0) > 0) || null;
  const activeDays = activity.days.filter((d) => d.count > 0).length;
  return {
    currentStreak,
    longest,
    lastActiveDate,
    activeDays,
    totalContributions: activity.totalContributions
  };
}

export async function fetchCommitTimestamps(client, username, allRepos, log = () => {}) {
  const hours = [];
  const weekdays = [];
  const perRepoCounts = [];
  let newestDate = null;
  const isBotCommit = (commit) => {
    const msg = (commit.commit && commit.commit.message) || '';
    if (/\[skip github action\]/i.test(msg)) return true;
    if (/^update .*\.svg - \[/i.test(msg) && /bot/i.test(msg)) return true;
    if (/chore\((metrics|clock|summary)\)/i.test(msg) && /auto-update|refresh|publish/i.test(msg)) return true;
    return false;
  };
  const processCommits = (commits, repo) => {
    let owned = 0;
    for (const commit of commits) {
      const authorLogin = commit.author && commit.author.login;
      if (authorLogin !== username) continue;
      if (isBotCommit(commit)) continue;
      const date = commit.commit && commit.commit.author && commit.commit.author.date;
      if (!date) continue;
      owned += 1;
      if (!newestDate || new Date(date).getTime() > new Date(newestDate).getTime()) newestDate = date;
      const hour = hourInTz(date);
      const weekday = weekdayInTz(date);
      if (hour !== null) hours.push(hour);
      if (weekday !== null) weekdays.push(weekday);
    }
    return owned;
  };
  const tasks = allRepos.map((repo) => async () => {
    let owned = 0;
    let page = 1;
    try {
      while (true) {
        const commits = await client.request(`/repos/${username}/${encodeURIComponent(repo.name)}/commits?per_page=100&page=${page}`);
        if (!Array.isArray(commits) || commits.length === 0) break;
        owned += processCommits(commits, repo);
        if (commits.length < 100) break;
        page += 1;
      }
    } catch (error) {
      if (!String(error.message || error).startsWith('409 ')) throw error;
    }
    perRepoCounts.push({ repo: repo.name, count: owned });
  });
  await runPool(tasks, 6);
  const hourCounts = Array.from({ length: 24 }, (_, i) => hours.filter((h) => h === i).length);
  const weekdayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekdayCounts = weekdayOrder.map((wd) => weekdays.filter((w) => w === wd).length);
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
  const peakWeekdayIndex = weekdayCounts.indexOf(Math.max(...weekdayCounts));
  return {
    sampled: hours.length,
    hourCounts,
    weekdayCounts,
    weekdayOrder,
    peakHour,
    peakWeekday: weekdayOrder[peakWeekdayIndex],
    circularMean: circularMeanHours(hours),
    circularStd: circularStdHours(hours),
    activeHours: hourCounts.filter((c) => c > 0).length,
    reposWithCommits: perRepoCounts.filter((p) => p.count > 0).length,
    perRepoCounts: [...perRepoCounts].sort((a, b) => b.count - a.count),
    topCommitRepos: [...perRepoCounts].sort((a, b) => b.count - a.count).slice(0, 5),
    latestDate: newestDate
  };
}
