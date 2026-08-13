import { esc, baseCard, colorFor, PALETTE, thousandSep, compact, humanBytes, clamp, relativeTime, monthDay } from './engine.mjs';

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

export function langDonutSvg(data) {
  const top = data.byBytes.slice(0, 10);
  const rest = data.byBytes.slice(10);
  const restBytes = rest.reduce((a, x) => a + x.bytes, 0);
  const slices = [...top];
  if (restBytes > 0) slices.push({ name: 'Other', bytes: restBytes, repos: rest.reduce((a, x) => a + x.repos, 0) });
  const total = slices.reduce((a, x) => a + x.bytes, 0) || 1;
  const cx = 240;
  const cy = 268;
  const rOuter = 148;
  const rInner = 92;
  let angle = -90;
  const arcs = [];
  const legend = [];
  for (let i = 0; i < slices.length; i++) {
    const s = slices[i];
    const frac = s.bytes / total;
    const sweep = Math.max(0.4, frac * 360);
    const a0 = angle;
    const a1 = angle + sweep;
    const large = sweep > 180 ? 1 : 0;
    const x0 = cx + rOuter * Math.cos((a0 * Math.PI) / 180);
    const y0 = cy + rOuter * Math.sin((a0 * Math.PI) / 180);
    const x1 = cx + rOuter * Math.cos((a1 * Math.PI) / 180);
    const y1 = cy + rOuter * Math.sin((a1 * Math.PI) / 180);
    const x0i = cx + rInner * Math.cos((a0 * Math.PI) / 180);
    const y0i = cy + rInner * Math.sin((a0 * Math.PI) / 180);
    const x1i = cx + rInner * Math.cos((a1 * Math.PI) / 180);
    const y1i = cy + rInner * Math.sin((a1 * Math.PI) / 180);
    const color = colorFor(s.name, i);
    arcs.push(`<path d="M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${rOuter} ${rOuter} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x1i.toFixed(2)} ${y1i.toFixed(2)} A ${rInner} ${rInner} 0 ${large} 0 ${x0i.toFixed(2)} ${y0i.toFixed(2)} Z" fill="${color}" stroke="#0b1020" stroke-width="2.5"/>`);
    const mid = ((a0 + a1) / 2 * Math.PI) / 180;
    const lx = cx + (rOuter + 24) * Math.cos(mid);
    const ly = cy + (rOuter + 24) * Math.sin(mid);
    const pct = (frac * 100).toFixed(1);
    legend.push({ name: s.name, pct, bytes: s.bytes, color, lx, ly, frac });
    angle = a1;
  }
  const legendColA = slices.slice(0, 6);
  const legendColB = slices.slice(6);
  const legendRow = (s, i, colX) => {
    const color = colorFor(s.name, i);
    const pct = ((s.bytes / total) * 100).toFixed(1);
    const name = s.name.length > 19 ? s.name.slice(0, 18) + '…' : s.name;
    return `<g transform="translate(${colX} ${130 + (i % 6) * 29})">
<rect x="0" y="4" width="13" height="13" rx="3.5" fill="${color}"/>
<text x="21" y="15" fill="#e2e8f0" font-size="12.5" font-weight="600" ${font()}>${esc(name)}</text>
<text x="212" y="15" fill="#cbd5e1" font-size="12" text-anchor="end" ${font()}>${pct}%</text>
<text x="236" y="15" fill="#64748b" font-size="11" text-anchor="end" ${font()}>${humanBytes(s.bytes)}</text>
</g>`;
  };
  const legendRows = legendColA.map((s, i) => legendRow(s, i, 440)).join('');
  const legendRows2 = legendColB.map((s, i) => legendRow(s, i + 6, 700)).join('');
  const chips = [
    statChip(30, 436, 'SHANNON ENTROPY', `${data.entropy.toFixed(2)} bits`, '#667eea', 168),
    statChip(208, 436, 'HHI ×10⁴', data.hhi.toFixed(1), '#764ba2', 122),
    statChip(340, 436, 'GINI COEF.', data.gini.toFixed(3), '#16a34a', 122),
    statChip(472, 436, 'CR₃', `${data.cr3.toFixed(1)}%`, '#f59e0b', 122),
    statChip(604, 436, 'CR₅', `${data.cr5.toFixed(1)}%`, '#06b6d4', 122),
    statChip(736, 436, '80/20 TOP', `${data.pareto80.count}/${data.pareto80.totalCount}`, '#db2777', 146)
  ].join('');
  const inner = `
<text x="${cx}" y="${cy - 22}" text-anchor="middle" fill="#94a3b8" font-size="12" font-weight="700" letter-spacing="1.5" ${font()}>CODE BYTES</text>
<text x="${cx}" y="${cy + 8}" text-anchor="middle" fill="#ffffff" font-size="26" font-weight="900" ${font()}>${compact(data.totalBytes)}</text>
<text x="${cx}" y="${cy + 30}" text-anchor="middle" fill="#64748b" font-size="11" ${font()}>across ${data.languagesCount} languages</text>
${arcs.join('')}
${legendRows}
${legendRows2}
${chips}
`;
  return baseCard(900, 510, 'Language Distribution', `Byte share of every language across all ${data.repoCount} public repositories · GitHub /languages API · professor-grade statistics`, inner);
}

