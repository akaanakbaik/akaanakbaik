import { mkdir, writeFile } from 'node:fs/promises';

const username = process.env.PROFILE_USERNAME || 'akaanakbaik';
const token = process.env.GITHUB_TOKEN || '';
const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'akaanakbaik-profile-metrics'
};
if (token) headers.Authorization = `Bearer ${token}`;

const colors = ['#667eea', '#764ba2', '#2563eb', '#16a34a', '#f59e0b', '#06b6d4', '#db2777', '#ef4444'];
const languageLogos = {
  JavaScript: 'javascript', TypeScript: 'typescript', Python: 'python', HTML: 'html5', CSS: 'css3', Shell: 'gnubash', Java: 'openjdk',
  'C++': 'cplusplus', C: 'c', PHP: 'php', Ruby: 'ruby', Go: 'go', Rust: 'rust', Dart: 'dart', Vue: 'vuedotjs'
};
const frontendDeps = new Map(Object.entries({
  react: 'React', vite: 'Vite', next: 'Next.js', vue: 'Vue', nuxt: 'Nuxt', svelte: 'Svelte', tailwindcss: 'Tailwind', bootstrap: 'Bootstrap',
  'framer-motion': 'Framer Motion', 'lucide-react': 'Lucide', '@vitejs/plugin-react': 'Vite React', '@react-three/fiber': 'R3F', three: 'Three.js'
}));
const backendDeps = new Map(Object.entries({
  express: 'Express', fastify: 'Fastify', hono: 'Hono', grammy: 'grammY', telegraf: 'Telegraf', '@whiskeysockets/baileys': 'Baileys',
  '@kelvdra/baileys': 'Baileys', axios: 'Axios', undici: 'Undici', mongoose: 'Mongoose', mongodb: 'MongoDB', mysql2: 'MySQL', pg: 'PostgreSQL',
  postgres: 'Postgres', redis: 'Redis', ioredis: 'Redis', '@supabase/supabase-js': 'Supabase', '@neondatabase/serverless': 'Neon DB', prisma: 'Prisma',
  'drizzle-orm': 'Drizzle', pm2: 'PM2', 'node-cron': 'Cron', puppeteer: 'Puppeteer', playwright: 'Playwright'
}));

