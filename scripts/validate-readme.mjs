import { readFile, readdir } from 'node:fs/promises';

const README_PATH = 'README.md';
const URL_PATTERN = /https?:\/\/[^\s"'<>]+/g;
const ENDPOINT_PATTERN = /badges%2F([A-Za-z0-9._-]+)\.json/g;
const timeoutMs = 20000;

function unique(values) {
  return [...new Set(values)];
}

function normalizeUrl(url) {
  return url.replace(/[),.;]+$/g, '');
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

async function validateBadges() {
  const files = (await readdir('badges')).filter((name) => name.endsWith('.json')).sort();
  if (!files.length) throw new Error('badges directory is empty');
  for (const file of files) {
    const payload = JSON.parse(await readFile(`badges/${file}`, 'utf8'));
    if (payload.schemaVersion !== 1) throw new Error(`${file}: schemaVersion must be 1`);
    if (!String(payload.label || '').trim()) throw new Error(`${file}: label is missing`);
    if (!String(payload.message || '').trim()) throw new Error(`${file}: message is missing`);
    if (!String(payload.color || '').trim()) throw new Error(`${file}: color is missing`);
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
        failures.push(`${url}: ${error.message}`);
      }
    }
  });
  await Promise.all(workers);
  if (failures.length) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    throw new Error(`${failures.length} README URLs failed`);
  }
  console.log(`Validated ${urls.length} README URLs and ${badges.length} badge payloads`);
}

main().catch((error) => {
  console.error(`README validation failed: ${error.message}`);
  process.exit(1);
});