export function langParetoSvg(data) {
  const top = data.byBytes.slice(0, 12);
  const restCount = Math.max(0, data.byBytes.length - top.length);
  const restBytes = data.byBytes.slice(12).reduce((a, x) => a + x.bytes, 0);
  const total = data.totalBytes || 1;
  const width = 1250;
  const height = 620;
  const padL = 116;
  const padR = 96;
  const padT = 128;
  const padB = 172;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const maxValue = Math.max(...top.map((x) => x.bytes), 1);
  const step = plotW / top.length;
  const barW = step * 0.58;
  let cumulative = 0;
  const bars = top.map((x, i) => {
    const barH = Math.max(3, (x.bytes / maxValue) * plotH);
    const bx = padL + i * step + (step - barW) / 2;
    const by = padT + plotH - barH;
    cumulative += x.bytes / total;
    const cxp = padL + (i + 0.5) * step;
    const cyp = padT + plotH - cumulative * plotH;
    return { x, i, bx, by, barH, cumulative, cxp, cyp };
  });
  const gridlines = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const gy = padT + plotH - f * plotH;
    const label = compact(Math.round(f * maxValue));
    return `<line x1="${padL}" y1="${gy}" x2="${width - padR}" y2="${gy}" stroke="#ffffff" stroke-opacity="0.07" stroke-width="1"/>
<text x="${padL - 14}" y="${gy + 4}" text-anchor="end" fill="#64748b" font-size="11.5" ${font()}>${label}</text>`;
  }).join('');
  const barEls = bars.map((b) => {
    const pct = ((b.x.bytes / total) * 100).toFixed(1);
    return `<g>
<rect x="${b.bx.toFixed(2)}" y="${b.by.toFixed(2)}" width="${barW.toFixed(2)}" height="${b.barH.toFixed(2)}" rx="5" fill="url(#grad${b.i})" opacity="0.96"/>
<rect x="${b.bx.toFixed(2)}" y="${b.by.toFixed(2)}" width="${barW.toFixed(2)}" height="3.5" rx="1.75" fill="#ffffff" fill-opacity="0.28"/>
<text x="${(b.bx + barW / 2).toFixed(2)}" y="${(b.by - 11).toFixed(2)}" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="800" ${font()}>${compact(b.x.bytes)}</text>
<text x="${(b.bx + barW / 2).toFixed(2)}" y="${(b.by - 29).toFixed(2)}" text-anchor="middle" fill="#94a3b8" font-size="10" font-weight="700" ${font()}>${pct}%</text>
</g>`;
  }).join('');
  const gradDefs = top.map((b, i) => {
    const color = colorFor(b.name, i);
    return `<linearGradient id="grad${i}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity="0.5"/></linearGradient>`;
  }).join('');
  const poly = bars.map((b) => `${b.cxp.toFixed(2)},${b.cyp.toFixed(2)}`).join(' ');
  const p80y = padT + plotH - 0.8 * plotH;
  const pills = bars.map((b) => {
    const px = b.cxp.toFixed(2);
    const py = b.cyp.toFixed(2);
    return `<g>
<rect x="${(b.cxp - 19).toFixed(2)}" y="${(b.cyp - 17).toFixed(2)}" width="38" height="16" rx="8" fill="#0d1322" stroke="#a78bfa" stroke-opacity="0.7" stroke-width="1"/>
<text x="${px}" y="${(b.cyp - 6).toFixed(2)}" text-anchor="middle" fill="#c4b5fd" font-size="9.5" font-weight="800" ${font()}>${Math.round(b.cumulative * 100)}%</text>
</g>`;
  }).join('');
  const cumulativeLine = `
<polyline points="${poly}" fill="none" stroke="#a78bfa" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
${bars.map((b) => `<circle cx="${b.cxp.toFixed(2)}" cy="${b.cyp.toFixed(2)}" r="4.5" fill="#a78bfa" stroke="#0b1020" stroke-width="2.5"/>`).join('')}
${pills}
<line x1="${padL}" y1="${p80y}" x2="${width - padR}" y2="${p80y}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="8 6"/>
<text x="${width - padR - 6}" y="${p80y - 8}" text-anchor="end" fill="#fbbf24" font-size="12" font-weight="800" ${font()}>Pareto 80%</text>`;
  const xLabels = bars.map((b) => {
    const cxv = padL + (b.i + 0.5) * step;
    const name = b.x.name.length > 17 ? b.x.name.slice(0, 16) + '…' : b.x.name;
    return `<text x="${cxv.toFixed(2)}" y="${padT + plotH + 18}" text-anchor="middle" fill="#cbd5e1" font-size="11.5" font-weight="600" ${font()}>${esc(name)}</text>`;
  }).join('');
  const pctAxis = [0, 25, 50, 75, 100].map((p) => {
    const gy = padT + plotH - (p / 100) * plotH;
    return `<text x="${width - padR + 18}" y="${gy + 4}" fill="#a78bfa" font-size="11.5" ${font()}>${p}%</text>`;
  }).join('');
  const restNote = restCount > 0
    ? `<text x="${padL}" y="${padT + plotH + 44}" fill="#64748b" font-size="11.5" ${font()}>${restCount} more languages not shown · ${compact(restBytes)} bytes · ${((restBytes / total) * 100).toFixed(1)}% of total — full census in the radar chart</text>`
    : '';
  const topChips = [
    statChip(30, 560, 'TOP SHARE', `${data.topShare.toFixed(1)}%`, '#667eea', 170),
    statChip(210, 560, 'GEOMEAN', compact(data.geomeanBytes), '#764ba2', 160),
    statChip(380, 560, 'MEDIAN', compact(data.medianBytes), '#16a34a', 160),
    statChip(550, 560, 'C.V.', data.cv.toFixed(2), '#f59e0b', 130),
    statChip(690, 560, 'TOP 12', `${(bars.reduce((a, b) => a + b.x.bytes, 0) / total) * 100}%`, '#06b6d4', 150),
    statChip(850, 560, 'TOTAL', compact(total), '#db2777', 240)
  ].join('');
  const inner = `
<defs>${gradDefs}</defs>
${gridlines}
${barEls}
${cumulativeLine}
${xLabels}
${pctAxis}
${restNote}
${topChips}
`;
  return baseCard(width, height, 'Language Bytes — Pareto Analysis', 'Top 12 languages by bytes, per-language share %, cumulative line (right axis) and the 80% Pareto threshold · real byte counts', inner);
}

export function langRadarSvg(data) {
  const top = data.byRepo.slice(0, 8);
  const cx = 425;
  const cy = 305;
  const radius = 205;
  const k = top.length;
  const norm = data.logNormalizedRepo;
  const axisPoint = (i, r) => {
    const angle = (-90 + (360 / k) * i) * (Math.PI / 180);
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  };
  const rings = [0.25, 0.5, 0.75, 1].map((f) => {
    const pts = [];
    for (let i = 0; i < k; i++) {
      const [x, y] = axisPoint(i, radius * f);
      pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    }
    return `<polygon points="${pts.join(' ')}" fill="none" stroke="#ffffff" stroke-opacity="0.1" stroke-width="1"/>`;
  }).join('');
  const axes = top.map((x, i) => {
    const [x0, y0] = axisPoint(i, radius);
    const [x1, y1] = axisPoint(i, radius + 34);
    return `<line x1="${cx}" y1="${cy}" x2="${x0.toFixed(2)}" y2="${y0.toFixed(2)}" stroke="#ffffff" stroke-opacity="0.12" stroke-width="1"/>
<text x="${x1.toFixed(2)}" y="${y1.toFixed(2)}" text-anchor="middle" fill="#e2e8f0" font-size="13.5" font-weight="700" ${font()}>${esc(x.name)}</text>`;
  }).join('');
  const dataPts = top.map((x, i) => {
    const [px, py] = axisPoint(i, radius * norm[i]);
    return `${px.toFixed(2)},${py.toFixed(2)}`;
  });
  const polygon = `<polygon points="${dataPts.join(' ')}" fill="#667eea" fill-opacity="0.32" stroke="#a78bfa" stroke-width="2.5" stroke-linejoin="round"/>`;
  const dots = top.map((x, i) => {
    const [px, py] = axisPoint(i, radius * norm[i]);
    return `<circle cx="${px.toFixed(2)}" cy="${py.toFixed(2)}" r="5.5" fill="#a78bfa" stroke="#0b1020" stroke-width="2"/>`;
  }).join('');
  const list = top.map((x, i) => {
    const val = Math.round(norm[i] * 100);
    return `<g transform="translate(790 ${116 + i * 45})">
<text x="0" y="15" fill="#e2e8f0" font-size="15" font-weight="700" ${font()}>${esc(x.name)}</text>
<text x="245" y="15" text-anchor="end" fill="#cbd5e1" font-size="13" ${font()}>${x.repos} repos</text>
<rect x="0" y="26" width="330" height="9" rx="4.5" fill="#1e293b"/>
<rect x="0" y="26" width="${(val / 100) * 330}" height="9" rx="4.5" fill="${colorFor(x.name, i)}"/>
<text x="340" y="33" fill="#94a3b8" font-size="11" font-weight="700" ${font()}>${val}%</text>
</g>`;
  }).join('');
  const censusTop = data.byRepo.slice(0, 10);
  const censusRest = data.byRepo.length - censusTop.length;
  const census = `${censusTop.map((x) => `${x.name} (${x.repos})`).join(' · ')}${censusRest ? ` · +${censusRest} more` : ''}`;
  const censusText = census.length > 165 ? census.slice(0, 162) + '…' : census;
  const inner = `
${rings}
${axes}
${polygon}
${dots}
${list}
<text x="790" y="${116 + top.length * 45 + 28}" fill="#94a3b8" font-size="12.5" font-weight="700" letter-spacing="1" ${font()}>LOG-NORMALIZED ADOPTION</text>
<text x="30" y="630" fill="#64748b" font-size="11" ${font()}>LANGUAGE CENSUS (${data.repoCount} REPOS): ${esc(censusText)}</text>
`;
  return baseCard(1150, 660, 'Language Adoption Radar', 'Top 8 languages by repository count, log-normalized radar — every language supported, full census below', inner);
}

