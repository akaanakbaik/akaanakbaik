import { mkdir, writeFile } from 'node:fs/promises';

const USERNAME = process.env.PROFILE_USERNAME || 'akaanakbaik';
const TOKEN = process.env.GITHUB_TOKEN || '';
const API = 'https://api.github.com';
const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'profile-metrics-generator'
};
if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

const colors = {
  purple: '764ba2', indigo: '667eea', blue: '2563eb', green: '16a34a',
  yellow: 'f59e0b', red: 'ef4444', cyan: '06b6d4', dark: '111827', pink: 'db2777'
};

function escapeXml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function compact(value) {
  const n = Number(value || 0);
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function formatSize(kb) {
  const n = Number(kb || 0);
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} GB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} MB`;
  return `${n} KB`;
}

function formatDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(new Date(date));
}

function accountAge(createdAt) {
  const start = new Date(createdAt);
  const now = new Date();
  let years = now.getUTCFullYear() - start.getUTCFullYear();
  let months = now.getUTCMonth() - start.getUTCMonth();
  if (months < 0) { years -= 1; months += 12; }
  if (years <= 0) return `${months} months`;
  return months ? `${years}y ${months}m` : `${years} years`;
}

async function gh(path) {
  const res = await fetch(`${API}${path}`, { headers });
  if (!res.ok) throw new Error(`${res.status} ${path}: ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

async function fetchRepos() {
  const repos = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await gh(`/users/${USERNAME}/repos?type=owner&sort=updated&direction=desc&per_page=100&page=${page}`);
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos.filter((repo) => !repo.private);
}

async function badge(name, label, message, color) {
  await writeFile(`badges/${name}.json`, JSON.stringify({ schemaVersion: 1, label, message: String(message), color }, null, 2) + '\n');
}

function dashboard(data) {
  const cards = [
    ['Public Repos', data.publicRepos, colors.indigo], ['Original Repos', data.originalRepos, colors.purple],
    ['Total Stars', data.totalStars, colors.yellow], ['Total Forks', data.totalForks, colors.green],
    ['Followers', data.followers, colors.blue], ['Top Language', data.topLanguage, colors.cyan],
    ['Repo Size', data.totalSize, colors.pink], ['Account Age', data.accountAge, colors.green]
  ];
  const cardSvg = cards.map(([label, value, color], i) => {
    const x = 28 + (i % 4) * 211;
    const y = 118 + Math.floor(i / 4) * 103;
    return `<g transform="translate(${x} ${y})"><rect width="188" height="78" rx="17" fill="#111827" stroke="#${color}" stroke-width="1.3"/><text x="17" y="29" fill="#94a3b8" font-size="13" font-family="Segoe UI,Arial">${escapeXml(label)}</text><text x="17" y="57" fill="#fff" font-size="22" font-weight="700" font-family="Segoe UI,Arial">${escapeXml(value)}</text></g>`;
  }).join('');
  return `<svg width="900" height="340" viewBox="0 0 900 340" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="bg" x1="0" y1="0" x2="900" y2="340"><stop stop-color="#0f172a"/><stop offset=".55" stop-color="#111827"/><stop offset="1" stop-color="#312e81"/></linearGradient><linearGradient id="bar" x1="0" y1="0" x2="900" y2="0"><stop stop-color="#667eea"/><stop offset="1" stop-color="#764ba2"/></linearGradient></defs><rect width="900" height="340" rx="28" fill="url(#bg)"/><circle cx="790" cy="45" r="130" fill="#667eea" opacity=".12"/><circle cx="110" cy="320" r="145" fill="#764ba2" opacity=".14"/><text x="28" y="48" fill="#fff" font-size="30" font-weight="800" font-family="Segoe UI,Arial">Aka Anak Baik · GitHub Analytics</text><text x="28" y="75" fill="#cbd5e1" font-size="14" font-family="Segoe UI,Arial">Auto-generated from GitHub API · Asia/Jakarta · ${escapeXml(data.generatedAt)}</text><rect x="28" y="91" width="844" height="4" rx="2" fill="url(#bar)"/>${cardSvg}<text x="28" y="317" fill="#94a3b8" font-size="13" font-family="Segoe UI,Arial">Top repo: ${escapeXml(data.topRepo)} · Recent repo: ${escapeXml(data.recentRepo)} · Largest repo: ${escapeXml(data.largestRepo)}</text></svg>\n`;
}

