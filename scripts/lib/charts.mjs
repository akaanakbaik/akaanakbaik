import { esc, baseCard, colorFor, PALETTE, thousandSep, compact, humanBytes, clamp } from './engine.mjs';

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
  const top = data.byBytes.slice(0, 14);
  const total = data.totalBytes || 1;
  const width = 900;
  const height = 470;
  const padL = 92;
  const padR = 74;
  const padT = 96;
  const padB = 96;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const maxValue = Math.max(...top.map((x) => x.bytes), 1);
  const step = plotW / top.length;
  const barW = step * 0.62;
  let cumulative = 0;
  const bars = top.map((x, i) => {
    const barH = Math.max(2, (x.bytes / maxValue) * plotH);
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
<text x="${padL - 10}" y="${gy + 4}" text-anchor="end" fill="#64748b" font-size="10.5" ${font()}>${label}</text>`;
  }).join('');
  const barEls = bars.map((b) => {
    const color = colorFor(b.x.name, b.i);
    return `<g>
<rect x="${b.bx.toFixed(2)}" y="${b.by.toFixed(2)}" width="${barW.toFixed(2)}" height="${b.barH.toFixed(2)}" rx="4" fill="url(#grad${b.i})" opacity="0.95">
</rect>
<text x="${(b.bx + barW / 2).toFixed(2)}" y="${(b.by - 8).toFixed(2)}" text-anchor="middle" fill="#cbd5e1" font-size="10.5" font-weight="700" ${font()}>${compact(b.x.bytes)}</text>
</g>`;
  }).join('');
  const gradDefs = top.map((b, i) => {
    const color = colorFor(b.name, i);
    return `<linearGradient id="grad${i}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity="0.55"/></linearGradient>`;
  }).join('');
  const poly = bars.map((b) => `${b.cxp.toFixed(2)},${b.cyp.toFixed(2)}`).join(' ');
  const p80y = padT + plotH - 0.8 * plotH;
  const cumulativeLine = `
<polyline points="${poly}" fill="none" stroke="#a78bfa" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
${bars.map((b) => `<circle cx="${b.cxp.toFixed(2)}" cy="${b.cyp.toFixed(2)}" r="4" fill="#a78bfa" stroke="#0b1020" stroke-width="2"/>`).join('')}
<line x1="${padL}" y1="${p80y}" x2="${width - padR}" y2="${p80y}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="7 5"/>
<text x="${width - padR - 6}" y="${p80y - 6}" text-anchor="end" fill="#f59e0b" font-size="11" font-weight="800" ${font()}>Pareto 80%</text>`;
  const xLabels = bars.map((b) => {
    const cxv = padL + (b.i + 0.5) * step;
    const name = b.x.name.length > 11 ? b.x.name.slice(0, 10) + '…' : b.x.name;
    return `<g transform="translate(${cxv} ${padT + plotH + 6}) rotate(-32)"><text x="0" y="0" fill="#cbd5e1" font-size="11" font-weight="600" text-anchor="end" ${font()}>${esc(name)}</text></g>`;
  }).join('');
  const pctAxis = [0, 25, 50, 75, 100].map((p) => {
    const gy = padT + plotH - (p / 100) * plotH;
    return `<text x="${width - padR + 14}" y="${gy + 4}" fill="#a78bfa" font-size="10.5" ${font()}>${p}%</text>`;
  }).join('');
  const topChips = [
    statChip(30, 406, 'TOP SHARE', `${data.topShare.toFixed(1)}%`, '#667eea', 150),
    statChip(190, 406, 'GEOMEAN', compact(data.geomeanBytes), '#764ba2', 140),
    statChip(340, 406, 'MEDIAN', compact(data.medianBytes), '#16a34a', 140),
    statChip(490, 406, 'C.V.', data.cv.toFixed(2), '#f59e0b', 120),
    statChip(620, 406, 'TOP 14', `${data.byBytes.slice(0, 14).reduce((a, x) => a + x.bytes, 0) / total * 100}%`, '#06b6d4', 130),
    statChip(760, 406, 'TOTAL', compact(total), '#db2777', 120)
  ].join('');
  const inner = `
<defs>${gradDefs}</defs>
${gridlines}
${barEls}
${cumulativeLine}
${xLabels}
${pctAxis}
${topChips}
`;
  return baseCard(width, height, 'Language Bytes — Pareto Analysis', `Top 14 languages by bytes, cumulative distribution line (right axis) and 80% Pareto threshold · real GitHub byte counts from every repository`, inner);
}

