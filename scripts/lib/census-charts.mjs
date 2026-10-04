import { esc, baseCard, colorFor, PALETTE, compact, thousandSep, humanBytes, clamp } from './engine.mjs';

function font() {
  return "font-family=\"Inter,'Segoe UI',system-ui,sans-serif\"";
}

function statChip(x, y, label, value, color, width = 160) {
  return `<g transform="translate(${x} ${y})">
<rect width="${width}" height="54" rx="12" fill="#0d1322" stroke="${color}" stroke-opacity="0.35" stroke-width="1.2"/>
<text x="14" y="20" fill="#8b93a7" font-size="10.5" font-weight="700" letter-spacing="1.2" ${font()}>${esc(label)}</text>
<text x="14" y="42" fill="${color}" font-size="17" font-weight="800" ${font()}>${esc(value)}</text>
</g>`;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// ---------------------------------------------------------------------------
// 1. Per-repository Code Census ranking — horizontal bars, real line counts.
// ---------------------------------------------------------------------------
export function censusByRepoSvg({ perRepo = [], totals = {}, generatedAt = '' }) {
  const withCode = perRepo.filter((r) => Number(r.codeLines) > 0);
  const rows = withCode.slice(0, 15);
  const width = 1250;
  const rowH = 34;
  const padT = 124;
  const padB = 128;
  const height = padT + Math.max(rows.length, 1) * rowH + padB;
  const padL = 196;
  const padR = 300;
  const plotW = Math.max(120, width - padL - padR);
  const max = Math.max(...rows.map((r) => r.codeLines), 1);
  const totalCodeLines = Number(totals.codeLines) || rows.reduce((a, r) => a + r.codeLines, 0);
  const totalRepos = perRepo.length || 1;

  const gridlines = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const x = padL + f * plotW;
    return `<line x1="${x.toFixed(2)}" y1="${padT - 8}" x2="${x.toFixed(2)}" y2="${padT + rows.length * rowH}" stroke="#ffffff" stroke-opacity="0.06" stroke-width="1"/>
<text x="${x.toFixed(2)}" y="${padT + rows.length * rowH + 22}" text-anchor="middle" fill="#64748b" font-size="11" ${font()}>${compact(Math.round(f * max))}</text>`;
  }).join('');

  const bars = rows.map((r, i) => {
    const y = padT + i * rowH;
    const barW = Math.max(4, (r.codeLines / max) * plotW);
    const share = ((r.codeLines / (totalCodeLines || 1)) * 100).toFixed(1);
    return `<g>
<rect x="${padL}" y="${y}" width="${plotW}" height="${rowH - 10}" rx="8" fill="#ffffff" fill-opacity="0.035"/>
<rect x="${padL}" y="${y}" width="${barW.toFixed(2)}" height="${rowH - 10}" rx="8" fill="url(#bar)"/>
<text x="${padL - 16}" y="${y + 20}" text-anchor="end" fill="#e2e8f0" font-size="12.5" font-weight="700" ${font()}>${esc(r.repo.length > 24 ? r.repo.slice(0, 23) + '…' : r.repo)}</text>
<text x="${(padL + plotW + 16).toFixed(2)}" y="${y + 20}" fill="#ffffff" font-size="12.5" font-weight="800" ${font()}>${thousandSep(r.codeLines)} lines</text>
<text x="${width - 24}" y="${y + 20}" text-anchor="end" fill="#94a3b8" font-size="11.5" ${font()}>${share}% · ${compact(r.files)} files</text>
</g>`;
  }).join('');

  const chipY = height - 88;
  const chips = [
    statChip(30, chipY, 'RANKED', `${rows.length} of ${withCode.length}`, '#4338ca', 165),
    statChip(205, chipY, 'TOP 15 SHARE', `${((rows.reduce((a, r) => a + r.codeLines, 0) / (totalCodeLines || 1)) * 100).toFixed(1)}%`, '#764ba2', 180),
    statChip(395, chipY, 'MEDIAN REPO', `${compact(median(withCode.map((r) => r.codeLines)))} lines`, '#15803d', 180),
    statChip(585, chipY, 'REPOS SCANNED', String(totalRepos), '#0e7490', 165),
    statChip(760, chipY, 'TOTAL CENSUS', `${compact(totalCodeLines)} lines`, '#b45309', 190)
  ].join('');

  const inner = `${gridlines}${bars}${chips}
<text x="30" y="${height - 14}" fill="#64748b" font-size="11" ${font()}>Bar length is non-blank tracked source lines per repository · generated ${esc(generatedAt)}</text>`;
  return baseCard(width, height, 'Code Census by Repository', 'Top 15 repositories by tracked non-blank source lines, with share of the total census and tracked file count', inner);
}

