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
  const top = data.byBytes.slice(0, 14);
  const restCount = Math.max(0, data.byBytes.length - top.length);
  const restBytes = data.byBytes.slice(14).reduce((a, x) => a + x.bytes, 0);
  const total = data.totalBytes || 1;
  const width = 1000;
  const height = 560;
  const padL = 104;
  const padR = 86;
  const padT = 108;
  const padB = 120;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const maxValue = Math.max(...top.map((x) => x.bytes), 1);
  const step = plotW / top.length;
  const barW = step * 0.6;
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
<text x="${padL - 12}" y="${gy + 4}" text-anchor="end" fill="#64748b" font-size="11" ${font()}>${label}</text>`;
  }).join('');
  const barEls = bars.map((b) => {
    const pct = ((b.x.bytes / total) * 100).toFixed(1);
    return `<g>
<rect x="${b.bx.toFixed(2)}" y="${b.by.toFixed(2)}" width="${barW.toFixed(2)}" height="${b.barH.toFixed(2)}" rx="5" fill="url(#grad${b.i})" opacity="0.96"/>
<rect x="${b.bx.toFixed(2)}" y="${b.by.toFixed(2)}" width="${barW.toFixed(2)}" height="3" rx="1.5" fill="#ffffff" fill-opacity="0.25"/>
<text x="${(b.bx + barW / 2).toFixed(2)}" y="${(b.by - 9).toFixed(2)}" text-anchor="middle" fill="#e2e8f0" font-size="11.5" font-weight="800" ${font()}>${compact(b.x.bytes)}</text>
<text x="${(b.bx + barW / 2).toFixed(2)}" y="${(b.by + 8).toFixed(2)}" text-anchor="middle" fill="#64748b" font-size="9.5" font-weight="600" ${font()}>${pct}%</text>
</g>`;
  }).join('');
  const gradDefs = top.map((b, i) => {
    const color = colorFor(b.name, i);
    return `<linearGradient id="grad${i}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity="0.5"/></linearGradient>`;
  }).join('');
  const poly = bars.map((b) => `${b.cxp.toFixed(2)},${b.cyp.toFixed(2)}`).join(' ');
  const p80y = padT + plotH - 0.8 * plotH;
  const cumulativeLine = `
<polyline points="${poly}" fill="none" stroke="#a78bfa" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
${bars.map((b) => `<circle cx="${b.cxp.toFixed(2)}" cy="${b.cyp.toFixed(2)}" r="4.5" fill="#a78bfa" stroke="#0b1020" stroke-width="2.5"/><text x="${b.cxp.toFixed(2)}" y="${(b.cyp - 9).toFixed(2)}" text-anchor="middle" fill="#a78bfa" font-size="9.5" font-weight="800" ${font()}>${Math.round(b.cumulative * 100)}%</text>`).join('')}
<line x1="${padL}" y1="${p80y}" x2="${width - padR}" y2="${p80y}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="8 6"/>
<text x="${width - padR - 6}" y="${p80y - 7}" text-anchor="end" fill="#fbbf24" font-size="11.5" font-weight="800" ${font()}>Pareto 80%</text>`;
  const xLabels = bars.map((b) => {
    const cxv = padL + (b.i + 0.5) * step;
    const name = b.x.name.length > 12 ? b.x.name.slice(0, 11) + '…' : b.x.name;
    return `<g transform="translate(${cxv} ${padT + plotH + 10}) rotate(-30)"><text x="0" y="0" fill="#cbd5e1" font-size="11.5" font-weight="600" text-anchor="end" ${font()}>${esc(name)}</text></g>`;
  }).join('');
  const pctAxis = [0, 25, 50, 75, 100].map((p) => {
    const gy = padT + plotH - (p / 100) * plotH;
    return `<text x="${width - padR + 16}" y="${gy + 4}" fill="#a78bfa" font-size="11" ${font()}>${p}%</text>`;
  }).join('');
  const restNote = restCount > 0
    ? `<text x="${padL}" y="${padT + plotH + 44}" fill="#64748b" font-size="11" ${font()}>${restCount} more languages not shown · ${compact(restBytes)} bytes · ${((restBytes / total) * 100).toFixed(1)}% of total — full census in the radar chart</text>`
    : '';
  const topChips = [
    statChip(30, 470, 'TOP SHARE', `${data.topShare.toFixed(1)}%`, '#667eea', 150),
    statChip(190, 470, 'GEOMEAN', compact(data.geomeanBytes), '#764ba2', 140),
    statChip(340, 470, 'MEDIAN', compact(data.medianBytes), '#16a34a', 140),
    statChip(490, 470, 'C.V.', data.cv.toFixed(2), '#f59e0b', 120),
    statChip(620, 470, 'TOP 14', `${(bars.reduce((a, b) => a + b.x.bytes, 0) / total) * 100}%`, '#06b6d4', 130),
    statChip(760, 470, 'TOTAL', compact(total), '#db2777', 200)
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
  return baseCard(width, height, 'Language Bytes — Pareto Analysis', `Top 14 languages by bytes with per-language share %, cumulative distribution line (right axis) and 80% Pareto threshold · real GitHub byte counts from every repository`, inner);
}