export function langRadarSvg(data) {
  const top = data.byRepo.slice(0, 8);
  const cx = 320;
  const cy = 265;
  const radius = 150;
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
    const [x1, y1] = axisPoint(i, radius + 26);
    return `<line x1="${cx}" y1="${cy}" x2="${x0.toFixed(2)}" y2="${y0.toFixed(2)}" stroke="#ffffff" stroke-opacity="0.12" stroke-width="1"/>
<text x="${x1.toFixed(2)}" y="${y1.toFixed(2)}" text-anchor="middle" fill="#cbd5e1" font-size="11.5" font-weight="700" ${font()}>${esc(x.name)}</text>`;
  }).join('');
  const dataPts = top.map((x, i) => {
    const [px, py] = axisPoint(i, radius * norm[i]);
    return `${px.toFixed(2)},${py.toFixed(2)}`;
  });
  const polygon = `<polygon points="${dataPts.join(' ')}" fill="#667eea" fill-opacity="0.32" stroke="#a78bfa" stroke-width="2.5" stroke-linejoin="round"/>`;
  const dots = top.map((x, i) => {
    const [px, py] = axisPoint(i, radius * norm[i]);
    return `<circle cx="${px.toFixed(2)}" cy="${py.toFixed(2)}" r="4.5" fill="#a78bfa" stroke="#0b1020" stroke-width="2"/>`;
  }).join('');
  const list = top.map((x, i) => {
    const val = Math.round(norm[i] * 100);
    return `<g transform="translate(520 ${112 + i * 38})">
<text x="0" y="15" fill="#e2e8f0" font-size="13.5" font-weight="700" ${font()}>${esc(x.name)}</text>
<text x="180" y="15" text-anchor="end" fill="#cbd5e1" font-size="12.5" ${font()}>${x.repos} repos</text>
<rect x="0" y="24" width="250" height="7" rx="3.5" fill="#1e293b"/>
<rect x="0" y="24" width="${(val / 100) * 250}" height="7" rx="3.5" fill="${colorFor(x.name, i)}"/>
</g>`;
  }).join('');
  const censusTop = data.byRepo.slice(0, 16);
  const censusRest = data.byRepo.length - censusTop.length;
  const census = censusTop.map((x) => `${x.name} (${x.repos})`).join(' · ');
  const inner = `
${rings}
${axes}
${polygon}
${dots}
${list}
<text x="520" y="${112 + top.length * 38 + 26}" fill="#94a3b8" font-size="11.5" font-weight="700" letter-spacing="1" ${font()}>LOG-NORMALIZED ADOPTION</text>
<text x="30" y="512" fill="#64748b" font-size="10.5" ${font()}>LANGUAGE CENSUS (${data.repoCount} REPOS): ${esc(census)}${censusRest ? ` · +${censusRest} more` : ''}</text>
`;
  return baseCard(900, 540, 'Language Adoption Radar', 'Top 8 languages by repository count, log-normalized radar — all languages supported, full census below and in stats', inner);
}