// ---------------------------------------------------------------------------
// 2. Repository size distribution — log-scale magnitude buckets.
// ---------------------------------------------------------------------------
const CENSUS_BUCKETS = [
  { label: '0', min: 0, max: 0, color: '#334155' },
  { label: '1–999', min: 1, max: 999, color: '#4338ca' },
  { label: '1k–4.9k', min: 1000, max: 4999, color: '#5b21b6' },
  { label: '5k–19.9k', min: 5000, max: 19999, color: '#7c3aed' },
  { label: '20k–99.9k', min: 20000, max: 99999, color: '#a78bfa' },
  { label: '100k+', min: 100000, max: Infinity, color: '#e9d5ff' }
];

export function censusDistributionSvg({ perRepo = [], totals = {}, generatedAt = '' }) {
  const rows = CENSUS_BUCKETS.map((bucket) => {
    const members = perRepo.filter((r) => r.codeLines >= bucket.min && r.codeLines <= bucket.max);
    return {
      ...bucket,
      repos: members.length,
      lines: members.reduce((a, r) => a + r.codeLines, 0)
    };
  });
  const totalLines = Number(totals.codeLines) || rows.reduce((a, r) => a + r.lines, 0);
  const width = 1250;
  const height = 640;
  const padT = 128;
  const padB = 190;
  const padL = 92;
  const padR = 96;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const maxRepos = Math.max(...rows.map((r) => r.repos), 1);
  const step = plotW / rows.length;
  const barW = step * 0.52;

  const gridlines = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const y = padT + plotH - f * plotH;
    return `<line x1="${padL}" y1="${y.toFixed(2)}" x2="${width - padR}" y2="${y.toFixed(2)}" stroke="#ffffff" stroke-opacity="0.07" stroke-width="1"/>
<text x="${padL - 14}" y="${(y + 4).toFixed(2)}" text-anchor="end" fill="#64748b" font-size="11.5" ${font()}>${Math.round(f * maxRepos)}</text>`;
  }).join('');

  const bars = rows.map((row, i) => {
    const barH = Math.max(3, (row.repos / maxRepos) * plotH);
    const x = padL + i * step + (step - barW) / 2;
    const y = padT + plotH - barH;
    const linesShare = (row.lines / (totalLines || 1)) * 100;
    return `<g>
<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${barH.toFixed(2)}" rx="6" fill="${row.color}"/>
<text x="${(x + barW / 2).toFixed(2)}" y="${(y - 10).toFixed(2)}" text-anchor="middle" fill="#ffffff" font-size="13" font-weight="800" ${font()}>${row.repos}</text>
<text x="${(x + barW / 2).toFixed(2)}" y="${(y - 27).toFixed(2)}" text-anchor="middle" fill="#94a3b8" font-size="10.5" font-weight="700" ${font()}>${linesShare.toFixed(1)}% lines</text>
<text x="${(x + barW / 2).toFixed(2)}" y="${padT + plotH + 22}" text-anchor="middle" fill="#cbd5e1" font-size="11.5" font-weight="600" ${font()}>${esc(row.label)}</text>
</g>`;
  }).join('');

  const axis = `<text x="${padL - 14}" y="${padT - 12}" text-anchor="end" fill="#8b93a7" font-size="11" font-weight="700" ${font()}>repos</text>
<text x="${width - padR + 14}" y="${padT - 12}" fill="#c4b5fd" font-size="11" font-weight="700" ${font()}>% of lines</text>`;

  const chipY = height - 92;
  const nonEmpty = perRepo.filter((r) => r.codeLines > 0).length;
  const biggest = withMax(perRepo);
  const chips = [
    statChip(30, chipY, 'REPOS SCANNED', String(perRepo.length), '#4338ca', 165),
    statChip(205, chipY, 'WITH SOURCE', String(nonEmpty), '#15803d', 165),
    statChip(380, chipY, 'LARGEST', `${compact(biggest.codeLines)} lines`, '#764ba2', 175),
    statChip(565, chipY, 'MEDIAN', `${compact(median(perRepo.map((r) => r.codeLines)))} lines`, '#0e7490', 175),
    statChip(750, chipY, 'GINI (REPOS)', gini(perRepo.map((r) => r.codeLines)).toFixed(2), '#b45309', 175),
    statChip(935, chipY, 'TOTAL', `${compact(totalLines)} lines`, '#7e22ce', 215)
  ].join('');

  const inner = `${axis}${gridlines}${bars}${chips}
<text x="30" y="${height - 14}" fill="#64748b" font-size="11" ${font()}>Buckets are magnitude bands of non-blank tracked source lines per repository · generated ${esc(generatedAt)}</text>`;
  return baseCard(width, height, 'Repository Size Distribution', 'How the code census is distributed across repositories — bar height is repository count, label above each bar is that band’s share of all census lines', inner);
}

