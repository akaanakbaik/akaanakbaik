import { mkdir, writeFile } from 'node:fs/promises';
import { createClient, compact, dateStamp } from './lib/engine.mjs';
import { fetchProfileData } from './lib/collect.mjs';
import { langDonutSvg, langParetoSvg, langRadarSvg } from './lib/charts.mjs';

const username = process.env.PROFILE_USERNAME || 'akaanakbaik';
const token = process.env.GITHUB_TOKEN || '';

async function main() {
  const log = (msg) => console.log(`[language-metrics] ${msg}`);
  const data = await fetchProfileData({ username, token, log });
  const distribution = data.languageDistribution;
  await mkdir('generated', { recursive: true });
  await mkdir('stats', { recursive: true });
  const donut = langDonutSvg({ ...distribution, repoCount: data.publicRepos });
  const pareto = langParetoSvg({ ...distribution, repoCount: data.publicRepos });
  const radar = langRadarSvg({ ...distribution, repoCount: data.publicRepos });
  await writeFile('generated/lang-donut.svg', donut);
  await writeFile('generated/lang-pareto.svg', pareto);
  await writeFile('generated/lang-radar.svg', radar);
  const snapshot = {
    username,
    generatedAt: dateStamp(),
    totalBytes: distribution.totalBytes,
    languagesCount: distribution.languagesCount,
    entropyBits: distribution.entropy,
    entropyMaxBits: distribution.entropyMax,
    redundancy: distribution.redundancy,
    hhi: distribution.hhi,
    gini: distribution.gini,
    cr3: distribution.cr3,
    cr5: distribution.cr5,
    pareto80: distribution.pareto80,
    topSharePercent: distribution.topShare,
    geometricMeanBytes: distribution.geomeanBytes,
    medianBytes: distribution.medianBytes,
    coefficientOfVariation: distribution.cv,
    byBytes: distribution.byBytes.map((x) => ({ name: x.name, bytes: x.bytes, repos: x.repos, share: (x.bytes / distribution.totalBytes) * 100 })),
    byRepo: distribution.byRepo
  };
  await writeFile('stats/language-metrics.json', JSON.stringify(snapshot, null, 2) + '\n');
  log(
    `languages=${distribution.languagesCount} entropy=${distribution.entropy.toFixed(2)} bits hhi=${distribution.hhi.toFixed(1)} gini=${distribution.gini.toFixed(3)} cr3=${distribution.cr3.toFixed(1)}% pareto80=${distribution.pareto80.count}/${distribution.pareto80.totalCount}`
  );
}

main().catch((error) => {
  console.error(`[language-metrics] FATAL: ${error.stack || error.message}`);
  process.exit(1);
});
