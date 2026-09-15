// Per-day commit counts for the last N days (Asia/Jakarta day boundary).
// Counts every non-bot commit on each owned public repository's default branch.
// We deliberately do NOT filter by author login: the account owner commits from
// multiple email addresses, several of which GitHub cannot attribute to the
// profile (login: null). Filtering on login would silently drop the owner's own
// real commits. Instead we exclude automation identities (github-actions[bot],
// dependabot[bot], etc.) so the numbers reflect genuine human commits.
export async function fetchDailyCommitCounts(client, username, allRepos, daysBack = 10, log = () => {}) {
  const sinceIso = new Date(Date.now() - (daysBack + 1) * 86400000).toISOString();
  const dayMap = new Map(); // 'YYYY-MM-DD' (Jakarta) -> count

  const jakartaDay = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(d).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  };

  const isBot = (commit) => {
    const login = (commit.author && commit.author.login) || '';
    if (/\[bot\]$/i.test(login)) return true; // github-actions[bot], dependabot[bot], ...
    const email = (commit.commit && commit.commit.author && commit.commit.author.email) || '';
    if (/\[bot\]/i.test(email)) return true; // 41898282+github-actions[bot]@users.noreply.github.com
    if (/^(actions|bot|ci|automation)[@.-]/i.test(email)) return true;
    return false;
  };

  const tasks = allRepos.map((repo) => async () => {
    let page = 1;
    try {
      while (true) {
        const commits = await client.request(
          `/repos/${username}/${encodeURIComponent(repo.name)}/commits?per_page=100&page=${page}&since=${sinceIso}`
        );
        if (!Array.isArray(commits) || commits.length === 0) break;
        for (const commit of commits) {
          if (isBot(commit)) continue;
          const date = commit.commit && commit.commit.author && commit.commit.author.date;
          if (!date) continue;
          const day = jakartaDay(date);
          if (day) dayMap.set(day, (dayMap.get(day) || 0) + 1);
        }
        if (commits.length < 100) break;
        page += 1;
      }
    } catch (error) {
      if (!String(error.message || error).startsWith('409 ')) throw error;
    }
  });
  // Small bounded pool (mirrors runPool from activity.mjs without importing it)
  const CONCURRENCY = 6;
  let index = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, async () => {
    while (index < tasks.length) {
      const task = tasks[index++];
      await task();
    }
  });
  await Promise.all(workers);
  log(`daily commit counts collected for ${dayMap.size} day(s) across ${allRepos.length} repos`);
  return dayMap;
}
