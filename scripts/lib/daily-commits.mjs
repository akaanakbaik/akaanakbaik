import { esc, baseCard, thousandSep } from './engine.mjs';

// Skeuomorphic dark "10-day commit dashboard" card.
// Data comes straight from the GitHub contribution calendar (per-day UTC dates,
// counts in the user's local/day boundary as GitHub defines them) plus the
// per-day commit counts computed from owned public repositories.
export function dailyCommitsSvg({ days, perDayCommits, total10, best, average, generatedAt }) {
  const width = 1000;
  const height = 560;
  const last10 = [...days].sort((a, b) => a.date.localeCompare(b.date)).slice(-10);

  const font = () => "font-family=\"Inter,'Segoe UI',system-ui,sans-serif\"";

  // ---- skeuomorphic gauge plate geometry ---------------------------------
  const plotX = 70;
  const plotY = 150;
  const plotW = 860;
  const plotH = 250;
  const maxCount = Math.max(1, ...last10.map((d) => d.count));
  const barW = 52;
  const gap = (plotW - 20 - last10.length * barW) / (last10.length - 1);

  const bars = last10.map((d, i) => {
    const h = Math.max(6, Math.round((d.count / maxCount) * (plotH - 30)));
    const x = plotX + 10 + i * (barW + gap);
    const y = plotY + plotH - h;
    const day = new Date(`${d.date}T00:00:00Z`);
    const dow = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(day);
    const dm = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(day);
    const commits = perDayCommits.get ? perDayCommits.get(d.date) || 0 : (d.commits || 0);
    const isToday = i === last10.length - 1;
    const hi = d.count === maxCount && d.count > 0;
    return `<g>
<defs>
<linearGradient id="barG${i}" x1="0" y1="1" x2="0" y2="0">
<stop stop-color="${hi ? '#f59e0b' : '#312e81'}"/><stop offset="1" stop-color="${hi ? '#fbbf24' : '#8b7cf7'}"/>
</linearGradient>
<linearGradient id="gloss${i}" x1="0" y1="0" x2="0" y2="1">
<stop stop-color="#ffffff" stop-opacity="0.32"/><stop offset="0.4" stop-color="#ffffff" stop-opacity="0.05"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</linearGradient>
</defs>
<rect x="${x - 6}" y="${plotY - 12}" width="${barW + 12}" height="${plotH + 12}" rx="12" fill="#0a0f1d" stroke="#04060d" stroke-width="1.5" opacity="0.85"/>
<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="8" fill="url(#barG${i})"/>
<rect x="${x + 3}" y="${y + 3}" width="${barW - 6}" height="${Math.max(3, h - 6)}" rx="6" fill="url(#gloss${i})"/>
<rect x="${x - 2}" y="${y - 5}" width="${barW + 4}" height="7" rx="3.5" fill="#c4b5fd" opacity="${isToday ? 0.95 : 0.35}"/>
<text x="${x + barW / 2}" y="${y - 14}" text-anchor="middle" fill="${hi ? '#fbbf24' : '#e2e8f0'}" font-size="16" font-weight="900" ${font()}>${d.count}</text>
<text x="${x + barW / 2}" y="${y - 30}" text-anchor="middle" fill="#7c86a2" font-size="9.5" font-weight="700" ${font()}>${commits} commit${commits === 1 ? '' : 's'}</text>
<text x="${x + barW / 2}" y="${plotY + plotH + 22}" text-anchor="middle" fill="#8b93a7" font-size="11" font-weight="800" ${font()}>${dow}</text>
<text x="${x + barW / 2}" y="${plotY + plotH + 38}" text-anchor="middle" fill="#5b6478" font-size="9.5" ${font()}>${dm}</text>
${isToday ? `<rect x="${x - 8}" y="${plotY + plotH + 46}" width="${barW + 16}" height="17" rx="8.5" fill="#667eea" opacity="0.9"/><text x="${x + barW / 2}" y="${plotY + plotH + 58}" text-anchor="middle" fill="#ffffff" font-size="9" font-weight="900" letter-spacing="1.2" ${font()}>TODAY</text>` : ''}
</g>`;
  }).join('');

  const gridLines = [0.25, 0.5, 0.75, 1].map((f) => {
    const y = plotY + plotH - Math.round(f * (plotH - 30));
    return `<line x1="${plotX}" y1="${y}" x2="${plotX + plotW}" y2="${y}" stroke="#ffffff" stroke-opacity="0.06" stroke-width="1"/>
<text x="${plotX - 10}" y="${y + 4}" text-anchor="end" fill="#4b5568" font-size="9.5" ${font()}>${Math.round(maxCount * f)}</text>`;
  }).join('');

  const statCard = (x, y, label, value, color) => `<g transform="translate(${x} ${y})">
<rect width="225" height="64" rx="14" fill="#0d1322" stroke="${color}" stroke-opacity="0.4" stroke-width="1.3"/>
<rect width="225" height="4" rx="2" fill="${color}"/>
<circle cx="14" cy="21" r="3" fill="${color}"/>
<text x="24" y="24" fill="#8b93a7" font-size="10.5" font-weight="800" letter-spacing="1.1" ${font()}>${esc(label)}</text>
<text x="14" y="52" fill="#ffffff" font-size="21" font-weight="900" ${font()}>${esc(value)}</text>
</g>`;

  const inner = `
<defs>
<filter id="plate" x="-20%" y="-20%" width="140%" height="140%">
<feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000000" flood-opacity="0.55"/>
</filter>
<linearGradient id="plateG" x1="0" y1="0" x2="0" y2="1">
<stop stop-color="#0c1120"/><stop offset="1" stop-color="#101830"/>
</linearGradient>
<linearGradient id="needle" x1="0" y1="0" x2="0" y2="1">
<stop stop-color="#f8fafc"/><stop offset="1" stop-color="#94a3b8"/>
</linearGradient>
</defs>

<g filter="url(#plate)">
<rect x="40" y="96" width="920" height="404" rx="22" fill="url(#plateG)" stroke="#1e2a44" stroke-width="1.6"/>
<rect x="40" y="96" width="920" height="10" rx="5" fill="url(#bar)" opacity="0.9"/>
<circle cx="942" cy="112" r="4.5" fill="#22c55e"/>
<circle cx="922" cy="112" r="4.5" fill="#f59e0b"/>
<circle cx="902" cy="112" r="4.5" fill="#ef4444"/>
</g>
<text x="66" y="134" fill="#a78bfa" font-size="13.5" font-weight="900" letter-spacing="2.2" ${font()}>COMMITS PER DAY · LAST 10 DAYS · ASIA/JAKARTA</text>

${gridLines}
<g>${bars}</g>

${statCard(66, 428, 'TOTAL (10 DAYS)', thousandSep(total10), '#667eea')}
${statCard(313, 428, 'BEST DAY', `${best.count} · ${best.label}`, '#f59e0b')}
${statCard(560, 428, 'DAILY AVERAGE', average.toFixed(1), '#22c55e')}
${statCard(807, 428, 'ACTIVE DAYS', `${last10.filter((d) => d.count > 0).length}/10`, '#06b6d4')}

<text x="66" y="486" fill="#5b6478" font-size="10" ${font()}>Counts from the official GitHub contribution calendar (all activity) with per-day commit totals from owned public repositories · snapshot ${esc(generatedAt)} WIB</text>
`;
  return baseCard(width, height, 'Daily Commit Activity — 10-Day Console', 'Real GitHub data · refreshed hourly · daily totals snapshotted at 03:00 WIB', inner);
}

export function last10BadgeJson({ days, total10, average }) {
  const last10 = [...days].sort((a, b) => a.date.localeCompare(b.date)).slice(-10);
  return {
    schemaVersion: 1,
    label: 'commits · 10 days',
    message: `${thousandSep(total10)} (${average.toFixed(1)}/day)`,
    color: total10 > 0 ? '8b5cf6' : '6b7280',
    namedLogo: 'github',
    style: 'for-the-badge'
  };
}