export function codeTotalsBadgeSvg({ totalLines, totalChars, repoCount, files, generatedAt }) {
  const width = 900;
  const height = 178;
  const padX = 34;
  const gap = 16;
  const tileW = (width - padX * 2 - gap * 2) / 3;
  const metrics = [
    { label: 'NON-BLANK CODE LINES', value: thousandSep(totalLines), accent: '#818cf8', glow: '#4f46e5' },
    { label: 'UNICODE CHARACTERS', value: thousandSep(totalChars), accent: '#fbbf24', glow: '#d97706' },
    { label: 'TRACKED CODE FILES', value: thousandSep(files), accent: '#2dd4bf', glow: '#0f766e' }
  ];
  const tiles = metrics.map((metric, index) => {
    const x = padX + index * (tileW + gap);
    const valueFont = clamp(Math.floor(Math.min(42, (tileW - 32) / (metric.value.length * 0.59))), 19, 42);
    return `<g transform="translate(${x} 55)">
<rect width="${tileW}" height="74" rx="14" fill="#080d19" stroke="#ffffff" stroke-opacity="0.1"/>
<rect width="${tileW}" height="74" rx="14" fill="url(#tileGloss)" opacity="0.5"/>
<rect x="10" y="12" width="5" height="50" rx="2.5" fill="${metric.accent}"/>
<text x="${tileW / 2 + 10}" y="23" text-anchor="middle" fill="#94a3b8" font-size="10" font-weight="800" letter-spacing="1.25" ${font()}>${metric.label}</text>
<text x="${tileW / 2 + 10}" y="58" text-anchor="middle" fill="#f8fafc" font-size="${valueFont}" font-weight="900" filter="url(#glow${index})" ${font()}>${metric.value}</text>
</g>`;
  }).join('');
  const cap = `${repoCount} PUBLIC REPOSITORIES · EVERY TRACKED SOURCE FILE · VERIFIED ON EACH SNAPSHOT · ${generatedAt}`;
  const capFont = clamp(Math.floor((width - 60) / (cap.length * 0.59)), 8, 10);
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="censusBg" x1="0" y1="0" x2="${width}" y2="${height}"><stop stop-color="#0b1120"/><stop offset="0.52" stop-color="#111827"/><stop offset="1" stop-color="#1e1b4b"/></linearGradient>
<linearGradient id="tileGloss" x1="0" y1="0" x2="0" y2="74"><stop stop-color="#ffffff" stop-opacity="0.1"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
${metrics.map((metric, index) => `<filter id="glow${index}" x="-25%" y="-45%" width="150%" height="220%"><feGaussianBlur stdDeviation="2.5" result="blur"/><feFlood flood-color="${metric.glow}" flood-opacity="0.55"/><feComposite in2="blur" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`).join('')}
</defs>
<rect x="2" y="2" width="${width - 4}" height="${height - 4}" rx="22" fill="url(#censusBg)" stroke="#475569" stroke-opacity="0.9" stroke-width="2"/>
<rect x="3" y="3" width="${width - 6}" height="48" rx="20" fill="#ffffff" fill-opacity="0.035"/>
<circle cx="31" cy="28" r="9" fill="#22c55e"/><path d="M27 28.5l2.8 2.8L35 25.5" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
<text x="49" y="25" fill="#f8fafc" font-size="17" font-weight="900" letter-spacing="1.3" ${font()}>FULL CODE CENSUS</text>
<text x="49" y="42" fill="#94a3b8" font-size="10.5" font-weight="700" letter-spacing="0.55" ${font()}>ALL TRACKED SOURCE FILES · COMPLETE READ · REPRODUCIBLE TOTALS</text>
<text x="${width - 34}" y="32" text-anchor="end" fill="#86efac" font-size="11" font-weight="900" letter-spacing="1.1" ${font()}>VERIFIED</text>
${tiles}
<line x1="28" y1="143" x2="${width - 28}" y2="143" stroke="#ffffff" stroke-opacity="0.1"/>
<text x="${width / 2}" y="162" text-anchor="middle" fill="#94a3b8" font-size="${capFont}" font-weight="800" letter-spacing="0.9" ${font()}>${esc(cap.toUpperCase())}</text>
</svg>
`;
}

export function statsGridSvg(data) {
  const cards = [
    ['PUBLIC REPOS', data.publicRepos, '#667eea'],
    ['ORIGINAL REPOS', data.originalRepos, '#764ba2'],
    ['FORKED REPOS', data.forkedRepos, '#111827'],
    ['TOTAL STARS', data.totalStars, '#f59e0b'],
    ['TOTAL FORKS', data.totalForks, '#16a34a'],
    ['FOLLOWERS', data.followers, '#2563eb'],
    ['FOLLOWING', data.following, '#06b6d4'],
    ['PUBLIC GISTS', data.publicGists, '#db2777'],
    ['TOP LANGUAGE', data.topLanguage, '#a855f7'],
    ['REPO SIZE', data.totalSize, '#14b8a6'],
    ['ACCOUNT AGE', data.accountAgePrecise || data.accountAge, '#22c55e'],
    ['TOTAL WATCHERS', data.totalWatchers, '#ec4899']
  ];
  const inner = cards.map(([label, value, color], i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = 30 + col * 211;
    const y = 108 + row * 96;
    const text = String(value);
    const fontSize = text.length > 14 ? 15 : text.length > 10 ? 17 : 20;
    return `<g transform="translate(${x} ${y})">
<rect width="190" height="74" rx="16" fill="#0d1322" stroke="${color}" stroke-opacity="0.4" stroke-width="1.3"/>
<rect width="190" height="4" rx="2" fill="${color}" opacity="0.85"/>
<text x="15" y="27" fill="#94a3b8" font-size="11" font-weight="800" letter-spacing="1.1" ${font()}>${esc(label)}</text>
<text x="15" y="58" fill="#ffffff" font-size="${fontSize}" font-weight="800" ${font()}>${esc(text)}</text>
</g>`;
  }).join('');
  return baseCard(900, 410, 'GitHub Overview', `Auto-generated snapshot · ${data.generatedAt} · live from the GitHub API`, inner);
}

export function githubStatsSvg(data) {
  const cards = [
    ['Repos', data.publicRepos],
    ['Original', data.originalRepos],
    ['Stars', data.totalStars],
    ['Forks', data.totalForks],
    ['Followers', data.followers],
    ['Gists', data.publicGists],
    ['Top Lang', data.topLanguage],
    ['Age', data.accountAge]
  ];
  const inner = cards.map(([label, value], i) => {
    const x = 30 + (i % 4) * 211;
    const y = 110 + Math.floor(i / 4) * 96;
    const color = colorFor(String(value), i);
    return `<g transform="translate(${x} ${y})">
<rect width="188" height="72" rx="17" fill="#0d1322" stroke="${color}" stroke-width="1.3"/>
<text x="16" y="27" fill="#94a3b8" font-size="13" ${font()}>${esc(label)}</text>
<text x="16" y="54" fill="#ffffff" font-size="21" font-weight="800" ${font()}>${esc(value)}</text>
</g>`;
  }).join('');
  return baseCard(900, 305, 'GitHub Stats', `Auto-generated · ${data.generatedAt}`, inner);
}

export function topLangsSvg(data) {
  const stack = data.languageStack || data.byBytes || [];
  const total = stack.reduce((a, x) => a + x.bytes, 0) || 1;
  let y = 112;
  const inner = stack.slice(0, 8).map((x, i) => {
    const pct = Math.max(1, Math.round((x.bytes / total) * 100));
    const width = Math.max(18, Math.round((pct / 100) * 650));
    const out = `<g transform="translate(32 ${y})">
<text x="0" y="17" fill="#e5e7eb" font-size="15" font-weight="700" ${font()}>${esc(x.name)}</text>
<rect x="170" y="2" width="650" height="18" rx="9" fill="#1f2937"/>
<rect x="170" y="2" width="${width}" height="18" rx="9" fill="${colorFor(x.name, i)}"/>
<text x="835" y="17" fill="#cbd5e1" font-size="13" text-anchor="end" ${font()}>${pct}% · ${x.repos} repos</text>
</g>`;
    y += 31;
    return out;
  }).join('');
  return baseCard(900, 390, 'Top Languages', 'Scanned from every public repository via the GitHub /languages API', inner);
}

export function topReposSvg(repos) {
  const width = 1000;
  const height = 590;
  const medalColors = ['#fbbf24', '#c7cedb', '#c08552', '#667eea', '#764ba2'];
  const safeNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const inner = repos.slice(0, 5).map((repo, i) => {
    const y = 108 + i * 88;
    const color = medalColors[i];
    const scoreRaw = safeNum(repo.scorePct);
    const scorePct = Math.max(2, Math.min(100, scoreRaw > 0 ? scoreRaw : 25));
    const dsp = safeNum(repo.daysSincePush);
    const pushed = dsp <= 1 ? 'today' : dsp <= 30 ? `${Math.round(dsp)} d ago` : dsp <= 365 ? `${Math.round(dsp / 30)} mo ago` : `${Math.round(dsp / 365)} yr ago`;
    return `<a href="${esc(repo.url)}"><g transform="translate(30 ${y})">
<rect width="940" height="76" rx="18" fill="#0d1322" stroke="${color}" stroke-opacity="0.5" stroke-width="1.4"/>
<circle cx="38" cy="38" r="20" fill="${color}" fill-opacity="0.16" stroke="${color}" stroke-width="2"/>
<text x="38" y="44" text-anchor="middle" fill="${color}" font-size="17" font-weight="900" ${font()}>${i + 1}</text>
<text x="72" y="30" fill="#ffffff" font-size="18.5" font-weight="800" ${font()}>${esc(repo.name)}</text>
<circle cx="72" cy="50" r="4" fill="${colorFor(repo.language, i)}"/>
<text x="84" y="54" fill="#8b93a7" font-size="11.5" font-weight="600" ${font()}>${esc(repo.language)}</text>
<rect x="72" y="63" width="560" height="7" rx="3.5" fill="#1e293b"/>
<rect x="72" y="63" width="${(scorePct / 100) * 560}" height="7" rx="3.5" fill="url(#scoreGrad${i})"/>
<text x="660" y="69" fill="${color}" font-size="16" font-weight="900" ${font()}>${scorePct.toFixed(1)}</text>
<text x="730" y="28" fill="#e2e8f0" font-size="12.5" font-weight="700" ${font()}>★ ${compact(repo.stars)}</text>
<text x="796" y="28" fill="#e2e8f0" font-size="12.5" font-weight="700" ${font()}>⑂ ${compact(repo.forks)}</text>
<text x="862" y="28" fill="#cbd5e1" font-size="12.5" ${font()}>${compact(repo.commits)} commits</text>
<text x="730" y="50" fill="#cbd5e1" font-size="11.5" ${font()}>${compact(repo.prs)} PR · ${compact(repo.issues)} IS · ${compact(repo.watchers)} W</text>
<text x="850" y="50" fill="#5b6478" font-size="11.5" ${font()}>pushed ${pushed}</text>
<text x="960" y="38" fill="#64748b" font-size="10.5" ${font()}>score</text>
</g></a>`;
  }).join('');
  const gradDefs = medalColors.map((c, i) => `<linearGradient id="scoreGrad${i}" x1="0" y1="0" x2="1" y2="0"><stop stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity="0.35"/></linearGradient>`).join('');
  const formula = 'score = 2.4·log(stars) + 1.7·log(forks) + 1.3·log(watchers) + 1.2·log(PRs) + 0.7·log(issues) + 0.6·log(disc) + 2.1·log(commits) + 2.0·e^(−d/45) · re-ranked automatically every run';
  return baseCard(width, height, 'Top 5 Repositories — Dynamic Ranking', 'Re-ranked every run by a composite activity score: stars, forks, watchers, PRs, issues, discussions, commits, recency', `<defs>${gradDefs}</defs>${inner}<text x="30" y="560" fill="#5b6478" font-size="10" ${font()}>${esc(formula)}</text>`);
}

export function cloudSvg(title, subtitle, items, fallback) {
  const list = (items.length ? items : fallback)
    .slice(0, 14)
    .map((x, i) => {
      const text = `${x.name} · ${x.count ?? x.repos ?? ''}`;
      const width = Math.max(96, text.length * 8 + 36);
      return { text, width, color: colorFor(x.name, i) };
    });
  const rows = [[]];
  let rowWidth = 0;
  for (const item of list) {
    if (rowWidth + item.width + 10 > 830 && rows.at(-1).length) {
      rows.push([]);
      rowWidth = 0;
    }
    rows.at(-1).push(item);
    rowWidth += item.width + 10;
  }
  const h = 120 + rows.length * 46;
  const inner = rows.map((row, ri) => {
    let x = 870;
    return row.map((item) => {
      x -= item.width;
      const out = `<g transform="translate(${x} ${112 + ri * 44})">
<rect width="${item.width}" height="31" rx="15.5" fill="${item.color}"/>
<text x="${item.width / 2}" y="20" text-anchor="middle" fill="#ffffff" font-size="13" font-weight="800" ${font()}>${esc(item.text)}</text>
</g>`;
      x -= 10;
      return out;
    }).join('');
  }).join('');
  return baseCard(900, h, title, subtitle, inner);
}

const HEAT_COLORS = ['#1b2333', '#2f2a66', '#4c3fb0', '#7a6cf0', '#a78bfa'];

export function streakSvg(data) {
  const width = 1000;
  const height = 600;
  const flame = `<g transform="translate(20 144) scale(0.6)">
<path d="M0 44 C0 26 14 12 26 0 C24 20 34 30 40 22 C46 30 52 36 52 48 C52 62 40 72 26 72 C12 72 0 62 0 44 Z" fill="url(#flameGrad)"/>
<path d="M18 58 C18 48 26 40 34 34 C33 46 40 52 44 48 C47 54 47 60 43 64 C38 70 26 70 22 66 C19 64 18 61 18 58 Z" fill="#ffedd5" opacity="0.9"/>
</g>`;
  const lastActiveTs = data.lastActiveIso || (data.lastActiveDate ? `${data.lastActiveDate}T00:00:00Z` : null);
  const hero = `<g transform="translate(30 108)">
<rect width="380" height="206" rx="20" fill="#0d1322" stroke="#667eea" stroke-opacity="0.5" stroke-width="1.4"/>
<rect width="380" height="6" rx="3" fill="url(#bar)"/>
${flame}
<text x="78" y="152" fill="#ffffff" font-size="52" font-weight="900" ${font()}>${data.currentStreak}</text>
<text x="78" y="174" fill="#a78bfa" font-size="13" font-weight="800" letter-spacing="2" ${font()}>DAY STREAK</text>
<text x="78" y="204" fill="#8b93a7" font-size="12" ${font()}>Last active: <tspan fill="#e2e8f0" font-weight="700">${lastActiveTs ? relativeTime(lastActiveTs) : 'unknown'}</tspan></text>
<text x="78" y="224" fill="#64748b" font-size="11" ${font()}>${data.lastActiveDate ? monthDay(`${data.lastActiveDate}T00:00:00Z`) : ''} · longest streak ${data.longest} days</text>
<text x="20" y="258" fill="#5b6478" font-size="10" ${font()}>GITHUB CONTRIBUTION CALENDAR · 365 DAYS</text>
</g>`;
  const statCard = (x, y, label, value, color) => `<g transform="translate(${x} ${y})">
<rect width="255" height="58" rx="13" fill="#0d1322" stroke="${color}" stroke-opacity="0.35" stroke-width="1.2"/>
<rect x="0" y="0" width="255" height="4" rx="2" fill="${color}"/>
<circle cx="15" cy="20" r="3" fill="${color}"/>
<text x="25" y="23" fill="#8b93a7" font-size="10.5" font-weight="800" letter-spacing="1.1" ${font()}>${esc(label)}</text>
<text x="14" y="47" fill="#ffffff" font-size="19" font-weight="800" ${font()}>${esc(value)}</text>
</g>`;
  const right = [
    statCard(430, 108, 'LONGEST STREAK', `${data.longest} days`, '#667eea'),
    statCard(697, 108, 'CONTRIBUTIONS (365D)', thousandSep(data.totalContributions), '#16a34a'),
    statCard(430, 176, 'COMMITS (GITHUB)', thousandSep(data.totalCommitContributions), '#2563eb'),
    statCard(697, 176, 'PULL REQUESTS', thousandSep(data.pullRequests), '#f59e0b'),
    statCard(430, 244, 'ISSUES', thousandSep(data.issues), '#db2777'),
    statCard(697, 244, 'REPOS CONTRIBUTED', thousandSep(data.reposContributed), '#06b6d4')
  ].join('');
  const sortedDays = [...data.days].sort((a, b) => a.date.localeCompare(b.date));
  const lastDays = sortedDays.slice(-98);
  const hx = 30;
  const hy = 376;
  const cells = lastDays.map((d, i) => {
    const col = Math.floor(i / 7);
    const row = i % 7;
    const lvl = data.level ? data.level(d.count) : 0;
    return `<rect x="${hx + col * 19}" y="${hy + row * 19}" width="16" height="16" rx="3.5" fill="${HEAT_COLORS[lvl]}"/>`;
  }).join('');
  const weekTotal = lastDays.reduce((a, d) => a + d.count, 0);
  const heatSide = `<g>
<text x="330" y="380" fill="#e2e8f0" font-size="17" font-weight="800" ${font()}>${thousandSep(weekTotal)}</text>
<text x="330" y="400" fill="#64748b" font-size="11.5" ${font()}>contributions in last 14 weeks</text>
<text x="330" y="428" fill="#cbd5e1" font-size="13" font-weight="700" ${font()}>${data.activeDays} active days</text>
<text x="330" y="448" fill="#64748b" font-size="11.5" ${font()}>of the last 365 days</text>
<text x="330" y="476" fill="${data.currentStreak > 0 ? '#a78bfa' : '#64748b'}" font-size="13" font-weight="800" ${font()}>${data.currentStreak > 0 ? '🔥 streak alive' : 'streak broken'}</text>
</g>`;
  const legendCells = HEAT_COLORS.map((c, i) => `<rect x="${78 + i * 21}" y="517" width="14" height="14" rx="3.5" fill="${c}"/>`).join('');
  const inner = `
<defs>
<linearGradient id="flameGrad" x1="0" y1="1" x2="0" y2="0"><stop stop-color="#f97316"/><stop offset="0.5" stop-color="#f59e0b"/><stop offset="1" stop-color="#fbbf24"/></linearGradient>
</defs>
${hero}
${right}
<text x="30" y="360" fill="#94a3b8" font-size="12" font-weight="800" letter-spacing="1.4" ${font()}>LAST 14 WEEKS OF CONTRIBUTIONS</text>
${cells}
${heatSide}
<text x="30" y="527" fill="#94a3b8" font-size="11" ${font()}>Less</text>
${legendCells}
<text x="183" y="527" fill="#94a3b8" font-size="11" ${font()}>More</text>
<text x="330" y="527" fill="#5b6478" font-size="10.5" ${font()}>full year calendar below · auto-updates with every run</text>
`;
  return baseCard(width, height, 'Contribution Streak & Activity', `Computed from the GitHub contribution calendar · last 365 days · accurate, live data`, inner);
}

export function commitHoursSvg(data) {
  const width = 1000;
  const height = 600;
  const padL = 70;
  const padR = 34;
  const padT = 116;
  const padB = 62;
  const plotW = width - padL - padR;
  const plotH = 300;
  const maxCount = Math.max(...data.hourCounts, 1);
  const step = plotW / 24;
  const barW = step * 0.62;
  const bars = data.hourCounts.map((count, hour) => {
    const barH = Math.max(2, (count / maxCount) * plotH);
    const bx = padL + hour * step + (step - barW) / 2;
    const by = padT + plotH - barH;
    const isPeak = hour === data.peakHour;
    return { hour, count, bx, by, barH, isPeak };
  });
  const gridlines = [0.25, 0.5, 0.75, 1].map((f) => {
    const gy = padT + plotH - f * plotH;
    return `<line x1="${padL}" y1="${gy}" x2="${width - padR}" y2="${gy}" stroke="#ffffff" stroke-opacity="0.06" stroke-width="1"/>
<text x="${padL - 8}" y="${gy + 4}" text-anchor="end" fill="#64748b" font-size="10.5" ${font()}>${Math.round(f * maxCount)}</text>`;
  }).join('');
  const barEls = bars.map((b) => {
    const fill = b.isPeak ? 'url(#peakGrad)' : 'url(#hourGrad)';
    return `<g>
<rect x="${b.bx.toFixed(2)}" y="${b.by.toFixed(2)}" width="${barW.toFixed(2)}" height="${b.barH.toFixed(2)}" rx="3.5" fill="${fill}" opacity="${b.isPeak ? 1 : 0.85}"/>
${b.count > 0 ? `<text x="${(b.bx + barW / 2).toFixed(2)}" y="${(b.by - 6).toFixed(2)}" text-anchor="middle" fill="${b.isPeak ? '#fbbf24' : '#8b93a7'}" font-size="9.5" font-weight="${b.isPeak ? 800 : 600}" ${font()}>${b.count}</text>` : ''}
</g>`;
  }).join('');
  const xLabels = Array.from({ length: 12 }, (_, i) => {
    const hour = i * 2;
    const cxv = padL + hour * step + step / 2;
    return `<text x="${cxv.toFixed(2)}" y="${padT + plotH + 18}" text-anchor="middle" fill="#64748b" font-size="10.5" ${font()}>${hour}</text>`;
  }).join('');
  const peakBar = bars[data.peakHour];
  const peakMark = `<path d="M ${(peakBar.bx + barW / 2).toFixed(2)} ${(peakBar.by - 20).toFixed(2)} l -6 9 l 12 0 z" fill="#fbbf24"/>`;
  const chips = [
    statChip(30, 446, 'PEAK HOUR', `${data.peakHour}:00`, '#f59e0b', 150),
    statChip(190, 446, 'MEAN (CIRCULAR)', `${data.circularMean.toFixed(1)}:00`, '#667eea', 170),
    statChip(370, 446, 'SAMPLED COMMITS', thousandSep(data.sampled), '#2563eb', 170),
    statChip(550, 446, 'ACTIVE HOURS', `${data.activeHours}/24`, '#16a34a', 150),
    statChip(710, 446, 'BUSIEST DAY', data.peakWeekday, '#06b6d4', 130),
    statChip(850, 446, 'COMMITS TOTAL', compact(data.totalCommitContributions), '#db2777', 130)
  ].join('');
  const maxWeekday = Math.max(...data.weekdayCounts, 1);
  const weekdayBars = data.weekdayCounts.map((count, i) => {
    const bh = Math.max(3, (count / maxWeekday) * 38);
    const bx = 40 + i * 128;
    const by = 574 - bh;
    const color = count > 0 ? colorFor('Shell', i) : '#1e293b';
    return `<g>
<rect x="${bx}" y="${by}" width="34" height="${bh}" rx="4" fill="${color}" opacity="0.9"/>
<text x="${bx + 17}" y="${by - 6}" text-anchor="middle" fill="#cbd5e1" font-size="10.5" font-weight="700" ${font()}>${count}</text>
<text x="${bx + 17}" y="${590}" text-anchor="middle" fill="#8b93a7" font-size="10.5" ${font()}>${data.weekdayOrder[i]}</text>
</g>`;
  }).join('');
  const inner = `
<defs>
<linearGradient id="hourGrad" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#7a6cf0"/><stop offset="1" stop-color="#312e81"/></linearGradient>
<linearGradient id="peakGrad" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fbbf24"/><stop offset="1" stop-color="#92400e"/></linearGradient>
</defs>
${gridlines}
${barEls}
${xLabels}
${peakMark}
${chips}
<text x="30" y="526" fill="#94a3b8" font-size="11" font-weight="800" letter-spacing="1.3" ${font()}>COMMITS BY WEEKDAY</text>
${weekdayBars}
`;
  return baseCard(width, height, 'Commit Activity by Hour', `Commit author timestamps from default branches of every repository · Asia/Jakarta timezone · real data`, inner);
}

export function pinnedRepoCardSvg(repo, index = 0) {
  const width = 320;
  const height = 152;
  const color = colorFor(repo.language || 'Unknown', index);
  const name = repo.name.length > 26 ? repo.name.slice(0, 25) + '…' : repo.name;
  const description = repo.description
    ? (repo.description.length > 76 ? repo.description.slice(0, 73) + '…' : repo.description)
    : 'No description provided';
  const stars = compact(repo.stars);
  const forks = compact(repo.forks);
  const lang = repo.language || 'Unknown';
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="pinBg${index}" x1="0" y1="0" x2="0" y2="${height}"><stop stop-color="#151b2c"/><stop offset="1" stop-color="#0a0e1a"/></linearGradient>
<linearGradient id="pinTop${index}" x1="0" y1="0" x2="${width}" y2="0"><stop stop-color="${color}" stop-opacity="0.9"/><stop offset="1" stop-color="${color}" stop-opacity="0.15"/></linearGradient>
</defs>
<a href="${esc(repo.url)}">
<rect x="1.5" y="1.5" width="${width - 3}" height="${height - 3}" rx="16" fill="url(#pinBg${index})" stroke="${color}" stroke-opacity="0.45" stroke-width="1.5"/>
<rect x="1.5" y="1.5" width="${width - 3}" height="5" rx="2.5" fill="url(#pinTop${index})"/>
<circle cx="20" cy="34" r="6" fill="${color}"/>
<text x="34" y="38" fill="#ffffff" font-size="15.5" font-weight="800" ${font()}>${esc(name)}</text>
<text x="16" y="66" fill="#94a3b8" font-size="11" textLength="${width - 32}" lengthAdjust="spacingAndGlyphs" ${font()}>${esc(description)}</text>
<line x1="16" y1="92" x2="${width - 16}" y2="92" stroke="#ffffff" stroke-opacity="0.07"/>
<circle cx="20" cy="110" r="5" fill="${color}"/>
<text x="31" y="114" fill="#cbd5e1" font-size="11.5" font-weight="700" ${font()}>${esc(lang)}</text>
<text x="${width - 36}" y="114" text-anchor="end" fill="#e2e8f0" font-size="12" font-weight="800" ${font()}>★ ${stars}</text>
<text x="${width - 16}" y="114" text-anchor="end" fill="#cbd5e1" font-size="12" font-weight="700" ${font()}>⑂ ${forks}</text>
<text x="16" y="136" fill="#5b6478" font-size="9.5" textLength="${width - 32}" lengthAdjust="spacingAndGlyphs" ${font()}>${esc(repo.url.replace('https://github.com/', '@'))}</text>
</a>
</svg>
`;
}