function withMax(perRepo) {
  return perRepo.reduce((best, r) => (r.codeLines > best.codeLines ? r : best), { repo: '-', codeLines: 0 });
}

function gini(values) {
  const positive = values.filter((v) => v > 0).sort((a, b) => a - b);
  const n = positive.length;
  if (n === 0) return 0;
  const sum = positive.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  let cumulative = 0;
  for (const v of positive) cumulative += v;
  let weighted = 0;
  positive.forEach((v, i) => { weighted += (i + 1) * v; });
  return (2 * weighted) / (n * cumulative) - (n + 1) / n;
}

// ---------------------------------------------------------------------------
// 3. Commit rhythm heatmap — weekday x Jakarta hour, real commit timestamps.
// ---------------------------------------------------------------------------
export function commitHeatmapSvg({ grid = [], weekdayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], sampled = 0, peakHour = 0, peakWeekday = 'Mon' }) {
  const width = 1250;
  const cell = 41;
  const gap = 7;
  const padL = 96;
  const padT = 132;
  const rows = weekdayOrder.length;
  const cols = 24;
  const plotW = cols * (cell + gap) - gap;
  const heatH = rows * (cell + gap) - gap;
  const height = padT + heatH + 176;

  const flat = grid.flat();
  const max = Math.max(...flat, 1);
  const colorAt = (value) => {
    if (value <= 0) return '#131c31';
    const t = Math.sqrt(value / max);
    const stops = ['#1e293b', '#312e81', '#4338ca', '#6d28d9', '#a855f7', '#e9d5ff'];
    const idx = clamp(Math.floor(t * (stops.length - 1) + 0.0001), 0, stops.length - 1);
    return stops[idx];
  };

  const hourLabels = [0, 3, 6, 9, 12, 15, 18, 21].map((h) =>
    `<text x="${(padL + h * (cell + gap)).toFixed(2)}" y="${padT - 14}" fill="#64748b" font-size="11" font-weight="700" ${font()}>${String(h).padStart(2, '0')}</text>`
  ).join('');

  const rowLabels = weekdayOrder.map((wd, r) => {
    const isPeak = wd === peakWeekday;
    return `<text x="${padL - 16}" y="${(padT + r * (cell + gap) + cell / 2 + 4).toFixed(2)}" text-anchor="end" fill="${isPeak ? '#c4b5fd' : '#94a3b8'}" font-size="11.5" font-weight="${isPeak ? 800 : 600}" ${font()}>${esc(wd)}</text>`;
  }).join('');

  const cells = grid.map((row, r) => row.map((value, h) => {
    const x = padL + h * (cell + gap);
    const y = padT + r * (cell + gap);
    const isPeak = r === weekdayOrder.indexOf(peakWeekday) && h === peakHour;
    const textColor = value > 0 && max > 0 && value / max > 0.55 ? '#0b1020' : '#cbd5e1';
    return `<g>
<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${cell}" height="${cell}" rx="7" fill="${colorAt(value)}" stroke="${isPeak ? '#fbbf24' : '#ffffff'}" stroke-opacity="${isPeak ? 0.95 : 0.06}" stroke-width="${isPeak ? 2 : 1}"/>
${value > 0 ? `<text x="${(x + cell / 2).toFixed(2)}" y="${(y + cell / 2 + 4).toFixed(2)}" text-anchor="middle" fill="${textColor}" font-size="10" font-weight="700" ${font()}>${value}</text>` : ''}
</g>`;
  }).join('')).join('');

  const legendY = padT + heatH + 44;
  const legend = [0, 0.2, 0.4, 0.6, 0.8, 1].map((f, i) => {
    const x = padL + i * 132;
    const value = Math.round(f * f * max);
    return `<rect x="${x}" y="${legendY - 34}" width="26" height="14" rx="4" fill="${colorAt(value)}"/>
<text x="${x + 34}" y="${legendY - 22}" fill="#64748b" font-size="10.5" ${font()}>${value}</text>`;
  }).join('');

  const rowTotals = grid.map((row) => row.reduce((a, b) => a + b, 0));
  const colTotals = Array.from({ length: cols }, (_, h) => grid.reduce((a, row) => a + row[h], 0));
  const busiestRow = weekdayOrder[rowTotals.indexOf(Math.max(...rowTotals))] || '-';
  const busiestCol = colTotals.indexOf(Math.max(...colTotals));
  const workdayShare = ((rowTotals.slice(0, 5).reduce((a, b) => a + b, 0) / (sampled || 1)) * 100).toFixed(1);

  const chipY = padT + heatH + 78;
  const chips = [
    statChip(30, chipY, 'COMMITS PLOTTED', thousandSep(sampled), '#4338ca', 175),
    statChip(215, chipY, 'BUSIEST DAY', busiestRow, '#764ba2', 155),
    statChip(380, chipY, 'BUSIEST HOUR', `${String(busiestCol).padStart(2, '0')}:00 WIB`, '#b45309', 190),
    statChip(580, chipY, 'WEEKDAY SHARE', `${workdayShare}%`, '#15803d', 180),
    statChip(770, chipY, 'PEAK CELL', `${peakWeekday} ${String(peakHour).padStart(2, '0')}:00`, '#7e22ce', 190)
  ].join('');

  const inner = `${hourLabels}${rowLabels}${cells}<text x="${padL}" y="${legendY - 46}" fill="#8b93a7" font-size="11" font-weight="700" ${font()}>commits per cell · sqrt colour scale</text>${legend}${chips}
<text x="30" y="${height - 14}" fill="#64748b" font-size="11" ${font()}>Every owned public commit timestamp returned by the API collector, converted to Asia/Jakarta · automation commits excluded</text>`;
  return baseCard(width, height, 'Commit Rhythm Heatmap', 'Weekday against hour of day in WIB — every cell is the real count of owned commits, not an estimate', inner);
}

