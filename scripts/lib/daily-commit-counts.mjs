// Per-day commit counts for the last N days (Asia/Jakarta day boundary).
// Reuses the same client/pool pattern as fetchCommitTimestamps so the numbers
// come from the identical commit stream the other charts are built on.
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

  const isBotCommit = (commit) => {
    const msg = (commit.commit && commit.commit.message) || '';
    if (/\[skip github action\]/i.test(msg)) return true;
    if (/^update .*\.svg - \[/i.test(msg) && /bot/i.test(msg)) return true;
    if (/chore\((metrics|clock|summary)\)/i.test(msg) && /auto-update|refresh|publish/i.test(msg)) return true;
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
          if ((commit.author && commit.author.login) !== username) continue;
          if (isBotCommit(commit)) continue;
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
  // runPool is internal to activity.mjs; replicate a small pool here
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
