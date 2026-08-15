import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const MIN_BADGE_CONTRAST = 4.5;

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

function localGeneratedMirror(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'raw.githubusercontent.com') return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 4 || parts[0] !== 'akaanakbaik' || parts[1] !== 'akaanakbaik' || parts[2] !== 'main') return null;
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
}

main().catch((error) => {
  console.error(`README validation failed: ${error.message}`);
  process.exit(1);
});