export function codeTotalsBadgeSvg({ totalLines, totalChars, repoCount, files, generatedAt, perLangTop }) {
  const linesStr = thousandSep(totalLines);
  const charsStr = thousandSep(totalChars);
  const width = 560;
  const height = 118;
  const gap = 18;
  const padX = 34;
  const blockW = (width - padX * 2 - gap) / 2;
  const baseFont = 52;
  const digitsL = linesStr.length;
  const digitsC = charsStr.length;
  const fontL = clamp(Math.floor(Math.min(baseFont, (blockW - 18) / (digitsL * 0.58))), 22, baseFont);
  const fontC = clamp(Math.floor(Math.min(baseFont - 6, (blockW - 18) / (digitsC * 0.58))), 20, baseFont - 6);
  const labelL = 'TOTAL LINES OF CODE';
  const labelC = 'TOTAL CHARACTERS';
  const cap = `SCANNED ${repoCount} REPOSITORIES · ${compact(files)} FILES · ${generatedAt}`;
  const capChars = cap.length;
  const capFont = clamp(Math.floor((width - 40) / (capChars * 0.62)), 8, 10);
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="metal" x1="0" y1="0" x2="0" y2="${height}">
<stop stop-color="#242b3d"/><stop offset="0.42" stop-color="#141926"/><stop offset="0.6" stop-color="#0d1220"/><stop offset="1" stop-color="#090d18"/>
</linearGradient>
<linearGradient id="bevel" x1="0" y1="0" x2="0" y2="${height}">
<stop stop-color="#3a4358" stop-opacity="0.9"/><stop offset="0.18" stop-color="#232a3c" stop-opacity="0.7"/><stop offset="1" stop-color="#05070d" stop-opacity="0.95"/>
</linearGradient>
<linearGradient id="gloss" x1="0" y1="0" x2="0" y2="${height * 0.55}">
<stop stop-color="#ffffff" stop-opacity="0.09"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</linearGradient>
<radialGradient id="rivet" cx="0.5" cy="0.35" r="0.75">
<stop stop-color="#8b93a7"/><stop offset="0.45" stop-color="#3b4254"/><stop offset="1" stop-color="#0d101a"/>
</radialGradient>
<linearGradient id="numGradL" x1="0" y1="0" x2="0" y2="1">
<stop stop-color="#ffffff"/><stop offset="1" stop-color="#c7cdf5"/>
</linearGradient>
<linearGradient id="numGradC" x1="0" y1="0" x2="0" y2="1">
<stop stop-color="#ffe9a8"/><stop offset="1" stop-color="#c9920f"/>
</linearGradient>
<linearGradient id="inset" x1="0" y1="0" x2="0" y2="1">
<stop stop-color="#000000" stop-opacity="0.55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.05"/>
</linearGradient>
<filter id="drop" x="-20%" y="-40%" width="140%" height="200%">
<feDropShadow dx="0" dy="2.2" stdDeviation="2.4" flood-color="#000000" flood-opacity="0.85"/>
</filter>
<filter id="glowL" x="-30%" y="-60%" width="160%" height="260%">
<feGaussianBlur stdDeviation="3.2" result="b"/><feFlood flood-color="#667eea" flood-opacity="0.55"/><feComposite in2="b" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>
<filter id="glowC" x="-30%" y="-60%" width="160%" height="260%">
<feGaussianBlur stdDeviation="3.2" result="b"/><feFlood flood-color="#f59e0b" flood-opacity="0.5"/><feComposite in2="b" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>
</defs>
<rect x="2.5" y="2.5" width="${width - 5}" height="${height - 5}" rx="20" fill="url(#metal)" stroke="url(#bevel)" stroke-width="3"/>
<rect x="5" y="5" width="${width - 10}" height="${height - 10}" rx="17" fill="url(#gloss)"/>
<circle cx="18" cy="16" r="5" fill="url(#rivet)"/><circle cx="${width - 18}" cy="16" r="5" fill="url(#rivet)"/>
<circle cx="18" cy="${height - 16}" r="5" fill="url(#rivet)"/><circle cx="${width - 18}" cy="${height - 16}" r="5" fill="url(#rivet)"/>
<g transform="translate(${padX} 26)">
<rect width="${blockW}" height="56" rx="12" fill="#0a0e1a" stroke="#ffffff" stroke-opacity="0.07" stroke-width="1"/>
<rect width="${blockW}" height="56" rx="12" fill="url(#inset)" opacity="0.5"/>
<text x="${blockW / 2}" y="15" text-anchor="middle" fill="#8b93a7" font-size="9.5" font-weight="800" letter-spacing="1.6" ${font()}>${labelL}</text>
<text x="${blockW / 2}" y="45" text-anchor="middle" fill="url(#numGradL)" font-size="${fontL}" font-weight="900" filter="url(#glowL)" letter-spacing="0.5" ${font()}>${linesStr}</text>
</g>
<g transform="translate(${padX + blockW + gap} 26)">
<rect width="${blockW}" height="56" rx="12" fill="#0a0e1a" stroke="#ffffff" stroke-opacity="0.07" stroke-width="1"/>
<rect width="${blockW}" height="56" rx="12" fill="url(#inset)" opacity="0.5"/>
<text x="${blockW / 2}" y="15" text-anchor="middle" fill="#8b93a7" font-size="9.5" font-weight="800" letter-spacing="1.6" ${font()}>${labelC}</text>
<text x="${blockW / 2}" y="45" text-anchor="middle" fill="url(#numGradC)" font-size="${fontC}" font-weight="900" filter="url(#glowC)" letter-spacing="0.5" ${font()}>${charsStr}</text>
</g>
<line x1="22" y1="96" x2="${width - 22}" y2="96" stroke="#ffffff" stroke-opacity="0.08"/>
<text x="${width / 2}" y="${height - 10}" text-anchor="middle" fill="#5b6478" font-size="${capFont}" font-weight="700" letter-spacing="1.1" ${font()}>${esc(cap.toUpperCase())}</text>
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
    ['ACCOUNT AGE', data.accountAge, '#22c55e'],
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
  const inner = repos.slice(0, 3).map((repo, i) => {
    const y = 112 + i * 72;
    const color = PALETTE[i];
    return `<a href="${esc(repo.url)}"><g transform="translate(30 ${y})">
<rect width="840" height="56" rx="18" fill="#0d1322" stroke="${color}" stroke-width="1.4"/>
<text x="22" y="35" fill="${color}" font-size="19" font-weight="900" ${font()}>#${i + 1}</text>
<text x="78" y="35" fill="#ffffff" font-size="19" font-weight="800" ${font()}>${esc(repo.name)}</text>
<text x="540" y="35" fill="#cbd5e1" font-size="14" ${font()}>★ ${repo.stars} · ⑂ ${repo.forks} · ${esc(repo.language)}</text>
</g></a>`;
  }).join('');
  return baseCard(900, 350, 'Top 3 Repositories', 'Auto-ranked by stars, forks, and recent activity', inner);
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

export function manifestLine(data) {
  const lines = [
    `repos=${data.publicRepos}`,
    `stars=${data.totalStars}`,
    `forks=${data.totalForks}`,
    `followers=${data.followers}`,
    `codeLines=${data.codeTotals ? data.codeTotals.totals.lines : 0}`,
    `codeChars=${data.codeTotals ? data.codeTotals.totals.chars : 0}`,
    `languages=${data.languageDistribution ? data.languageDistribution.languagesCount : 0}`,
    `entropy=${data.languageDistribution ? data.languageDistribution.entropy.toFixed(2) : 0}`,
    `generatedAt=${data.generatedAt}`
  ];
  return `::group::PROFILE_METRICS_MANIFEST\n${lines.join('\n')}\n::endgroup::`;
}
