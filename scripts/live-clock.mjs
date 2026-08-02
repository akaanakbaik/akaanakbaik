import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dateStamp, writeBadge, jakartaNow, createClient, compact } from './lib/engine.mjs';
import { liveClockSvg, motivationQuoteSvg } from './lib/charts.mjs';

async function pickRandomQuote() {
  try {
    const raw = await readFile('scripts/data/quotes.json', 'utf8');
    const quotes = JSON.parse(raw);
    if (!quotes.length) return null;
    const index = Math.floor(Math.random() * quotes.length);
    const chosen = quotes[index];
    await writeFile('generated/motivation-quote.svg', motivationQuoteSvg(chosen, index, quotes.length));
    const short = chosen.quote.length > 64 ? chosen.quote.slice(0, 61) + '…' : chosen.quote;
    await writeBadge('motivation', 'developer quote', short, 'a855f7');
    await writeBadge('motivation-author', 'quoted by', chosen.author, 'f59e0b');
    return { index, total: quotes.length, author: chosen.author };
  } catch (error) {
    console.log(`[live-clock] quote skipped: ${error.message}`);
    return null;
  }
}

async function main() {
  const username = process.env.PROFILE_USERNAME || 'akaanakbaik';
  const token = process.env.GITHUB_TOKEN || '';
  const now = jakartaNow();
  const generatedAt = dateStamp();
  await mkdir('generated', { recursive: true });
  await mkdir('badges', { recursive: true });
  await writeFile(
    'generated/live-clock.svg',
    liveClockSvg({
      hour: now.hour,
      minute: now.minute,
      second: now.second,
      dateText: now.dateText,
      dayName: now.dayName,
      generatedAt
    })
  );
  await writeBadge('live-time', 'Jakarta time (WIB)', now.timeText, 'f59e0b');
  await writeBadge('live-date', 'Jakarta date', now.dateText, '06b6d4');
  const picked = await pickRandomQuote();
  if (picked) console.log(`[live-clock] quote #${picked.index + 1}/${picked.total} by ${picked.author}`);
  console.log(`[live-clock] ${now.timeText} WIB — ${now.dateText} — ${now.dayName}`);

  if (token) {
    try {
      const client = createClient({ token, owner: username, log: () => {} });
      const user = await client.request(`/users/${username}`);
      await writeBadge('followers', 'followers', compact(user.followers || 0), '2563eb');
      await writeBadge('following', 'following', compact(user.following || 0), '06b6d4');
      await writeBadge('public-gists', 'public gists', compact(user.public_gists || 0), '16a34a');
      const allRepos = (await client.paginate(`/users/${username}/repos?type=owner&sort=updated&direction=desc`)).filter((r) => !r.private);
      const totalStars = allRepos.reduce((a, r) => a + (r.stargazers_count || 0), 0);
      const totalForks = allRepos.reduce((a, r) => a + (r.forks_count || 0), 0);
      await writeBadge('total-stars', 'total stars', compact(totalStars), 'f59e0b');
      await writeBadge('total-forks', 'total forks', compact(totalForks), '16a34a');
      await writeBadge('public-repos', 'public repos', compact(allRepos.length), '667eea');
      console.log(`[live-clock] social refresh: ${user.followers} followers, ${totalStars} stars, ${allRepos.length} repos`);
    } catch (error) {
      console.log(`[live-clock] social refresh skipped: ${error.message}`);
    }
  }
}

main().catch((error) => {
  console.error(`[live-clock] FATAL: ${error.stack || error.message}`);
  process.exit(1);
});