function summaryMd(data) {
  const topRows = data.topRepositories.map((r, i) => `| ${i + 1} | [${r.name}](${r.url}) | ${r.stars} | ${r.forks} | ${r.language} |`).join('\n');
  const langRows = Object.entries(data.languages).map(([lang, count]) => `| ${lang} | ${count} |`).join('\n');
  return `# Profile Metrics Summary\n\nGenerated: ${data.generatedAt}\n\n## Account\n\n| Metric | Value |\n| --- | ---: |\n| Public repos | ${data.publicRepos} |\n| Original repos | ${data.originalRepos} |\n| Forked repos | ${data.forkedRepos} |\n| Archived repos | ${data.archivedRepos} |\n| Followers | ${data.followers} |\n| Following | ${data.following} |\n| Public gists | ${data.publicGists} |\n| Total stars | ${data.totalStars} |\n| Total forks | ${data.totalForks} |\n| Total watchers | ${data.totalWatchers} |\n| Total repo size | ${data.totalSize} |\n| Top language | ${data.topLanguage} |\n\n## Top Repositories\n\n| # | Repo | Stars | Forks | Language |\n| --- | --- | ---: | ---: | --- |\n${topRows}\n\n## Languages\n\n| Language | Repos |\n| --- | ---: |\n${langRows}\n`;
}

await mkdir('badges', { recursive: true });
await mkdir('stats', { recursive: true });
await mkdir('generated', { recursive: true });

const user = await gh(`/users/${USERNAME}`);
const repos = await fetchRepos();
const original = repos.filter((repo) => !repo.fork);
const forked = repos.filter((repo) => repo.fork);
const archived = repos.filter((repo) => repo.archived);
const totalStars = repos.reduce((sum, repo) => sum + (repo.stargazers_count || 0), 0);
const totalForks = repos.reduce((sum, repo) => sum + (repo.forks_count || 0), 0);
const totalWatchers = repos.reduce((sum, repo) => sum + (repo.watchers_count || 0), 0);
const totalSizeKb = repos.reduce((sum, repo) => sum + (repo.size || 0), 0);
const languageMap = new Map();
for (const repo of repos) languageMap.set(repo.language || 'Unknown', (languageMap.get(repo.language || 'Unknown') || 0) + 1);
const languages = Object.fromEntries([...languageMap.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
const byStars = [...repos].sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0) || (b.forks_count || 0) - (a.forks_count || 0));
const byUpdate = [...repos].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
const bySize = [...repos].sort((a, b) => (b.size || 0) - (a.size || 0));

const data = {
  username: USERNAME,
  generatedAt: formatDate(),
  publicRepos: repos.length,
  originalRepos: original.length,
  forkedRepos: forked.length,
  archivedRepos: archived.length,
  followers: user.followers || 0,
  following: user.following || 0,
  publicGists: user.public_gists || 0,
  totalStars,
  totalForks,
  totalWatchers,
  totalSize: formatSize(totalSizeKb),
  totalSizeKb,
  topLanguage: Object.keys(languages)[0] || 'Unknown',
  accountAge: accountAge(user.created_at),
  topRepo: byStars[0]?.name || 'none',
  recentRepo: byUpdate[0]?.name || 'none',
  largestRepo: bySize[0]?.name || 'none',
  languages,
  topRepositories: byStars.slice(0, 8).map((repo) => ({ name: repo.name, url: repo.html_url, stars: repo.stargazers_count || 0, forks: repo.forks_count || 0, language: repo.language || 'Unknown' })),
  recentRepositories: byUpdate.slice(0, 8).map((repo) => ({ name: repo.name, url: repo.html_url, language: repo.language || 'Unknown', updatedAt: repo.updated_at }))
};

await badge('public-repos', 'public repos', compact(data.publicRepos), colors.indigo);
await badge('original-repos', 'original repos', compact(data.originalRepos), colors.purple);
await badge('forked-repos', 'forked repos', compact(data.forkedRepos), colors.dark);
await badge('followers', 'followers', compact(data.followers), colors.blue);
await badge('following', 'following', compact(data.following), colors.cyan);
await badge('public-gists', 'public gists', compact(data.publicGists), colors.green);
await badge('total-stars', 'total stars', compact(data.totalStars), colors.yellow);
await badge('total-forks', 'total forks', compact(data.totalForks), colors.green);
await badge('total-watchers', 'watchers', compact(data.totalWatchers), colors.pink);
await badge('repo-size', 'repo size', data.totalSize, colors.cyan);
await badge('top-language', 'top language', data.topLanguage, colors.blue);
await badge('top-repo', 'top repo', data.topRepo, colors.purple);
await badge('recent-repo', 'recent repo', data.recentRepo, colors.indigo);
await badge('largest-repo', 'largest repo', data.largestRepo, colors.dark);
await badge('account-age', 'account age', data.accountAge, colors.green);
await badge('last-updated', 'updated', data.generatedAt, colors.red);

await writeFile('stats/profile-summary.json', JSON.stringify(data, null, 2) + '\n');
await writeFile('stats/profile-summary.md', summaryMd(data));
await writeFile('generated/profile-dashboard.svg', dashboard(data));