export function langRadarSvg(data) {
  const top = data.byRepo.slice(0, 8);
  const cx = 370;
  const cy = 285;
  const radius = 172;
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
    const [x1, y1] = axisPoint(i, radius + 28);
    return `<line x1="${cx}" y1="${cy}" x2="${x0.toFixed(2)}" y2="${y0.toFixed(2)}" stroke="#ffffff" stroke-opacity="0.12" stroke-width="1"/>
<text x="${x1.toFixed(2)}" y="${y1.toFixed(2)}" text-anchor="middle" fill="#e2e8f0" font-size="12.5" font-weight="700" ${font()}>${esc(x.name)}</text>`;
  }).join('');
  const dataPts = top.map((x, i) => {
    const [px, py] = axisPoint(i, radius * norm[i]);
    return `${px.toFixed(2)},${py.toFixed(2)}`;
  });
  const polygon = `<polygon points="${dataPts.join(' ')}" fill="#667eea" fill-opacity="0.32" stroke="#a78bfa" stroke-width="2.5" stroke-linejoin="round"/>`;
  const dots = top.map((x, i) => {
    const [px, py] = axisPoint(i, radius * norm[i]);
    return `<circle cx="${px.toFixed(2)}" cy="${py.toFixed(2)}" r="5" fill="#a78bfa" stroke="#0b1020" stroke-width="2"/>`;
  }).join('');
  const list = top.map((x, i) => {
    const val = Math.round(norm[i] * 100);
    return `<g transform="translate(655 ${112 + i * 42})">
<text x="0" y="15" fill="#e2e8f0" font-size="14.5" font-weight="700" ${font()}>${esc(x.name)}</text>
<text x="240" y="15" text-anchor="end" fill="#cbd5e1" font-size="13" ${font()}>${x.repos} repos</text>
<rect x="0" y="25" width="285" height="8" rx="4" fill="#1e293b"/>
<rect x="0" y="25" width="${(val / 100) * 285}" height="8" rx="4" fill="${colorFor(x.name, i)}"/>
</g>`;
  }).join('');
  const censusTop = data.byRepo.slice(0, 10);
  const censusRest = data.byRepo.length - censusTop.length;
  const census = `${censusTop.map((x) => `${x.name} (${x.repos})`).join(' · ')}${censusRest ? ` · +${censusRest} more` : ''}`;
  const censusText = census.length > 150 ? census.slice(0, 147) + '…' : census;
  const inner = `
${rings}
${axes}
${polygon}
${dots}
${list}
<text x="655" y="${112 + top.length * 42 + 26}" fill="#94a3b8" font-size="12" font-weight="700" letter-spacing="1" ${font()}>LOG-NORMALIZED ADOPTION</text>
<text x="30" y="566" fill="#64748b" font-size="11" ${font()}>LANGUAGE CENSUS (${data.repoCount} REPOS): ${esc(censusText)}</text>
`;
  return baseCard(1000, 600, 'Language Adoption Radar', 'Top 8 languages by repository count, log-normalized radar — all languages supported, full census below and in stats', inner);
}

