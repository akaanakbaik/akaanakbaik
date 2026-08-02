import { mkdir, writeFile } from 'node:fs/promises';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

export function createClient({ token = '', owner = 'akaanakbaik', log = () => {} } = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'akaanakbaik-profile-engine'
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  async function request(path, { retries = 8, method = 'GET', body } = {}) {
    let last = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const res = await fetch(`https://api.github.com${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      });
      if (res.status === 204) return null;
      if (res.status === 403) {
        const remaining = res.headers.get('x-ratelimit-remaining');
        const reset = Number(res.headers.get('x-ratelimit-reset') || 0) * 1000;
        if (remaining === '0' && reset > Date.now()) {
          const wait = reset - Date.now() + 2000;
          log(`rate limited, waiting ${Math.round(wait / 1000)}s`);
          await sleep(wait);
          continue;
        }
      }
      if (res.status === 429) {
        const wait = (Number(res.headers.get('retry-after')) || 15) * 1000;
        log(`secondary rate limit, waiting ${Math.round(wait / 1000)}s`);
        await sleep(wait);
        continue;
      }
      if (res.status >= 500) {
        last = res;
        await sleep(1500 * 2 ** attempt + Math.random() * 600);
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`${res.status} ${path}: ${text.slice(0, 220)}`);
      }
      const type = res.headers.get('content-type') || '';
      if (type.includes('json')) return res.json();
      return res.text();
    }
    throw new Error(`request failed after retries: ${path} last=${last ? last.status : 'unknown'}`);
  }
  async function paginate(path, { perPage = 100, pages = 12 } = {}) {
    const out = [];
    for (let page = 1; page <= pages; page++) {
      const sep = path.includes('?') ? '&' : '?';
      const batch = await request(`${path}${sep}per_page=${perPage}&page=${page}`);
      if (!Array.isArray(batch) || batch.length === 0) break;
      out.push(...batch);
      if (batch.length < perPage) break;
    }
    return out;
  }
  return { request, paginate, owner };
}

export async function runPool(items, limit) {
  const results = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await items[i]();
    }
  });
  await Promise.all(workers);
  return results;
}

export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function thousandSep(value) {
  return Number(value || 0).toLocaleString('en-US');
}

export function compact(value) {
  const n = Number(value || 0);
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export function humanBytes(bytes) {
  const n = Number(bytes || 0);
  if (n >= 1099511627776) return `${(n / 1099511627776).toFixed(2)} TB`;
  if (n >= 1073741824) return `${(n / 1073741824).toFixed(2)} GB`;
  if (n >= 1048576) return `${(n / 1048576).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

export function humanSize(kb) {
  const n = Number(kb || 0);
  if (n >= 1048576) return `${(n / 1048576).toFixed(2)} GB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} MB`;
  return `${n} KB`;
}

export function dateStamp() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date());
}

export function ageFrom(createdAt) {
  const a = new Date(createdAt);
  const n = new Date();
  let years = n.getUTCFullYear() - a.getUTCFullYear();
  let months = n.getUTCMonth() - a.getUTCMonth();
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years <= 0) return `${months} months`;
  return months ? `${years}y ${months}m` : `${years} years`;
}

export function shannonEntropy(weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  let entropy = 0;
  for (const w of weights) {
    if (w <= 0) continue;
    const p = w / total;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

export function herfindahl(weights) {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  return weights.reduce((acc, w) => acc + (w / total) ** 2, 0);
}

export function giniCoefficient(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  const sum = sorted.reduce((a, b) => a + b, 0);
  if (!sum) return 0;
  let cumulative = 0;
  let weighted = 0;
  for (let i = 0; i < n; i++) {
    cumulative += sorted[i];
    weighted += (i + 1) * sorted[i];
  }
  return (2 * weighted) / (n * sum) - (n + 1) / n;
}

export function concentrationRatio(weights, k) {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const sorted = [...weights].sort((a, b) => b - a);
  return sorted.slice(0, k).reduce((a, b) => a + b, 0) / total;
}

export function paretoAnalysis(weights, threshold = 0.8) {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const sorted = [...weights].sort((a, b) => b - a);
  let cumulative = 0;
  let count = 0;
  for (const w of sorted) {
    cumulative += w;
    count += 1;
    if (cumulative / total >= threshold) break;
  }
  return { count, totalCount: sorted.length, share: cumulative / total };
}

export function logNormalize(values) {
  const logs = values.map((v) => Math.log10(v + 1));
  const max = Math.max(...logs);
  if (!max) return values.map(() => 0);
  return logs.map((v) => v / max);
}

export function geometricMean(values) {
  const positive = values.filter((v) => v > 0);
  if (!positive.length) return 0;
  return Math.exp(positive.reduce((a, v) => a + Math.log(v), 0) / positive.length);
}

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function coefficientOfVariation(values) {
  const n = values.length;
  if (!n) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (!mean) return 0;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / n;
  return Math.sqrt(variance) / mean;
}

export function hourInTz(iso, tz = 'Asia/Jakarta') {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return Number(date.toLocaleString('en-US', { timeZone: tz, hour: '2-digit', hour12: false }));
}

export function weekdayInTz(iso, tz = 'Asia/Jakarta') {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-US', { timeZone: tz, weekday: 'short' });
}

export function circularMeanHours(values) {
  if (!values.length) return 0;
  let sx = 0;
  let sy = 0;
  for (const v of values) {
    sx += Math.cos((v / 24) * 2 * Math.PI);
    sy += Math.sin((v / 24) * 2 * Math.PI);
  }
  const mean = (Math.atan2(sy / values.length, sx / values.length) * 24) / (2 * Math.PI);
  return ((mean % 24) + 24) % 24;
}

export function circularStdHours(values) {
  if (!values.length) return 0;
  let sx = 0;
  let sy = 0;
  for (const v of values) {
    sx += Math.cos((v / 24) * 2 * Math.PI);
    sy += Math.sin((v / 24) * 2 * Math.PI);
  }
  const r = Math.sqrt(sx * sx + sy * sy) / values.length;
  const clamped = Math.max(r, 1e-9);
  return Math.sqrt(-2 * Math.log(clamped)) * (24 / (2 * Math.PI));
}

export function preciseAge(createdAt) {
  const a = new Date(createdAt);
  const now = new Date();
  if (Number.isNaN(a.getTime())) return { years: 0, months: 0, days: 0, label: '0 days' };
  let years = now.getUTCFullYear() - a.getUTCFullYear();
  let months = now.getUTCMonth() - a.getUTCMonth();
  let days = now.getUTCDate() - a.getUTCDate();
  if (days < 0) {
    months -= 1;
    const prevMonthDays = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).getUTCDate();
    days += prevMonthDays;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  const totalDays = Math.max(0, Math.floor((now.getTime() - a.getTime()) / 86400000));
  const parts = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? 'year' : 'years'}`);
  if (months > 0) parts.push(`${months} ${months === 1 ? 'month' : 'months'}`);
  if (parts.length === 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  return { years, months, days, totalDays, label: parts.join(' ') };
}

export function classifyRhythm(hourCounts) {
  const buckets = [
    { name: 'Night Owl', emoji: '🦉', range: [22, 23, 0, 1, 2, 3, 4] },
    { name: 'Early Bird', emoji: '🐦', range: [5, 6, 7, 8, 9] },
    { name: 'Day Coder', emoji: '☀️', range: [10, 11, 12, 13, 14, 15, 16] },
    { name: 'Evening', emoji: '🌆', range: [17, 18, 19, 20, 21] }
  ];
  const total = hourCounts.reduce((a, b) => a + b, 0);
  if (!total) {
    return { label: 'Unknown', emoji: '🌙', share: 0, buckets: [], peakHour: 0 };
  }
  const withCounts = buckets.map((b) => ({
    ...b,
    count: b.range.reduce((a, h) => a + (hourCounts[h] || 0), 0)
  }));
  const sorted = [...withCounts].sort((a, b) => b.count - a.count);
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
  return {
    label: sorted[0].name,
    emoji: sorted[0].emoji,
    share: sorted[0].count / total,
    buckets: withCounts.map((b) => ({ name: b.name, emoji: b.emoji, count: b.count, pct: (b.count / total) * 100 })),
    peakHour
  };
}

export function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo ago`;
  return `${Math.floor(months / 12)} yr ago`;
}

export function jakartaNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const wib = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  const dateText = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(date);
  const dayName = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', weekday: 'long' }).format(date);
  const shortDay = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', weekday: 'short' }).format(date);
  return {
    hour: Number(wib.hour),
    minute: Number(wib.minute),
    second: Number(wib.second),
    timeText: `${wib.hour}:${wib.minute}:${wib.second}`,
    dateText,
    dayName,
    shortDay
  };
}

export function monthDay(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

export const PALETTE = [
  '#667eea', '#764ba2', '#2563eb', '#16a34a', '#f59e0b', '#06b6d4', '#db2777',
  '#ef4444', '#84cc16', '#eab308', '#f97316', '#8b5cf6', '#14b8a6', '#ec4899',
  '#3b82f6', '#a855f7', '#22c55e', '#e11d48', '#0ea5e9', '#f43f5e'
];

export const LANG_COLORS = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572A5',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Shell: '#89e051',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  PHP: '#4F5D95',
  Ruby: '#701516',
  Go: '#00ADD8',
  Rust: '#dea584',
  Dart: '#00B4AB',
  Vue: '#41b883',
  'Jupyter Notebook': '#DA5B0B',
  CMake: '#DA3434',
  Jinja: '#a52a22',
  Dockerfile: '#384d54',
  PowerShell: '#012456',
  Batchfile: '#C1F12E',
  'C#': '#178600',
  Swift: '#F05138',
  Assembly: '#6E4C13',
  Makefile: '#427819',
  Kotlin: '#A97BFF',
  V: '#5d87bd',
  Elixir: '#6e4a7e',
  Scala: '#c22d40',
  Zig: '#ec915c',
  Ada: '#02f88c',
  Haskell: '#5e5086',
  Lua: '#000080',
  Erlang: '#B83998',
  Perl: '#0298c3',
  Pawn: '#dbb284',
  LOLCODE: '#cc9900',
  Julia: '#a270ba',
  MATLAB: '#e16737',
  'F#': '#b845fc',
  R: '#198CE7',
  'Objective-C': '#438eff',
  Nim: '#ffc200',
  Crystal: '#000100',
  Groovy: '#4298b8',
  Racket: '#3c5caa',
  OCaml: '#ef7a08',
  Solidity: '#AA6746',
  CoffeeScript: '#244776',
  Elm: '#60B5CC',
  Clojure: '#db5855',
  Fortran: '#4d41b1',
  TeX: '#3D6117',
  Markdown: '#083fa1',
  JSON: '#292929',
  YAML: '#cb171e',
  TOML: '#9c4221',
  XML: '#0060ac',
  INI: '#d1dbe0',
  'Visual Basic': '#945db7',
  Raku: '#0000fb',
  QML: '#44a51c',
  GDScript: '#355570',
  'SystemVerilog': '#DAE1C2',
  Verilog: '#b2b7f8',
  VHDL: '#adb2cb',
  Unknown: '#64748b',
  Other: '#8b93a7'
};

export function colorFor(language, index = 0) {
  return LANG_COLORS[language] || PALETTE[index % PALETTE.length];
}

export async function writeBadge(name, label, message, color) {
  await mkdir('badges', { recursive: true });
  await writeFile(
    `badges/${name}.json`,
    JSON.stringify({ schemaVersion: 1, label, message: String(message), color }, null, 2) + '\n'
  );
}

export function baseCard(width, height, title, subtitle, inner) {
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="${width}" y2="${height}">
<stop stop-color="#0f172a"/><stop offset="0.55" stop-color="#111827"/><stop offset="1" stop-color="#312e81"/>
</linearGradient>
<linearGradient id="bar" x1="0" y1="0" x2="${width}" y2="0">
<stop stop-color="#667eea"/><stop offset="1" stop-color="#764ba2"/>
</linearGradient>
<linearGradient id="titleLine" x1="0" y1="0" x2="${width}" y2="0">
<stop stop-color="#667eea" stop-opacity="0"/><stop offset="0.5" stop-color="#a78bfa"/><stop offset="1" stop-color="#667eea" stop-opacity="0"/>
</linearGradient>
</defs>
<rect width="${width}" height="${height}" rx="26" fill="url(#bg)"/>
<circle cx="${width - 80}" cy="40" r="130" fill="#667eea" opacity="0.12"/>
<circle cx="90" cy="${height - 20}" r="150" fill="#764ba2" opacity="0.12"/>
<text x="30" y="44" fill="#ffffff" font-size="25" font-weight="900" font-family="Inter,'Segoe UI',system-ui,sans-serif">${esc(title)}</text>
<text x="30" y="66" fill="#94a3b8" font-size="12.5" font-family="Inter,'Segoe UI',system-ui,sans-serif">${esc(subtitle)}</text>
<rect x="30" y="80" width="${width - 60}" height="3.5" rx="1.75" fill="url(#titleLine)"/>
${inner}
</svg>
`;
}