export function calendarSvg(data) {
  const width = 1000;
  const height = 400;
  const padL = 42;
  const cell = 11;
  const gap = 3;
  const step = cell + gap;
  const sortedDays = [...data.days].sort((a, b) => a.date.localeCompare(b.date));
  const weeks = [];
  let current = [];
  for (const d of sortedDays) {
    const dow = new Date(d.date + 'T00:00:00Z').getUTCDay();
    current.push(d);
    if (dow === 6 || current.length === 7) {
      weeks.push(current);
      current = [];
    }
  }
  if (current.length) weeks.push(current);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthLabels = [];
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const first = week[0].date;
    const m = new Date(first + 'T00:00:00Z').getUTCMonth();
    if (m !== lastMonth) {
      monthLabels.push({ wi, m });
      lastMonth = m;
    }
  });
  const topY = 118;
  const monthEls = monthLabels.map((ml) => {
    const x = padL + ml.wi * step + cell / 2;
    return `<text x="${x.toFixed(1)}" y="${topY - 10}" text-anchor="middle" fill="#8b93a7" font-size="10.5" font-weight="700" ${font()}>${MONTHS[ml.m]}</text>`;
  }).join('');
  const dayLabels = ['Mon', 'Wed', 'Fri'];
  const dayLabelEls = dayLabels.map((name, i) => {
    const row = i * 2 + 1;
    return `<text x="${padL - 10}" y="${topY + row * step + 8}" text-anchor="end" fill="#5b6478" font-size="9.5" ${font()}>${name}</text>`;
  }).join('');
  const cellEls = weeks.map((week, wi) => week.map((d) => {
    const dow = new Date(d.date + 'T00:00:00Z').getUTCDay();
    const lvl = data.level ? data.level(d.count) : 0;
    const x = padL + wi * step;
    const y = topY + dow * step;
    const title = `${d.date}: ${d.count} contributions`;
    return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2.5" fill="${HEAT_COLORS[lvl]}"><title>${title}</title></rect>`;
  }).join('')).join('');
  const total = sortedDays.reduce((a, d) => a + d.count, 0);
  const active = sortedDays.filter((d) => d.count > 0).length;
  const chips = [
    statChip(30, 262, 'CONTRIBUTIONS (1Y)', thousandSep(total), '#667eea', 210),
    statChip(250, 262, 'ACTIVE DAYS', `${active} / ${sortedDays.length}`, '#16a34a', 180),
    statChip(440, 262, 'CURRENT STREAK', `${data.currentStreak} days`, '#f59e0b', 180),
    statChip(630, 262, 'LONGEST STREAK', `${data.longest} days`, '#db2777', 180),
    statChip(820, 262, 'AVG / DAY', (total / Math.max(1, sortedDays.length)).toFixed(1), '#06b6d4', 140)
  ].join('');
  const legendCells = HEAT_COLORS.map((c) => `<rect x="0" y="4" width="13" height="13" rx="3.5" fill="${c}"/>`).join('');
  const legend = `<g transform="translate(830 330)">
<text x="-60" y="15" fill="#94a3b8" font-size="11" ${font()}>Less</text>
${legendCells}
<text x="${HEAT_COLORS.length * 17}" y="15" fill="#94a3b8" font-size="11" ${font()}>More</text>
</g>`;
  const inner = `${monthEls}${dayLabelEls}${cellEls}${chips}${legend}
<text x="30" y="380" fill="#5b6478" font-size="10.5" ${font()}>FULL YEAR · ${sortedDays[0]?.date || ''} → ${sortedDays[sortedDays.length - 1]?.date || ''} · official GitHub contribution calendar</text>`;
  return baseCard(width, height, 'Full-Year Contribution Calendar', 'Every contribution over the last 365 days — a complete year, not just recent weeks · live from the GitHub contribution calendar', inner);
}