function esc(v) {
  return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
function compact(n) {
  n = Number(n || 0);
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}
function size(kb) {
  kb = Number(kb || 0);
  if (kb >= 1048576) return `${(kb / 1048576).toFixed(2)} GB`;
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb} KB`;
}
function dateNow() {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date());
}
function age(createdAt) {
  const a = new Date(createdAt), n = new Date();
  let y = n.getUTCFullYear() - a.getUTCFullYear(), m = n.getUTCMonth() - a.getUTCMonth();
  if (m < 0) { y--; m += 12; }
  return y <= 0 ? `${m} months` : (m ? `${y}y ${m}m` : `${y} years`);
}
async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`${res.status} ${path}: ${(await res.text()).slice(0, 160)}`);
  return res.json();
}
async function maybe(path) {
  try { return await gh(path); } catch { return null; }
}
async function repos() {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await gh(`/users/${username}/repos?type=owner&sort=updated&direction=desc&per_page=100&page=${page}`);
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out.filter(r => !r.private);
}
async function packageJson(repo) {
  const f = await maybe(`/repos/${username}/${encodeURIComponent(repo.name)}/contents/package.json?ref=${encodeURIComponent(repo.default_branch || 'main')}`);
  if (!f?.content) return null;
  try { return JSON.parse(Buffer.from(f.content, 'base64').toString('utf8')); } catch { return null; }
}
async function languageStack(allRepos) {
  const bytes = new Map(), counts = new Map();
  for (const repo of allRepos) {
    const langs = await maybe(`/repos/${username}/${encodeURIComponent(repo.name)}/languages`);
    if (!langs) continue;
    for (const [lang, val] of Object.entries(langs)) {
      bytes.set(lang, (bytes.get(lang) || 0) + Number(val || 0));
      counts.set(lang, (counts.get(lang) || 0) + 1);
    }
  }
  return [...bytes.entries()].sort((a, b) => b[1] - a[1]).map(([name, bytes]) => ({ name, bytes, repos: counts.get(name) || 0, logo: languageLogos[name] || '' }));
}
async function dependencyStacks(allRepos) {
  const front = new Map(), back = new Map();
  for (const repo of allRepos) {
    const pkg = await packageJson(repo);
    if (!pkg) continue;
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    for (const dep of Object.keys(deps)) {
      if (frontendDeps.has(dep)) front.set(frontendDeps.get(dep), (front.get(frontendDeps.get(dep)) || 0) + 1);
      if (backendDeps.has(dep)) back.set(backendDeps.get(dep), (back.get(backendDeps.get(dep)) || 0) + 1);
    }
  }
  const sort = ([a, x], [b, y]) => y - x || a.localeCompare(b);
  return {
    frontend: [...front.entries()].sort(sort).map(([name, count]) => ({ name, count })),
    backend: [...back.entries()].sort(sort).map(([name, count]) => ({ name, count }))
  };
}
async function badge(name, label, message, color) {
  await writeFile(`badges/${name}.json`, JSON.stringify({ schemaVersion: 1, label, message: String(message), color }, null, 2) + '\n');
}
function baseSvg(w, h, title, sub, inner) {
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="bg" x1="0" y1="0" x2="${w}" y2="${h}"><stop stop-color="#0f172a"/><stop offset=".55" stop-color="#111827"/><stop offset="1" stop-color="#312e81"/></linearGradient><linearGradient id="bar" x1="0" y1="0" x2="${w}" y2="0"><stop stop-color="#667eea"/><stop offset="1" stop-color="#764ba2"/></linearGradient></defs><rect width="${w}" height="${h}" rx="26" fill="url(#bg)"/><circle cx="${w - 80}" cy="40" r="125" fill="#667eea" opacity=".12"/><circle cx="95" cy="${h - 20}" r="140" fill="#764ba2" opacity=".12"/><text x="28" y="44" fill="#fff" font-size="27" font-weight="900" font-family="Segoe UI,Arial">${esc(title)}</text><text x="28" y="68" fill="#94a3b8" font-size="13" font-family="Segoe UI,Arial">${esc(sub)}</text><rect x="28" y="84" width="${w - 56}" height="4" rx="2" fill="url(#bar)"/>${inner}</svg>\n`;
}
function statsSvg(data) {
  const cards = [['Repos', data.publicRepos], ['Original', data.originalRepos], ['Stars', data.totalStars], ['Forks', data.totalForks], ['Followers', data.followers], ['Gists', data.publicGists], ['Top Lang', data.topLanguage], ['Age', data.accountAge]];
  const inner = cards.map(([label, value], i) => {
    const x = 28 + (i % 4) * 211, y = 112 + Math.floor(i / 4) * 96, c = colors[i % colors.length];
    return `<g transform="translate(${x} ${y})"><rect width="188" height="72" rx="17" fill="#111827" stroke="${c}" stroke-width="1.3"/><text x="16" y="27" fill="#94a3b8" font-size="13" font-family="Segoe UI,Arial">${esc(label)}</text><text x="16" y="54" fill="#fff" font-size="21" font-weight="800" font-family="Segoe UI,Arial">${esc(value)}</text></g>`;
  }).join('');
  return baseSvg(900, 305, 'GitHub Stats', `Auto-generated · ${data.generatedAt}`, inner);
}
function topLangsSvg(data) {
  const total = data.languageStack.reduce((a, x) => a + x.bytes, 0) || 1;
  let y = 112;
  const inner = data.languageStack.slice(0, 8).map((x, i) => {
    const pct = Math.max(1, Math.round((x.bytes / total) * 100));
    const width = Math.max(18, Math.round((pct / 100) * 650));
    const out = `<g transform="translate(32 ${y})"><text x="0" y="17" fill="#e5e7eb" font-size="15" font-weight="700" font-family="Segoe UI,Arial">${esc(x.name)}</text><rect x="170" y="2" width="650" height="18" rx="9" fill="#1f2937"/><rect x="170" y="2" width="${width}" height="18" rx="9" fill="${colors[i % colors.length]}"/><text x="835" y="17" fill="#cbd5e1" font-size="13" text-anchor="end" font-family="Segoe UI,Arial">${pct}% · ${x.repos} repos</text></g>`;
    y += 31;
    return out;
  }).join('');
  return baseSvg(900, 390, 'Top Languages', 'Scanned from every public repository via GitHub /languages API', inner);
}
function topReposSvg(repos) {
  const inner = repos.slice(0, 3).map((repo, i) => {
    const y = 112 + i * 72, c = colors[i];
    return `<a href="${esc(repo.url)}"><g transform="translate(30 ${y})"><rect width="840" height="56" rx="18" fill="#111827" stroke="${c}" stroke-width="1.4"/><text x="22" y="35" fill="${c}" font-size="19" font-weight="900" font-family="Segoe UI,Arial">#${i + 1}</text><text x="78" y="35" fill="#fff" font-size="19" font-weight="800" font-family="Segoe UI,Arial">${esc(repo.name)}</text><text x="540" y="35" fill="#cbd5e1" font-size="14" font-family="Segoe UI,Arial">★ ${repo.stars} · ⑂ ${repo.forks} · ${esc(repo.language)}</text></g></a>`;
  }).join('');
  return baseSvg(900, 350, 'Top 3 Repositories', 'Auto-ranked by stars, forks, and recent activity', inner);
}
function cloudSvg(title, subtitle, items, fallback) {
  const list = (items.length ? items : fallback).slice(0, 14).map((x, i) => ({ text: `${x.name} · ${x.count ?? x.repos ?? ''}`, width: Math.max(96, (`${x.name} · ${x.count ?? x.repos ?? ''}`).length * 8 + 32), color: colors[i % colors.length] }));
  let rows = [[]], rowWidth = 0;
  for (const item of list) {
    if (rowWidth + item.width + 10 > 830 && rows.at(-1).length) { rows.push([]); rowWidth = 0; }
    rows.at(-1).push(item); rowWidth += item.width + 10;
  }
  const h = 120 + rows.length * 44;
  const inner = rows.map((row, ri) => {
    let x = 870;
    return row.map(item => {
      x -= item.width;
      const out = `<g transform="translate(${x} ${112 + ri * 44})"><rect width="${item.width}" height="31" rx="15.5" fill="${item.color}"/><text x="${item.width / 2}" y="20" text-anchor="middle" fill="#fff" font-size="13" font-weight="800" font-family="Segoe UI,Arial">${esc(item.text)}</text></g>`;
      x -= 10;
      return out;
    }).join('');
  }).join('');
  return baseSvg(900, h, title, subtitle, inner);
}
function summaryMd(data) {
  const topRows = data.topRepositories.map((r, i) => `| ${i + 1} | [${r.name}](${r.url}) | ${r.stars} | ${r.forks} | ${r.language} |`).join('\n');
  const langRows = data.languageStack.map(x => `| ${x.name} | ${x.repos} | ${x.bytes} |`).join('\n');
  const frontRows = data.frontendStack.map(x => `| ${x.name} | ${x.count} |`).join('\n') || '| - | 0 |';
  const backRows = data.backendStack.map(x => `| ${x.name} | ${x.count} |`).join('\n') || '| - | 0 |';
  return `# Profile Metrics Summary\n\nGenerated: ${data.generatedAt}\n\n## Account\n\n| Metric | Value |\n| --- | ---: |\n| Public repos | ${data.publicRepos} |\n| Original repos | ${data.originalRepos} |\n| Forked repos | ${data.forkedRepos} |\n| Archived repos | ${data.archivedRepos} |\n| Followers | ${data.followers} |\n| Following | ${data.following} |\n| Public gists | ${data.publicGists} |\n| Total stars | ${data.totalStars} |\n| Total forks | ${data.totalForks} |\n| Total watchers | ${data.totalWatchers} |\n| Total repo size | ${data.totalSize} |\n| Top language | ${data.topLanguage} |\n\n## Top 3 Repositories\n\n| # | Repo | Stars | Forks | Language |\n| --- | --- | ---: | ---: | --- |\n${topRows}\n\n## Language Stack\n\n| Language | Repos | Bytes |\n| --- | ---: | ---: |\n${langRows}\n\n## Frontend Stack\n\n| Stack | Repos |\n| --- | ---: |\n${frontRows}\n\n## Backend Stack\n\n| Stack | Repos |\n| --- | ---: |\n${backRows}\n`;
}

