import { readFile } from 'node:fs/promises';
import { createClient, preciseAge, ageFrom, compact } from './lib/engine.mjs';

const username = 'akaanakbaik';
const token = process.env.GITHUB_TOKEN || '';

async function readBadge(name) {
  try {
    const d = JSON.parse(await readFile(`badges/${name}.json`, 'utf8'));
    return d.message;
  } catch {
    return 'MISSING';
  }
}

function line(label, badgeVal, truth, unit = '', ok = null) {
  const match = String(badgeVal) === String(truth) || badgeVal === compact(truth);
  const status = ok === null ? (match ? 'OK' : 'DIFF') : ok ? 'OK' : 'DIFF';
  console.log(`${status === 'OK' ? '✅' : '❌'} ${label.padEnd(22)} badge=${String(badgeVal).padEnd(16)} truth=${String(truth)}${unit} ${status === 'DIFF' ? '  <-- CHECK' : ''}`);
}

async function main() {
  console.log('=== GROUND TRUTH FETCH ===');
  const client = createClient({ token, owner: username, log: () => {} });
  const user = await client.request(`/users/${username}`);
  const allRepos = (await client.paginate(`/users/${username}/repos?type=owner&sort=updated&direction=desc`)).filter((r) => !r.private);
  console.log(`user.created_at=${user.created_at}  (API ground truth)`);
  console.log(`repos fetched=${allRepos.length}`);

  const totalStars = allRepos.reduce((a, r) => a + (r.stargazers_count || 0), 0);
  const totalForks = allRepos.reduce((a, r) => a + (r.forks_count || 0), 0);
  const totalWatchers = allRepos.reduce((a, r) => a + (r.watchers_count || 0), 0);
  const totalSizeKb = allRepos.reduce((a, r) => a + (r.size || 0), 0);
  const sizeMb = (totalSizeKb / 1024).toFixed(1);
  const langs = new Map();
  for (const r of allRepos) {
    if (r.language) langs.set(r.language, (langs.get(r.language) || 0) + 1);
  }
  const topLang = [...langs.entries()].sort((a, b) => b[1] - a[1])[0];
  const age = preciseAge(user.created_at);
  const ageOld = ageFrom(user.created_at);

  console.log('');
  console.log('=== BADGE vs GROUND TRUTH ===');
  line('public-repos', await readBadge('public-repos'), allRepos.length, ' repos');
  line('followers', await readBadge('followers'), user.followers, '');
  line('following', await readBadge('following'), user.following, '');
  line('public-gists', await readBadge('public-gists'), user.public_gists, '');
  line('total-stars', await readBadge('total-stars'), compact(totalStars), '');
  line('total-forks', await readBadge('total-forks'), compact(totalForks), '');
  line('total-watchers', await readBadge('total-watchers'), compact(totalWatchers), '');
  line('repo-size', await readBadge('repo-size'), `${sizeMb} MB`, '');
  line('account-age', await readBadge('account-age'), ageOld, '');
  line('coding-age', await readBadge('coding-age'), age.label, '');
  line('top-language', await readBadge('top-language'), topLang ? topLang[0] : 'none', '');

  console.log('');
  console.log(`preciseAge=${age.label} (${age.years}y ${age.months}m ${age.days}d total=${age.totalDays}d)`);
  console.log(`ageFrom=${ageOld}`);

  console.log('');
  console.log('=== CLOCK ACCURACY (Asia/Jakarta via Intl vs external API) ===');
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(now);
  const wib = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  console.log(`Intl Asia/Jakarta = ${wib.hour}:${wib.minute}:${wib.second}`);
  try {
    const res = await fetch('http://worldtimeapi.org/api/timezone/Asia/Jakarta', { signal: AbortSignal.timeout(15000) });
    const wt = await res.json();
    console.log(`worldtimeapi      = ${wt.datetime}  (external truth)`);
    const extDate = new Date(wt.datetime);
    const extH = String(extDate.getUTCHours()).padStart(2, '0');
    const extM = String(extDate.getUTCMinutes()).padStart(2, '0');
    console.log(`diff min = ${Math.abs(Number(wib.hour) * 60 + Number(wib.minute) - (Number(extH) * 60 + Number(extM)))}`);
  } catch (e) {
    console.log(`worldtimeapi failed: ${e.message}`);
  }
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