export function liveClockSvg(data) {
  const width = 640;
  const height = 260;
  const cx = 128;
  const cy = 128;
  const r = 96;
  const second = data.second;
  const minute = data.minute;
  const hour = data.hour % 12;
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const angle = (i * 6 - 90) * (Math.PI / 180);
    const major = i % 5 === 0;
    const r1 = major ? r - 14 : r - 6;
    const x1 = cx + r1 * Math.cos(angle);
    const y1 = cy + r1 * Math.sin(angle);
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${major ? '#cbd5e1' : '#3b4254'}" stroke-width="${major ? 2.5 : 1}" stroke-linecap="round"/>`;
  }).join('');
  const numbers = Array.from({ length: 12 }, (_, i) => {
    const num = i === 0 ? 12 : i;
    const angle = (i * 30 - 90) * (Math.PI / 180);
    const x = cx + (r - 26) * Math.cos(angle);
    const y = cy + (r - 26) * Math.sin(angle);
    return `<text x="${x.toFixed(2)}" y="${(y + 5).toFixed(2)}" text-anchor="middle" fill="#94a3b8" font-size="15" font-weight="800" ${font()}>${num}</text>`;
  }).join('');
  const secondAngle = second * 6;
  const minuteAngle = minute * 6 + second * 0.1;
  const hourAngle = hour * 30 + minute * 0.5;
  const hand = (angle, len, stroke, color, dur) => `<g transform="rotate(${angle} ${cx} ${cy})">
<line x1="${cx}" y1="${cy + 20}" x2="${cx}" y2="${cy - len}" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"/>
<animateTransform attributeName="transform" type="rotate" from="${angle} ${cx} ${cy}" to="${angle + 360} ${cx} ${cy}" dur="${dur}s" repeatCount="indefinite"/>
</g>`;
  const timeText = `${String(data.hour).padStart(2, '0')}:${String(data.minute).padStart(2, '0')}:${String(data.second).padStart(2, '0')}`;
  const inner = `
<g>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="#0a0e1a" stroke="url(#clockRing)" stroke-width="3"/>
${ticks}
${numbers}
${hand(hourAngle, 44, 6, '#e2e8f0', 43200)}
${hand(minuteAngle, 68, 4, '#c7d2fe', 3600)}
${hand(secondAngle, 80, 2, '#f59e0b', 60)}
<circle cx="${cx}" cy="${cy}" r="6" fill="#f59e0b"/>
<circle cx="${cx}" cy="${cy}" r="2.5" fill="#0b1020"/>
</g>
<g transform="translate(250 70)">
<rect width="360" height="70" rx="16" fill="#0d1322" stroke="#667eea" stroke-opacity="0.4" stroke-width="1.2"/>
<text x="180" y="36" text-anchor="middle" fill="#ffffff" font-size="40" font-weight="900" ${font()}>${timeText}</text>
<text x="180" y="58" text-anchor="middle" fill="#94a3b8" font-size="12" font-weight="700" letter-spacing="2" ${font()}>WIB · ASIA/JAKARTA · UTC+7</text>
</g>
<g transform="translate(250 158)">
<circle cx="14" cy="10" r="6" fill="#22c55e">
<animate attributeName="opacity" values="1;0.25;1" dur="1.6s" repeatCount="indefinite"/>
</circle>
<text x="30" y="15" fill="#e2e8f0" font-size="17" font-weight="800" ${font()}>${data.dateText}</text>
<text x="0" y="38" fill="#64748b" font-size="12" ${font()}>${data.dayName} · refreshed by GitHub Actions every 30 minutes</text>
</g>
`;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="clockBg" x1="0" y1="0" x2="${width}" y2="${height}"><stop stop-color="#0f172a"/><stop offset="1" stop-color="#312e81"/></linearGradient>
<linearGradient id="clockRing" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>
</defs>
<rect width="${width}" height="${height}" rx="24" fill="url(#clockBg)"/>
<circle cx="${width - 60}" cy="40" r="110" fill="#667eea" opacity="0.12"/>
${inner}
<text x="${width / 2}" y="238" text-anchor="middle" fill="#5b6478" font-size="10.5" ${font()}>LIVE · generated ${data.generatedAt} · auto-updates every 30 min</text>
</svg>
`;
}

export function codingAgeSvg(data) {
  const width = 900;
  const height = 262;
  const years = Math.max(0, data.years || 0);
  const inner = `