export function codeTotalsBadgeSvg({ totalLines, totalChars, repoCount, files, generatedAt, perLangTop }) {
  const linesStr = thousandSep(totalLines);
  const charsStr = thousandSep(totalChars);
  const width = 600;
  const height = 126;
  const gap = 20;
  const padX = 38;
  const blockW = (width - padX * 2 - gap) / 2;
  const digitsL = linesStr.length;
  const digitsC = charsStr.length;
  const fontL = clamp(Math.floor(Math.min(54, (blockW - 22) / (digitsL * 0.58))), 22, 54);
  const fontC = clamp(Math.floor(Math.min(48, (blockW - 22) / (digitsC * 0.58))), 20, 48);
  const labelL = 'TOTAL LINES OF CODE';
  const labelC = 'TOTAL CHARACTERS';
  const cap = `SCANNED ${repoCount} REPOSITORIES · ${compact(files)} FILES · ${generatedAt}`;
  const capChars = cap.length;
  const capFont = clamp(Math.floor((width - 40) / (capChars * 0.62)), 8, 10);
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="metal" x1="0" y1="0" x2="0" y2="${height}">
<stop stop-color="#262d40"/><stop offset="0.42" stop-color="#151a27"/><stop offset="0.6" stop-color="#0d1220"/><stop offset="1" stop-color="#090d18"/>
</linearGradient>
<linearGradient id="bevel" x1="0" y1="0" x2="0" y2="${height}">
<stop stop-color="#3d465c" stop-opacity="0.9"/><stop offset="0.18" stop-color="#242b3d" stop-opacity="0.7"/><stop offset="1" stop-color="#04060b" stop-opacity="0.95"/>
</linearGradient>
<linearGradient id="gloss" x1="0" y1="0" x2="0" y2="${height * 0.5}">
<stop stop-color="#ffffff" stop-opacity="0.1"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
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
<linearGradient id="accL" x1="0" y1="0" x2="0" y2="1">
<stop stop-color="#a78bfa"/><stop offset="1" stop-color="#4c1d95"/>
</linearGradient>
<linearGradient id="accC" x1="0" y1="0" x2="0" y2="1">
<stop stop-color="#fbbf24"/><stop offset="1" stop-color="#92400e"/>
</linearGradient>
<linearGradient id="inset" x1="0" y1="0" x2="0" y2="1">
<stop stop-color="#000000" stop-opacity="0.6"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.05"/>
</linearGradient>
<filter id="glowL" x="-30%" y="-60%" width="160%" height="260%">
<feGaussianBlur stdDeviation="3" result="b"/><feFlood flood-color="#667eea" flood-opacity="0.55"/><feComposite in2="b" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>
<filter id="glowC" x="-30%" y="-60%" width="160%" height="260%">
<feGaussianBlur stdDeviation="3" result="b"/><feFlood flood-color="#f59e0b" flood-opacity="0.5"/><feComposite in2="b" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>
</defs>
<rect x="2.5" y="2.5" width="${width - 5}" height="${height - 5}" rx="20" fill="url(#metal)" stroke="url(#bevel)" stroke-width="3"/>
<rect x="5" y="5" width="${width - 10}" height="${height - 10}" rx="17" fill="url(#gloss)"/>
<circle cx="19" cy="17" r="5" fill="url(#rivet)"/><circle cx="${width - 19}" cy="17" r="5" fill="url(#rivet)"/>
<circle cx="19" cy="${height - 17}" r="5" fill="url(#rivet)"/><circle cx="${width - 19}" cy="${height - 17}" r="5" fill="url(#rivet)"/>
<g transform="translate(${padX} 27)">
<rect width="${blockW}" height="62" rx="13" fill="#0a0e1a" stroke="#ffffff" stroke-opacity="0.08" stroke-width="1"/>
<rect width="${blockW}" height="62" rx="13" fill="url(#inset)" opacity="0.5"/>
<rect x="7" y="12" width="4.5" height="38" rx="2.25" fill="url(#accL)"/>
<text x="${blockW / 2 + 8}" y="19" text-anchor="middle" fill="#8b93a7" font-size="9.5" font-weight="800" letter-spacing="1.7" ${font()}>${labelL}</text>
<text x="${blockW / 2 + 8}" y="53" text-anchor="middle" fill="url(#numGradL)" font-size="${fontL}" font-weight="900" filter="url(#glowL)" letter-spacing="0.4" ${font()}>${linesStr}</text>
</g>
<g transform="translate(${padX + blockW + gap} 27)">
<rect width="${blockW}" height="62" rx="13" fill="#0a0e1a" stroke="#ffffff" stroke-opacity="0.08" stroke-width="1"/>
<rect width="${blockW}" height="62" rx="13" fill="url(#inset)" opacity="0.5"/>
<rect x="7" y="12" width="4.5" height="38" rx="2.25" fill="url(#accC)"/>
<text x="${blockW / 2 + 8}" y="19" text-anchor="middle" fill="#8b93a7" font-size="9.5" font-weight="800" letter-spacing="1.7" ${font()}>${labelC}</text>
<text x="${blockW / 2 + 8}" y="53" text-anchor="middle" fill="url(#numGradC)" font-size="${fontC}" font-weight="900" filter="url(#glowC)" letter-spacing="0.4" ${font()}>${charsStr}</text>
</g>
<line x1="22" y1="101" x2="${width - 22}" y2="101" stroke="#ffffff" stroke-opacity="0.08"/>
<text x="${width / 2}" y="117" text-anchor="middle" fill="#5b6478" font-size="${capFont}" font-weight="700" letter-spacing="1.1" ${font()}>${esc(cap.toUpperCase())}</text>
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

const HEAT_COLORS = ['#1b2333', '#2f2a66', '#4c3fb0', '#7a6cf0', '#a78bfa'];

export function streakSvg(data) {
  const width = 1000;
  const height = 600;
  const flame = `<g transform="translate(46 156) scale(0.72)">
<path d="M0 44 C0 26 14 12 26 0 C24 20 34 30 40 22 C46 30 52 36 52 48 C52 62 40 72 26 72 C12 72 0 62 0 44 Z" fill="url(#flameGrad)"/>
<path d="M18 58 C18 48 26 40 34 34 C33 46 40 52 44 48 C47 54 47 60 43 64 C38 70 26 70 22 66 C19 64 18 61 18 58 Z" fill="#ffedd5" opacity="0.9"/>
</g>`;
  const hero = `<g transform="translate(30 108)">
<rect width="380" height="196" rx="20" fill="#0d1322" stroke="#667eea" stroke-opacity="0.5" stroke-width="1.4"/>
<rect width="380" height="6" rx="3" fill="url(#bar)"/>
${flame}
<text x="88" y="150" fill="#ffffff" font-size="52" font-weight="900" ${font()}>${data.currentStreak}</text>
<text x="88" y="172" fill="#a78bfa" font-size="13" font-weight="800" letter-spacing="2" ${font()}>DAY STREAK</text>
<text x="20" y="196" fill="#8b93a7" font-size="12" ${font()}>Last active: <tspan fill="#e2e8f0" font-weight="700">${data.lastActiveDate ? relativeTime(data.lastActiveDate + 'T00:00:00Z') : 'unknown'}</tspan></text>
<text x="20" y="216" fill="#64748b" font-size="11" ${font()}>${data.lastActiveDate ? monthDay(data.lastActiveDate + 'T00:00:00Z') : ''} · longest streak ${data.longest} days</text>
</g>`;
  const statCard = (x, y, label, value, color) => `<g transform="translate(${x} ${y})">
<rect width="255" height="58" rx="13" fill="#0d1322" stroke="${color}" stroke-opacity="0.4" stroke-width="1.2"/>
<text x="14" y="23" fill="#8b93a7" font-size="10.5" font-weight="800" letter-spacing="1.1" ${font()}>${esc(label)}</text>
<text x="14" y="47" fill="${color}" font-size="19" font-weight="800" ${font()}>${esc(value)}</text>
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
  const hy = 368;
  const cells = lastDays.map((d, i) => {
    const col = Math.floor(i / 7);
    const row = i % 7;
    const lvl = data.level ? data.level(d.count) : 0;
    return `<rect x="${hx + col * 19}" y="${hy + row * 19}" width="16" height="16" rx="3.5" fill="${HEAT_COLORS[lvl]}"/>`;
  }).join('');
  const legend = HEAT_COLORS.map((c, i) => `<rect x="${30 + i * 20}" y="${hy + 150}" width="14" height="14" rx="3.5" fill="${c}"/>`).join('');
  const weekTotal = lastDays.reduce((a, d) => a + d.count, 0);
  const heatSide = `<g>
<text x="330" y="372" fill="#e2e8f0" font-size="17" font-weight="800" ${font()}>${thousandSep(weekTotal)}</text>
<text x="330" y="392" fill="#64748b" font-size="11.5" ${font()}>contributions in last 14 weeks</text>
<text x="330" y="418" fill="#cbd5e1" font-size="13" font-weight="700" ${font()}>${data.activeDays} active days</text>
<text x="330" y="438" fill="#64748b" font-size="11.5" ${font()}>of the last 365 days</text>
<text x="330" y="464" fill="#a78bfa" font-size="13" font-weight="700" ${font()}>streak alive: ${data.currentStreak > 0 ? 'yes' : 'no'}</text>
<text x="330" y="484" fill="#64748b" font-size="11.5" ${font()}>last active ${data.lastActiveDate ? relativeTime(data.lastActiveDate + 'T00:00:00Z') : 'unknown'}</text>
</g>`;
  const inner = `
<defs>
<linearGradient id="flameGrad" x1="0" y1="1" x2="0" y2="0"><stop stop-color="#f97316"/><stop offset="0.5" stop-color="#f59e0b"/><stop offset="1" stop-color="#fbbf24"/></linearGradient>
</defs>
${hero}
${right}
<text x="30" y="352" fill="#94a3b8" font-size="12" font-weight="800" letter-spacing="1.4" ${font()}>LAST 14 WEEKS OF CONTRIBUTIONS</text>
${cells}
${heatSide}
<text x="30" y="${hy + 156}" fill="#5b6478" font-size="10.5" ${font()}>Less</text>
${legend}
<text x="150" y="${hy + 156}" fill="#5b6478" font-size="10.5" ${font()}>More</text>
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
