import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const MIN_BADGE_CONTRAST = 4.5;
// Two different budgets, because they answer two different questions.
// Drift is the strict one: stats files that disagree with each other always mean
// one of them is an orphan, and that is a bug no amount of schedule jitter can
// excuse. Age is calibrated to reality — GitHub delays scheduled runs heavily on
// this repository, and the observed gap between published snapshots over the last
// five days ranges from 18 minutes to 7h16m despite an hourly cron, so anything
// near three hours would fail constantly and be ignored. Ten hours still catches a
// generator that has been broken for a day, which is what went unnoticed before.
const MAX_SNAPSHOT_DRIFT_MINUTES = 180;
const MAX_SNAPSHOT_AGE_MINUTES = 600;

const README_PATH = 'README.md';
const URL_PATTERN = /https?:\/\/[^\s"'<>]+/g;
const ENDPOINT_PATTERN = /badges%2F([A-Za-z0-9._-]+)\.json/g;
const timeoutMs = 20000;
const BADGE_STYLE = 'for-the-badge';
const BADGE_CACHE_SECONDS = '300';

function unique(values) {
  return [...new Set(values)];
}

function normalizeUrl(url) {
  return url.replace(/[),.;]+$/g, '');
}

// The owner is taken from the environment so the same validator works in every
// workflow and locally, instead of depending on one hardcoded literal.
function repositoryOwner() {
  if (process.env.PROFILE_USERNAME) return process.env.PROFILE_USERNAME;
  if (process.env.GITHUB_REPOSITORY_OWNER) return process.env.GITHUB_REPOSITORY_OWNER;
  if (process.env.GITHUB_REPOSITORY) return String(process.env.GITHUB_REPOSITORY).split('/')[0];
  return '';
}

function localGeneratedMirror(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'raw.githubusercontent.com') return null;
    const owner = repositoryOwner();
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 4 || parts[0] !== owner || parts[1] !== owner || parts[2] !== 'main') return null;
    const localPath = parts.slice(3).join('/');
    return existsSync(localPath) ? localPath : null;
  } catch {
    return null;
  }
}

async function checkUrl(url) {
  const retryable = new Set([408, 425, 429, 500, 502, 503, 504]);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    let fetchError;
    try {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': 'akaanakbaik-readme-health' }
      });
    } catch (error) {
      fetchError = error;
    } finally {
      clearTimeout(timer);
    }
    if (fetchError) {
      if (attempt === 2) throw fetchError;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      continue;
    }
    if (response.ok) return { status: response.status, url: response.url };
    if (response.status === 429 && attempt === 2) {
      return { status: response.status, url: response.url, warning: 'rate limited but reachable' };
    }
    if (!retryable.has(response.status)) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    if (attempt === 2) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  throw new Error('URL check exhausted retries');
}