<g transform="translate(30 96)">
<rect width="320" height="132" rx="20" fill="#0d1322" stroke="url(#ageAccent)" stroke-width="1.5"/>
<text x="160" y="66" text-anchor="middle" fill="url(#ageNum)" font-size="72" font-weight="900" ${font()}>${years}</text>
<text x="160" y="100" text-anchor="middle" fill="#94a3b8" font-size="13" font-weight="800" letter-spacing="2.2" ${font()}>YEARS CODING</text>
<text x="160" y="120" text-anchor="middle" fill="#5b6478" font-size="10.5" ${font()}>on GitHub · ${esc(data.label)}</text>
</g>
${[
  ['MONTHS', `${data.months} mo`, '#667eea'],
  ['DAYS', thousandSep(data.totalDays), '#16a34a'],
  ['PUBLIC REPOS', data.repos, '#f59e0b'],
  ['TOTAL COMMITS', compact(data.commits), '#2563eb']
].map(([label, value, color], i) => `<g transform="translate(${370 + (i % 2) * 250} ${96 + Math.floor(i / 2) * 70})">
<rect width="230" height="58" rx="14" fill="#0d1322" stroke="${color}" stroke-opacity="0.4" stroke-width="1.2"/>
<text x="14" y="22" fill="#8b93a7" font-size="10.5" font-weight="800" letter-spacing="1.2" ${font()}>${label}</text>
<text x="14" y="46" fill="#ffffff" font-size="20" font-weight="800" ${font()}>${esc(value)}</text>
</g>`).join('')}
<text x="40" y="246" fill="#5b6478" font-size="11" ${font()}>Account created ${esc(data.createdAtText)} — every repo and commit counts toward this age.</text>
`;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="ageBg" x1="0" y1="0" x2="${width}" y2="${height}"><stop stop-color="#0f172a"/><stop offset="1" stop-color="#312e81"/></linearGradient>
<linearGradient id="ageAccent" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#667eea"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>
<linearGradient id="ageNum" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#a78bfa"/></linearGradient>
</defs>
<rect width="${width}" height="${height}" rx="26" fill="url(#ageBg)"/>
<circle cx="${width - 60}" cy="40" r="130" fill="#764ba2" opacity="0.12"/>
<text x="30" y="44" fill="#ffffff" font-size="25" font-weight="900" ${font()}>Coding Age</text>
<text x="30" y="66" fill="#94a3b8" font-size="12.5" ${font()}>Years of open-source journey on GitHub, measured from account creation</text>
<rect x="30" y="80" width="${width - 60}" height="3.5" rx="1.75" fill="url(#ageAccent)"/>
${inner}
</svg>
`;
}