// ---------------------------------------------------------------------------
// 4. Repository treemap — area is tracked code lines, colour is dominant language.
// ---------------------------------------------------------------------------
function squarify(items, rect) {
  const out = [];
  let remaining = items.slice();
  let box = { ...rect };
  const scale = () => (box.w * box.h) / Math.max(remaining.reduce((a, r) => a + r.value, 0), 1e-9);
  const worst = (row, side, k) => {
    const sum = row.reduce((a, r) => a + r.value, 0) * k;
    if (sum <= 0 || side <= 0) return Infinity;
    const min = Math.min(...row.map((r) => r.value * k));
    const maxV = Math.max(...row.map((r) => r.value * k));
    const s2 = sum * sum;
    const l2 = side * side;
    return Math.max((l2 * maxV) / s2, s2 / (l2 * min));
  };
  while (remaining.length && box.w > 0.5 && box.h > 0.5) {
    const k = scale();
    const vertical = box.w >= box.h;
    const side = vertical ? box.h : box.w;
    const row = [remaining[0]];
    let i = 1;
    while (i < remaining.length) {
      const candidate = row.concat([remaining[i]]);
      if (worst(candidate, side, k) <= worst(row, side, k)) row.push(remaining[i]);
      else break;
      i += 1;
    }
    const rowValue = row.reduce((a, r) => a + r.value, 0) * k;
    const thickness = clamp(rowValue / Math.max(side, 1e-9), 0, vertical ? box.w : box.h);
    let offset = 0;
    for (const item of row) {
      const len = (item.value * k) / Math.max(thickness, 1e-9);
      out.push(vertical
        ? { ...item, x: box.x, y: box.y + offset, w: thickness, h: len }
        : { ...item, x: box.x + offset, y: box.y, w: len, h: thickness });
      offset += len;
    }
    remaining = remaining.slice(row.length);
    box = vertical
      ? { x: box.x + thickness, y: box.y, w: box.w - thickness, h: box.h }
      : { x: box.x, y: box.y + thickness, w: box.w, h: box.h - thickness };
  }
  return out;
}