function relativeLuminance(hex) {
  const rgb = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = rgb.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function badgeContrast(color) {
  const normalized = String(color || '').replace(/^#/, '').toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(normalized)) return 0;
  return 1.05 / (relativeLuminance(normalized) + 0.05);
}

async function validateBadges() {
  const files = (await readdir('badges')).filter((name) => name.endsWith('.json')).sort();
  if (!files.length) throw new Error('badges directory is empty');
  for (const file of files) {
    const payload = JSON.parse(await readFile(`badges/${file}`, 'utf8'));
    if (payload.schemaVersion !== 1) throw new Error(`${file}: schemaVersion must be 1`);
    if (!String(payload.label || '').trim()) throw new Error(`${file}: label is missing`);
    if (!String(payload.message || '').trim()) throw new Error(`${file}: message is missing`);
    if (!String(payload.color || '').trim()) throw new Error(`${file}: color is missing`);
    const contrast = badgeContrast(payload.color);
    if (contrast < MIN_BADGE_CONTRAST) throw new Error(`${file}: color contrast ${contrast.toFixed(2)} is below ${MIN_BADGE_CONTRAST}`);
  }
  return files;
}

async function validateStats() {
  const files = (await readdir('stats')).filter((name) => name.endsWith('.json')).sort();
  if (!files.length) throw new Error('stats directory is empty');
  for (const file of files) {
    // Must be strict JSON: no trailing junk, no stray escape artifacts.
    const payload = JSON.parse(await readFile(`stats/${file}`, 'utf8'));
    if (file === 'daily-commits.json') {
      const days = Array.isArray(payload.days) ? payload.days : [];
      if (days.length !== 10) throw new Error(`${file}: expected 10 days, got ${days.length}`);
      const dates = days.map((d) => String(d.date));
      if (dates.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) throw new Error(`${file}: malformed date`);
      if ([...dates].sort().join() !== dates.join()) throw new Error(`${file}: days not sorted`);
      for (const d of days) {
        if (!Number.isInteger(d.count) || d.count < 0) throw new Error(`${file}: invalid count for ${d.date}`);
        if (!Number.isInteger(d.commits) || d.commits < 0) throw new Error(`${file}: invalid commits for ${d.date}`);
      }
      const sum = days.reduce((acc, d) => acc + d.count, 0);
      if (payload.total10 !== sum) throw new Error(`${file}: total10 ${payload.total10} != sum(days) ${sum}`);
    }
  }
  return files;
}

// Snapshot stamps are emitted by dateStamp() as Asia/Jakarta wall-clock text
// ("04 Oct 2026, 15:29"). Date.parse() would silently read that as machine-local
// time, which made a freshly generated snapshot look seven hours in the future
// and flagged healthy files as stale. Jakarta is a fixed UTC+7 with no daylight
// saving, so the offset below is exact.
const JAKARTA_STAMP = /^(\d{2}) ([A-Za-z]{3}) (\d{4}), (\d{2}):(\d{2})$/;
const JAKARTA_MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };

function parseStamp(stamp) {
  const text = String(stamp).trim();
  const match = JAKARTA_STAMP.exec(text);
  if (!match) return Date.parse(text);
  const month = JAKARTA_MONTHS[match[2]];
  if (!month) return Date.parse(text);
  return Date.parse(`${match[3]}-${month}-${match[1]}T${match[4]}:${match[5]}:00+07:00`);
}

// Every published snapshot must carry the same publication timestamp, otherwise a
// data file whose writer was dropped from CI silently keeps serving old numbers
// while the rest of the profile advances. This is the guard that caught the stale
// stats/code-totals.json and stats/activity-metrics.json files.
async function validateSnapshotFreshness() {
  const files = (await readdir('stats')).filter((name) => name.endsWith('.json')).sort();
  const stamps = [];
  for (const file of files) {
    const payload = JSON.parse(await readFile(`stats/${file}`, 'utf8'));
    const stamp = payload.generatedAt || payload.verifiedAt;
    if (!stamp) throw new Error(`${file}: missing generatedAt/verifiedAt publication stamp`);
    const parsed = parseStamp(stamp);
    if (Number.isNaN(parsed)) throw new Error(`${file}: unparsable publication stamp "${stamp}"`);
    if (parsed > Date.now() + 60000) throw new Error(`${file}: publication stamp "${stamp}" is in the future`);
    stamps.push({ file, parsed, stamp });
  }
  const newest = Math.max(...stamps.map((s) => s.parsed));
  const oldest = Math.min(...stamps.map((s) => s.parsed));
  const ageMinutes = (Date.now() - newest) / 60000;
  const driftMinutes = (newest - oldest) / 60000;
  if (ageMinutes > MAX_SNAPSHOT_AGE_MINUTES) {
    throw new Error(`newest stats snapshot is ${ageMinutes.toFixed(0)} min old, limit is ${MAX_SNAPSHOT_AGE_MINUTES} min — the snapshot generator has not run`);
  }
  if (driftMinutes > MAX_SNAPSHOT_DRIFT_MINUTES) {
    const stale = stamps.filter((s) => newest - s.parsed > MAX_SNAPSHOT_DRIFT_MINUTES * 60000).map((s) => s.file);
    throw new Error(`stats files are not one consistent snapshot (drift ${driftMinutes.toFixed(0)} min, limit ${MAX_SNAPSHOT_DRIFT_MINUTES}). Stale: ${stale.join(', ')}`);
  }
  return { stats: stamps.length, newest, driftMinutes, ageMinutes };
}

// The Code Census is the headline "lines and characters" claim on the profile, so
// its headline numbers are cross-checked here against the independent recount that
// profile-metrics runs on a separate clone pass. They must agree exactly.
async function validateCensusConsistency() {
  const manifest = JSON.parse(await readFile('stats/code-census-manifest.json', 'utf8'));
  const verification = JSON.parse(await readFile('stats/code-census-verification.json', 'utf8'));
  const profile = JSON.parse(await readFile('stats/profile-summary.json', 'utf8'));
  if (!profile.codeTotals) throw new Error('profile-summary.json is missing codeTotals');
  const fields = ['files', 'lines', 'codeLines', 'chars', 'nonWsChars', 'bytes'];
  for (const field of fields) {
    const a = Number(manifest.totals[field]);
    const b = Number(verification.totals[field]);
    const c = Number(profile.codeTotals.totals[field]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) throw new Error(`census field ${field} is not numeric`);
    if (a !== b || b !== c) throw new Error(`census field ${field} disagrees: manifest=${a} verification=${b} profile=${c}`);
  }
  return manifest.totals;
}

async function main() {
  const readme = await readFile(README_PATH, 'utf8');
  const urls = unique((readme.match(URL_PATTERN) || []).map(normalizeUrl));
  const badgeNames = unique([...readme.matchAll(ENDPOINT_PATTERN)].map((match) => `${match[1]}.json`));
  const available = new Set(await readdir('badges'));
  const missing = badgeNames.filter((name) => !available.has(name));
  if (missing.length) throw new Error(`README references missing endpoint badges: ${missing.join(', ')}`);
  const unused = [...available].filter((name) => name.endsWith('.json') && !badgeNames.includes(name));
  if (unused.length) throw new Error(`Badge payloads are not referenced by README: ${unused.join(', ')}`);
  const endpointUrls = urls.filter((url) => url.startsWith('https://img.shields.io/endpoint?'));
  if (endpointUrls.length !== badgeNames.length) throw new Error(`Expected one endpoint URL per badge payload, found ${endpointUrls.length} URLs for ${badgeNames.length} payloads`);
  const visualBadgeUrls = urls.filter((url) => url.startsWith('https://img.shields.io/endpoint?') || url.startsWith('https://img.shields.io/badge/') || /\/badge\.svg\?/.test(url));
  for (const url of visualBadgeUrls) {
    if (!url.includes(`style=${BADGE_STYLE}`)) throw new Error(`Badge does not use ${BADGE_STYLE}: ${url}`);
  }
  for (const url of endpointUrls) {
    if (!url.includes(`cacheSeconds=${BADGE_CACHE_SECONDS}`)) throw new Error(`Endpoint badge does not use cacheSeconds=${BADGE_CACHE_SECONDS}: ${url}`);
    if (!url.includes('logoSize=auto')) throw new Error(`Endpoint badge does not use adaptive logo sizing: ${url}`);
  }
  const badges = await validateBadges();
  const stats = await validateStats();
  const freshness = await validateSnapshotFreshness();
  const census = await validateCensusConsistency();
  const failures = [];
  let completed = 0;
  const workers = Array.from({ length: Math.min(12, urls.length) }, async () => {
    while (completed < urls.length) {
      const index = completed++;
      const url = urls[index];
      try {
        const result = await checkUrl(url);
        if (result.warning) {
          console.warn(`WARN ${result.status} ${result.url} ${url}: ${result.warning}`);
        } else {
          console.log(`OK ${result.status} ${result.url} ${url}`);
        }
      } catch (error) {
        const localPath = error.message.startsWith('404 ') ? localGeneratedMirror(url) : null;
        if (localPath) {
          console.warn(`LOCAL-ONLY ${url}: ${localPath} exists and will be published in this snapshot`);
        } else {
          failures.push(`${url}: ${error.message}`);
        }
      }
    }
  });
  await Promise.all(workers);
  if (failures.length) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    throw new Error(`${failures.length} README URLs failed`);
  }
  console.log(`Validated ${urls.length} README URLs, ${badges.length} badge payloads, and ${visualBadgeUrls.length} uniform badge renderers`);
  console.log(`Snapshot freshness OK: ${freshness.stats} stats files within ${freshness.driftMinutes.toFixed(0)} min drift (limit ${MAX_SNAPSHOT_DRIFT_MINUTES}), newest ${freshness.ageMinutes.toFixed(0)} min old (limit ${MAX_SNAPSHOT_AGE_MINUTES})`);
  console.log(`Code Census agrees across manifest, independent recount, and profile summary: ${census.files} files / ${census.codeLines} code lines / ${census.chars} characters`);
}

main().catch((error) => {
  console.error(`README validation failed: ${error.message}`);
  process.exit(1);
});