export function codingRhythmSvg(data) {
  const width = 1000;
  const height = 470;
  const cx = 240;
  const cy = 250;
  const maxR = 165;
  const hourCounts = data.hourCounts;
  const maxCount = Math.max(...hourCounts, 1);
  const rings = [0.25, 0.5, 0.75, 1].map((f) => `<circle cx="${cx}" cy="${cy}" r="${maxR * f}" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="1"/>`).join('');
  const wedges = hourCounts.map((count, h) => {
    const r = Math.max(5, (count / maxCount) * maxR);
    const a0 = ((h * 15 - 7.5 - 90) * Math.PI) / 180;
    const a1 = ((h * 15 + 7.5 - 90) * Math.PI) / 180;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const isPeak = h === data.peakHour;
    const color = isPeak ? '#fbbf24' : colorFor('Python', h);
    return `<path d="M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z" fill="${color}" fill-opacity="${isPeak ? 1 : 0.72}" stroke="#0b1020" stroke-width="0.8"/>`;
  }).join('');
  const hourLabels = Array.from({ length: 8 }, (_, i) => {
    const h = i * 3;
    const angle = ((h * 15 - 90) * Math.PI) / 180;
    const x = cx + (maxR + 24) * Math.cos(angle);
    const y = cy + (maxR + 24) * Math.sin(angle);
    return `<text x="${x.toFixed(2)}" y="${(y + 4).toFixed(2)}" text-anchor="middle" fill="#5b6478" font-size="10.5" font-weight="700" ${font()}>${h}</text>`;
  }).join('');
  const rhythm = data.rhythm;
  const heroColor = rhythm.label === 'Night Owl' ? '#a78bfa' : rhythm.label === 'Early Bird' ? '#fbbf24' : rhythm.label === 'Day Coder' ? '#16a34a' : '#f97316';
  const bucketBars = rhythm.buckets.map((b) => {
    const bc = b.name === 'Night Owl' ? '#a78bfa' : b.name === 'Early Bird' ? '#fbbf24' : b.name === 'Day Coder' ? '#16a34a' : '#f97316';
    return `<g transform="translate(0 ${(rhythm.buckets.length - 1 - rhythm.buckets.indexOf(b)) * 26})">
<text x="0" y="14" fill="#cbd5e1" font-size="12" font-weight="700" ${font()}>${b.emoji} ${b.name}</text>
<rect x="150" y="2" width="250" height="13" rx="6.5" fill="#1e293b"/>
<rect x="150" y="2" width="${Math.max(3, (b.pct / 100) * 250)}" height="13" rx="6.5" fill="${bc}"/>
<text x="412" y="13" fill="#e2e8f0" font-size="12" font-weight="800" text-anchor="end" ${font()}>${b.pct.toFixed(1)}%</text>
</g>`;
  }).join('');
  const chips = [
    statChip(30, 396, 'PEAK HOUR', `${data.peakHour}:00`, '#f59e0b', 150),
    statChip(190, 396, 'SAMPLED', thousandSep(data.sampled), '#2563eb', 150),
    statChip(350, 396, 'MEAN (CIRCULAR)', `${data.circularMean.toFixed(1)}:00`, '#667eea', 170),
    statChip(530, 396, 'ACTIVE HOURS', `${data.activeHours}/24`, '#16a34a', 150),
    statChip(690, 396, 'STD DEV', `${data.circularStd.toFixed(1)}h`, '#db2777', 130),
    statChip(830, 396, 'DOMINANT', rhythm.label, heroColor, 140)
  ].join('');
  const inner = `
${rings}
${wedges}
${hourLabels}
<g transform="translate(560 120)">
<text x="0" y="20" fill="#ffffff" font-size="44" ${font()}>${rhythm.emoji}</text>
<text x="64" y="20" fill="${heroColor}" font-size="26" font-weight="900" ${font()}>${esc(rhythm.label.toUpperCase())}</text>
<text x="64" y="44" fill="#cbd5e1" font-size="14" font-weight="700" ${font()}>${(rhythm.share * 100).toFixed(1)}% of all commits</text>
<text x="0" y="70" fill="#5b6478" font-size="11.5" ${font()}>classified from ${thousandSep(data.sampled)} real commit timestamps (Asia/Jakarta)</text>
</g>
<g transform="translate(560 200)">
${bucketBars}
</g>
${chips}
<text x="240" y="452" text-anchor="middle" fill="#5b6478" font-size="10.5" ${font()}>24-hour commit distribution · ring radius ∝ commit count · gold wedge = peak hour</text>
`;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="rhythmBg" x1="0" y1="0" x2="${width}" y2="${height}"><stop stop-color="#0f172a"/><stop offset="1" stop-color="#312e81"/></linearGradient>
<linearGradient id="rhythmBar" x1="0" y1="0" x2="${width}" y2="0"><stop stop-color="#667eea"/><stop offset="1" stop-color="#764ba2"/></linearGradient>
</defs>
<rect width="${width}" height="${height}" rx="26" fill="url(#rhythmBg)"/>
<circle cx="${width - 80}" cy="40" r="130" fill="#667eea" opacity="0.12"/>
<text x="30" y="44" fill="#ffffff" font-size="25" font-weight="900" ${font()}>Coding Rhythm</text>
<text x="30" y="66" fill="#94a3b8" font-size="12.5" ${font()}>Night owl or early bird? Real commit timestamps decide — circular statistics, 24-hour polar chart</text>
<rect x="30" y="80" width="${width - 60}" height="3.5" rx="1.75" fill="url(#rhythmBar)"/>
${inner}
</svg>
`;
}

function wrapText(text, maxChars) {
  const words = String(text).split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars && current) {
      lines.push(current.trim());
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines;
}

export function motivationQuoteSvg(quote, index = 0, total = 0) {
  const width = 1000;
  const height = 320;
  const accents = ['#667eea', '#f59e0b', '#16a34a', '#db2777', '#06b6d4', '#a855f7'];
  const accent = accents[index % accents.length];
  const origLines = wrapText(quote.quote, 92);
  const idLines = wrapText(quote.id, 110);
  const origSize = origLines.length > 2 ? 19 : origLines.length === 2 ? 21 : 23;
  const idSize = idLines.length > 2 ? 13 : idLines.length === 2 ? 14 : 15;
  const origStart = 118;
  const idStart = origStart + origLines.length * (origSize + 7) + 34;
  const orig = origLines.map((line, i) => `<text x="70" y="${origStart + i * (origSize + 7)}" fill="#ffffff" font-size="${origSize}" font-style="italic" font-weight="800" ${font()}>${esc(line)}</text>`).join('');
  const idText = idLines.map((line, i) => `<text x="70" y="${idStart + i * (idSize + 6)}" fill="#cbd5e1" font-size="${idSize}" ${font()}>${esc(line)}</text>`).join('');
  const authorY = Math.max(idStart + idLines.length * (idSize + 6) + 26, 262);
  const inner = `
<defs>
<linearGradient id="motBg" x1="0" y1="0" x2="${width}" y2="${height}"><stop stop-color="#0f172a"/><stop offset="1" stop-color="#312e81"/></linearGradient>
<linearGradient id="motAccent" x1="0" y1="0" x2="${width}" y2="0"><stop stop-color="${accent}" stop-opacity="0"/><stop offset="0.15" stop-color="${accent}"/><stop offset="0.85" stop-color="${accent}"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></linearGradient>
</defs>
<rect width="${width}" height="${height}" rx="26" fill="url(#motBg)"/>
<rect x="30" y="84" width="${width - 60}" height="4" rx="2" fill="url(#motAccent)"/>
<text x="40" y="152" fill="${accent}" font-size="110" font-weight="900" ${font()}>“</text>
<circle cx="${width - 70}" cy="56" r="34" fill="${accent}" opacity="0.14"/>
<text x="${width - 70}" y="66" text-anchor="middle" fill="${accent}" font-size="20" font-weight="900" ${font()}>#${index + 1}</text>
${orig}
${idText}
<line x1="70" y1="${authorY - 16}" x2="${width - 70}" y2="${authorY - 16}" stroke="#ffffff" stroke-opacity="0.08"/>
<text x="70" y="${authorY + 4}" fill="${accent}" font-size="17" font-weight="900" ${font()}>— ${esc(quote.author)}</text>
<text x="70" y="${authorY + 24}" fill="#64748b" font-size="11.5" ${font()}>${esc(quote.role)} · original in English · translated to Bahasa Indonesia</text>
<text x="${width - 70}" y="${authorY + 4}" text-anchor="end" fill="#5b6478" font-size="11" ${font()}>random · from ${total} real developer quotes</text>
`;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
${inner}
</svg>`;
}

