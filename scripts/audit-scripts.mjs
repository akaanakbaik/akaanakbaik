// Guards against the failure mode that silently froze this profile before: a
// writer script (or a data file it produces) that no workflow ever runs. Both
// the old stats/code-totals.json and stats/activity-metrics.json stayed on
// screen for a month because their writers were orphaned from CI, so every
// check passed while the numbers rotted. This audit makes that state a hard
// failure instead of an invisible one.
//
// Rules enforced:
//   1. every scripts/ entry point must be reachable from a workflow, directly
//      or through another script that is;
//   2. every file currently published under badges/, stats/ and generated/ must
//      be written by a reachable script, so no orphaned output can survive;
//   3. every scripts/lib module must be imported by at least one reachable
//      script, so dead helpers cannot quietly accumulate.

import { readdir, readFile } from 'node:fs/promises';

const WORKFLOW_DIR = '.github/workflows';
const OUTPUT_DIRS = ['badges', 'stats', 'generated'];
const OUTPUT_PREFIXES = new Set(OUTPUT_DIRS.map((dir) => `${dir}/`));

async function listScripts() {
  const entries = (await readdir('scripts')).filter((n) => n.endsWith('.mjs'));
  const libs = (await readdir('scripts/lib')).filter((n) => n.endsWith('.mjs'));
  return {
    entries: entries.map((n) => `scripts/${n}`),
    libs: libs.map((n) => `scripts/lib/${n}`)
  };
}

async function readWorkflowText() {
  const files = (await readdir(WORKFLOW_DIR)).filter((n) => n.endsWith('.yml') || n.endsWith('.yaml'));
  return Promise.all(files.map(async (n) => ({ n, text: await readFile(`${WORKFLOW_DIR}/${n}`, 'utf8') })));
}

// A workflow only *runs* a script when the path appears in a run command.
// hashFiles() references (for cache keys) are stripped first so they cannot be
// mistaken for an entry point.
function referencedScriptNames(texts) {
  const names = new Set();
  for (const { text } of texts) {
    const runnable = text.replace(/hashFiles\((['"`])[\s\S]*?\1\)/g, 'hashFiles()');
    for (const match of runnable.matchAll(/scripts\/[A-Za-z0-9._/-]+\.mjs/g)) names.add(match[0]);
  }
  return names;
}

function importsOf(source) {
  const found = new Set();
  for (const match of source.matchAll(/(?:import|export)[\s\S]*?from\s+['"](\.[^'"]+)['"]/g)) {
    found.add(match[1]);
  }
  return found;
}

function resolveImport(fromFile, specifier) {
  const parts = fromFile.split('/');
  parts.pop();
  for (const segment of specifier.split('/')) {
    if (segment === '.' || segment === '') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  return parts.join('/');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Every output path a script writes, as a matcher. Literal targets match
// exactly; template targets such as `generated/pinned-${repo}.svg` become a
// wildcard pattern so runtime-named outputs are still covered.
function writeTargets(source) {
  const matchers = [];
  const addLiteral = (literal) => {
    const isOutput = [...OUTPUT_PREFIXES].some((prefix) => literal.startsWith(prefix));
    if (!isOutput) return;
    const pattern = literal
      .split(/\$\{[^}]*\}/)
      .map(escapeRegExp)
      .join('[^/]+');
    matchers.push(new RegExp(`^${pattern}$`));
  };
  for (const match of source.matchAll(/\b(?:writeFile|appendFile|rm|mkdir)\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g)) {
    addLiteral(match[2]);
  }
  for (const match of source.matchAll(/\bwriteBadge\(\s*['"`]([A-Za-z0-9._-]+)['"`]/g)) {
    matchers.push(new RegExp(`^badges/${escapeRegExp(match[1])}\\.json$`));
  }
  return matchers;
}

async function main() {
  const log = (msg) => console.log(msg);
  const scripts = await listScripts();
  const allScripts = [...scripts.entries, ...scripts.libs];
  const sources = new Map();
  for (const file of allScripts) sources.set(file, await readFile(file, 'utf8'));

  const workflowRefs = referencedScriptNames(await readWorkflowText());
  const entryPoints = new Set([...workflowRefs].filter((ref) => sources.has(ref)));
  const missingRefs = [...workflowRefs].filter((ref) => !sources.has(ref));
  if (missingRefs.length) throw new Error(`workflows reference scripts that do not exist: ${missingRefs.join(', ')}`);

  // Breadth-first reachability from the workflow entry points.
  const reachable = new Set();
  const queue = [...entryPoints];
  while (queue.length) {
    const file = queue.shift();
    if (reachable.has(file)) continue;
    reachable.add(file);
    for (const specifier of importsOf(sources.get(file))) {
      const resolved = resolveImport(file, specifier);
      if (sources.has(resolved) && !reachable.has(resolved)) queue.push(resolved);
    }
  }

  const orphans = allScripts.filter((file) => !reachable.has(file));
  if (orphans.length) {
    throw new Error(`scripts not reachable from any workflow (orphaned writers): ${orphans.join(', ')}`);
  }

  // Every published data file must be written by a reachable script.
  const matchers = [...reachable].flatMap((file) => writeTargets(sources.get(file)));
  const strayOutputs = [];
  for (const dir of OUTPUT_DIRS) {
    let files;
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of files) {
      const rel = `${dir}/${name}`;
      if (name === 'manifest.json') continue;
      if (!matchers.some((matcher) => matcher.test(rel))) strayOutputs.push(rel);
    }
  }
  if (strayOutputs.length) {
    throw new Error(`published data files no reachable script writes (orphaned outputs): ${strayOutputs.join(', ')}`);
  }

  log(`[audit] ${allScripts.length} scripts, ${reachable.size} reachable from ${entryPoints.size} workflow entry points`);
  log(`[audit] workflow entry points: ${[...entryPoints].sort().join(', ')}`);
  log(`[audit] no orphaned writers and no orphaned outputs in ${OUTPUT_DIRS.join(', ')}`);
}

main().catch((error) => {
  console.error(`Script wiring audit failed: ${error.message}`);
  process.exit(1);
});