await mkdir('badges', { recursive: true });
await mkdir('stats', { recursive: true });
await mkdir('generated', { recursive: true });
const user = await gh(`/users/${username}`);
const allRepos = await repos();
const original = allRepos.filter(r => !r.fork), forked = allRepos.filter(r => r.fork), archived = allRepos.filter(r => r.archived);
const totalStars = allRepos.reduce((a, r) => a + (r.stargazers_count || 0), 0);
const totalForks = allRepos.reduce((a, r) => a + (r.forks_count || 0), 0);
const totalWatchers = allRepos.reduce((a, r) => a + (r.watchers_count || 0), 0);
const totalSizeKb = allRepos.reduce((a, r) => a + (r.size || 0), 0);
let langStack = await languageStack(allRepos);
if (!langStack.length) {
  const m = new Map();
  for (const r of allRepos) m.set(r.language || 'Unknown', (m.get(r.language || 'Unknown') || 0) + 1);
  langStack = [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, repos]) => ({ name, repos, bytes: 0 }));
}
const deps = await dependencyStacks(allRepos);
const byStars = [...allRepos].sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0) || (b.forks_count || 0) - (a.forks_count || 0) || new Date(b.updated_at) - new Date(a.updated_at));
const byUpdate = [...allRepos].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
const bySize = [...allRepos].sort((a, b) => (b.size || 0) - (a.size || 0));
const data = {
  username, generatedAt: dateNow(), publicRepos: allRepos.length, originalRepos: original.length, forkedRepos: forked.length, archivedRepos: archived.length,
  followers: user.followers || 0, following: user.following || 0, publicGists: user.public_gists || 0, totalStars, totalForks, totalWatchers,
  totalSize: size(totalSizeKb), totalSizeKb, topLanguage: langStack[0]?.name || 'Unknown', accountAge: age(user.created_at),
  topRepo: byStars[0]?.name || 'none', recentRepo: byUpdate[0]?.name || 'none', largestRepo: bySize[0]?.name || 'none',
  languageStack: langStack, frontendStack: deps.frontend, backendStack: deps.backend,
  topRepositories: byStars.slice(0, 3).map(r => ({ name: r.name, url: r.html_url, stars: r.stargazers_count || 0, forks: r.forks_count || 0, language: r.language || 'Unknown' })),
  recentRepositories: byUpdate.slice(0, 8).map(r => ({ name: r.name, url: r.html_url, language: r.language || 'Unknown', updatedAt: r.updated_at }))
};
await badge('public-repos', 'public repos', compact(data.publicRepos), '667eea');
await badge('original-repos', 'original repos', compact(data.originalRepos), '764ba2');
await badge('forked-repos', 'forked repos', compact(data.forkedRepos), '111827');
await badge('followers', 'followers', compact(data.followers), '2563eb');
await badge('following', 'following', compact(data.following), '06b6d4');
await badge('public-gists', 'public gists', compact(data.publicGists), '16a34a');
await badge('total-stars', 'total stars', compact(data.totalStars), 'f59e0b');
await badge('total-forks', 'total forks', compact(data.totalForks), '16a34a');
await badge('repo-size', 'repo size', data.totalSize, '06b6d4');
await badge('top-language', 'top language', data.topLanguage, '2563eb');
await badge('top-repo', 'top repo', data.topRepo, '764ba2');
await badge('recent-repo', 'recent repo', data.recentRepo, '667eea');
await badge('account-age', 'account age', data.accountAge, '16a34a');
await badge('last-updated', 'updated', data.generatedAt, 'ef4444');
await writeFile('stats/profile-summary.json', JSON.stringify(data, null, 2) + '\n');
await writeFile('stats/profile-summary.md', summaryMd(data));
await writeFile('generated/github-stats.svg', statsSvg(data));
await writeFile('generated/top-langs.svg', topLangsSvg(data));
await writeFile('generated/profile-dashboard.svg', statsSvg(data));
await writeFile('generated/top-repos.svg', topReposSvg(data.topRepositories));
await writeFile('generated/stack-languages.svg', cloudSvg('Languages from All Repositories', 'Rightmost badge is the most used language by scanned repository bytes', data.languageStack, [{ name: 'JavaScript', repos: 1 }, { name: 'TypeScript', repos: 1 }, { name: 'Python', repos: 1 }]));
await writeFile('generated/stack-frontend.svg', cloudSvg('Frontend Stack from Repository Scan', 'Detected from package.json dependencies across all public repositories', data.frontendStack, [{ name: 'React', count: 1 }, { name: 'Vite', count: 1 }, { name: 'Tailwind', count: 1 }]));
await writeFile('generated/stack-backend.svg', cloudSvg('Backend Stack from Repository Scan', 'Detected from package.json dependencies across all public repositories', data.backendStack, [{ name: 'Node.js', count: 1 }, { name: 'Express', count: 1 }, { name: 'Supabase', count: 1 }]));