export function monthlySummarySvg(data) {
  const width = 1000;
  const paragraphs = String(data.body).split('\n\n').filter(Boolean);
  const wrapped = paragraphs.map((p) => wrapText(p, 118));
  const lineH = 21;
  const paraGap = 14;
  let y = 122;
  const paraEls = wrapped.map((lines) => {
    const out = lines.map((line) => {
      const yy = y;
      y += lineH;
      return `<text x="40" y="${yy}" fill="#cbd5e1" font-size="15" ${font()}>${esc(line)}</text>`;
    }).join('');
    y += paraGap;
    return out;
  }).join('');
  const chipsY = Math.max(y + 22, 300);
  const chips = [
    statChip(30, chipsY, 'COMMITS (30D)', thousandSep(data.stats.total), '#2563eb', 180),
    statChip(220, chipsY, 'ACTIVE DAYS', `${data.stats.activeDays}/30`, '#16a34a', 160),
    statChip(390, chipsY, 'PEAK HOUR', `${data.stats.peakHour}:00 WIB`, '#f59e0b', 150),
    statChip(550, chipsY, 'BUSIEST DAY', data.stats.busiestWeekday, '#db2777', 150),
    statChip(710, chipsY, 'PRS OPENED', thousandSep(data.prs), '#06b6d4', 130),
    statChip(850, chipsY, 'ISSUES', thousandSep(data.issues), '#a855f7', 120)
  ].join('');
  const height = chipsY + 84;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="msBg" x1="0" y1="0" x2="${width}" y2="${height}"><stop stop-color="#0f172a"/><stop offset="1" stop-color="#312e81"/></linearGradient>
<linearGradient id="msAccent" x1="0" y1="0" x2="${width}" y2="0"><stop stop-color="#667eea"/><stop offset="1" stop-color="#764ba2"/></linearGradient>
</defs>
<rect width="${width}" height="${height}" rx="26" fill="url(#msBg)"/>
<circle cx="${width - 60}" cy="40" r="130" fill="#667eea" opacity="0.12"/>
<text x="30" y="44" fill="#ffffff" font-size="25" font-weight="900" ${font()}>Monthly AI Summary — ${esc(data.monthName)}</text>
<text x="30" y="66" fill="#94a3b8" font-size="12.5" ${font()}>${esc(data.rangeStart)} – ${esc(data.rangeEnd)} · auto-narrated from real commit data by our own AI engine</text>
<rect x="30" y="80" width="${width - 60}" height="3.5" rx="1.75" fill="url(#msAccent)"/>
${paraEls}
${chips}
<text x="40" y="${height - 18}" fill="#5b6478" font-size="10.5" ${font()}>Narrative is generated from real commit timestamps, PRs and issues — regenerated on the 1st of every month</text>
</svg>
`;
}

export function manifestLine(data) {
  const lines = [
    `repos=${data.publicRepos}`,
    `stars=${data.totalStars}`,
    `forks=${data.totalForks}`,
    `followers=${data.followers}`,
    `sourceLines=${data.codeTotals ? data.codeTotals.totals.codeLines : 0}`,
    `codeChars=${data.codeTotals ? data.codeTotals.totals.chars : 0}`,
    `languages=${data.languageDistribution ? data.languageDistribution.languagesCount : 0}`,
    `entropy=${data.languageDistribution ? data.languageDistribution.entropy.toFixed(2) : 0}`,
    `generatedAt=${data.generatedAt}`
  ];
  return `::group::PROFILE_METRICS_MANIFEST\n${lines.join('\n')}\n::endgroup::`;
}