export function repoTreemapSvg({ perRepo = [], totals = {}, generatedAt = '' }) {
  const items = perRepo
    .filter((r) => r.codeLines > 0)
    .slice(0, 45)
    .map((r, i) => ({ ...r, value: r.codeLines, color: colorFor(r.topLanguage || 'Other', i), language: r.topLanguage || 'Other' }));
  const width = 1250;
  const padT = 124;
  const padB = 168;
  const height = padT + 560 + padB;
  const rect = { x: 30, y: padT, w: width - 60, h: 560 };
  const layout = squarify(items, rect);
  const totalLines = Number(totals.codeLines) || items.reduce((a, r) => a + r.codeLines, 0);
  const shownLines = items.reduce((a, r) => a + r.codeLines, 0);
  const langs = new Map();
  for (const item of items) {
    const bucket = langs.get(item.language) || { language: item.language, repos: 0, lines: 0, color: item.color };
    bucket.repos += 1;
    bucket.lines += item.value;
    langs.set(item.language, bucket);
  }
  const legendItems = [...langs.values()].sort((a, b) => b.lines - a.lines).slice(0, 9);

  const cells = layout.map((item) => {
    const w = Math.max(1, item.w - 4);
    const h = Math.max(1, item.h - 4);
    const showName = w > 74 && h > 40;
    const showValue = w > 74 && h > 58;
    return `<g>
<rect x="${item.x.toFixed(2)}" y="${item.y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="8" fill="${item.color}" fill-opacity="0.82"/>
<rect x="${item.x.toFixed(2)}" y="${item.y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="8" fill="none" stroke="#0b1020" stroke-opacity="0.5" stroke-width="1.5"/>
${showName ? `<text x="${(item.x + 10).toFixed(2)}" y="${(item.y + 24).toFixed(2)}" fill="#0b1020" font-size="12.5" font-weight="800" ${font()}>${esc(item.repo.length * 6.6 > w - 20 ? item.repo.slice(0, Math.max(3, Math.floor((w - 20) / 6.6))) + '…' : item.repo)}</text>` : ''}
${showValue ? `<text x="${(item.x + 10).toFixed(2)}" y="${(item.y + 44).toFixed(2)}" fill="#0b1020" fill-opacity="0.78" font-size="11" font-weight="700" ${font()}>${compact(item.value)} lines · ${compact(item.files)} files</text>` : ''}
</g>`;
  }).join('');

  const legendY = padT + 560 + 40;
  const legend = legendItems.map((item, i) => {
    const x = 30 + i * 134;
    return `<g transform="translate(${x} ${legendY})">
<rect width="15" height="15" rx="4" fill="${item.color}"/>
<text x="24" y="12" fill="#e2e8f0" font-size="11.5" font-weight="700" ${font()}>${esc(item.language.length > 13 ? item.language.slice(0, 12) + '…' : item.language)}</text>
<text x="24" y="29" fill="#64748b" font-size="10.5" ${font()}>${item.repos} repos · ${((item.lines / (shownLines || 1)) * 100).toFixed(1)}%</text>
</g>`;
  }).join('');

  const chipY = legendY + 56;
  const chips = [
    statChip(30, chipY, 'TILES', String(items.length), '#4338ca', 130),
    statChip(170, chipY, 'LANGUAGES SHOWN', String(legendItems.length), '#764ba2', 190),
    statChip(370, chipY, 'SHOWN SHARE', `${((shownLines / (totalLines || 1)) * 100).toFixed(1)}%`, '#15803d', 165),
    statChip(545, chipY, 'CENSUS TOTAL', `${compact(totalLines)} lines`, '#b45309', 185),
    statChip(740, chipY, 'CELL AREA', 'code lines', '#0e7490', 165)
  ].join('');

  const inner = `${cells}<text x="30" y="${legendY - 14}" fill="#8b93a7" font-size="11" font-weight="700" ${font()}>dominant language of each repository</text>${legend}${chips}
<text x="30" y="${height - 14}" fill="#64748b" font-size="11" ${font()}>Squarified treemap: tile area is proportional to tracked non-blank source lines, colour is the repository’s dominant language · generated ${esc(generatedAt)}</text>`;
  return baseCard(width, height, 'Repository Treemap', 'Every repository with source, sized by tracked code lines and coloured by its dominant language', inner);
}