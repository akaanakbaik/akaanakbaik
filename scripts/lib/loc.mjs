import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, lstat, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { runPool, sleep } from './engine.mjs';

const exec = promisify(execFile);

async function execWithRetry(command, args, options, retries = 3) {
  let last = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await exec(command, args, options);
    } catch (error) {
      last = error;
      if (attempt + 1 < retries) await sleep(Math.min(30000, 1000 * 2 ** attempt));
    }
  }
  throw last;
}

const SOURCE_EXTENSIONS = new Set([
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'pyw', 'ipynb', 'html', 'htm', 'css', 'scss', 'sass', 'less',
  'sh', 'bash', 'zsh', 'ksh', 'fish', 'java', 'cpp', 'cxx', 'cc', 'hpp', 'hh', 'hxx', 'c', 'h',
  'php', 'rb', 'go', 'rs', 'dart', 'vue', 'jl', 'r', 'scm', 'lisp', 'swift', 'kt', 'kts', 'scala',
  'hs', 'lhs', 'ex', 'exs', 'erl', 'hrl', 'pl', 'pm', 'lua', 'zig', 'nim', 'v', 'fs', 'fsx', 'fsi',
  'ml', 'mli', 'clj', 'cljs', 'cljc', 'groovy', 'gvy', 'cs', 'vb', 'f90', 'f95', 'f03', 'f', 'for',
  'sol', 'cr', 'coffee', 'elm', 'pas', 'pp', 'd', 'asm', 's', 'nasm', 'm', 'mm', 'proto', 'ps1',
  'psm1', 'psd1', 'bat', 'cmd', 'sql', 'graphql', 'gql', 'pug', 'jade', 'ejs', 'hbs', 'handlebars',
  'mustache', 'twig', 'njk', 'tcl', 'tk', 'awk', 'sed', 'ahk', 'raku', 'rakumod', 'p6', 'idr',
  'qml', 'gd', 'gdscript', 'vhd', 'vhdl', 'sv', 'svh', 'coq', 'agda', 'lean', 'purescript', 'purs',
  'reason', 'res', 'resi', 'glsl', 'vs', 'hlsl', 'wgsl', 'matlab', 'm4', 'nix', 'guile', 'cl', 'bqn',
  'forth', 'fth', 'apl', 'dyalog', 'ceylon', 'e', 'eiffel', 'mercury', 'prolog'
]);

const SOURCE_FILENAMES = new Set([
  'dockerfile', 'makefile', 'gnumakefile', 'cmakelists.txt', 'rakefile', 'gemfile', 'vagrantfile'
]);

const EXT_LANG = {
  js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', ts: 'TypeScript',
  tsx: 'TypeScript', py: 'Python', pyw: 'Python', ipynb: 'Jupyter Notebook', html: 'HTML',
  htm: 'HTML', css: 'CSS', scss: 'CSS', sass: 'CSS', less: 'CSS', sh: 'Shell', bash: 'Shell',
  zsh: 'Shell', ksh: 'Shell', fish: 'Shell', java: 'Java', cpp: 'C++', cxx: 'C++', cc: 'C++',
  hpp: 'C++', hh: 'C++', hxx: 'C++', c: 'C', h: 'C', php: 'PHP', rb: 'Ruby', go: 'Go',
  rs: 'Rust', dart: 'Dart', vue: 'Vue', jl: 'Julia', r: 'R', scm: 'Scheme', lisp: 'Common Lisp',
  swift: 'Swift', kt: 'Kotlin', kts: 'Kotlin', scala: 'Scala', hs: 'Haskell', lhs: 'Haskell',
  ex: 'Elixir', exs: 'Elixir', erl: 'Erlang', hrl: 'Erlang', pl: 'Perl', pm: 'Perl',
  lua: 'Lua', zig: 'Zig', nim: 'Nim', v: 'V', fs: 'F#', fsx: 'F#', fsi: 'F#', ml: 'OCaml',
  mli: 'OCaml', clj: 'Clojure', cljs: 'Clojure', cljc: 'Clojure', edn: 'Clojure', groovy: 'Groovy',
  gvy: 'Groovy', cs: 'C#', vb: 'Visual Basic', f90: 'Fortran', f95: 'Fortran', f03: 'Fortran',
  f: 'Fortran', for: 'Fortran', sol: 'Solidity', cr: 'Crystal', coffee: 'CoffeeScript',
  elm: 'Elm', lgt: 'Logtalk', pas: 'Pascal', pp: 'Pascal', d: 'D', asm: 'Assembly',
  s: 'Assembly', S: 'Assembly', nasm: 'Assembly', cmake: 'CMake', m: 'Objective-C', mm: 'Objective-C',
  proto: 'Protocol Buffer', tex: 'TeX', sty: 'TeX', md: 'Markdown', markdown: 'Markdown',
  rst: 'reStructuredText', txt: 'Text', json: 'JSON', jsonc: 'JSON', yaml: 'YAML', yml: 'YAML',
  toml: 'TOML', xml: 'XML', xhtml: 'XML', svg: 'SVG', ini: 'INI', cfg: 'INI', conf: 'INI',
  properties: 'INI', ps1: 'PowerShell', psm1: 'PowerShell', psd1: 'PowerShell', bat: 'Batchfile',
  cmd: 'Batchfile', mk: 'Makefile', make: 'Makefile', gnumakefile: 'Makefile', dockerfile: 'Dockerfile',
  sql: 'SQL', graphql: 'GraphQL', gql: 'GraphQL', pug: 'Pug', jade: 'Pug', ejs: 'EJS',
  hbs: 'Handlebars', handlebars: 'Handlebars', mustache: 'Mustache', twig: 'Twig', njk: 'Nunjucks',
  phpinc: 'PHP', rake: 'Ruby', god: 'Go', swiftui: 'Swift', mdbook: 'Markdown', adoc: 'AsciiDoc',
  tcl: 'Tcl', tk: 'Tcl', vim: 'Vim Script', vimrc: 'Vim Script', lisp_legacy: 'Lisp',
  ahk: 'AutoHotkey', psgi: 'Perl', cgi: 'Perl', awk: 'Awk', sed: 'sed', lua_c: 'Lua',
  pascal: 'Pascal', delphi: 'Pascal', objc: 'Objective-C', rust_legacy: 'Rust',
  sol_legacy: 'Solidity', raku: 'Raku', rakumod: 'Raku', p6: 'Raku', idr: 'Idris',
  fsproj: 'F#', csproj: 'XML', sln: 'Visual Studio Solution', vbproj: 'XML', xaml: 'XML',
  qml: 'QML', gd: 'GDScript', gdscript: 'GDScript', vhd: 'VHDL', vhdl: 'VHDL', sv: 'SystemVerilog',
  svh: 'SystemVerilog', coq: 'Coq', agda: 'Agda', lean: 'Lean', purescript: 'PureScript',
  purs: 'PureScript', reason: 'Reason', res: 'ReScript', resi: 'ReScript', glsl: 'GLSL',
  vs: 'GLSL', hlsl: 'HLSL', wgsl: 'WGSL', cmake_legacy: 'CMake',
  matlab: 'MATLAB', m4: 'M4', cmakelists: 'CMake', 'dockerfile-latex': 'Dockerfile',
  ipynb_legacy: 'Jupyter Notebook', nix: 'Nix', nixos: 'Nix', flake: 'Nix', guile: 'Scheme',
  cl: 'Common Lisp', bqn: 'BQN', forth: 'Forth', fth: 'Forth', apl: 'APL', dyalog: 'APL',
  ceylon: 'Ceylon', e: 'Eiffel', eiffel: 'Eiffel', mercury: 'Mercury', prolog: 'Prolog',
  plist: 'XML', strings: 'Text', csv: 'CSV', tsv: 'TSV', srt: 'SubRip Text', vtt: 'WebVTT',
  sum: 'Text', lock: 'Text', example: 'Text', sample: 'Text', tmp: 'Text', bak: 'Text',
  orig: 'Text', draft: 'Text', stash: 'Text', local: 'Text', old: 'Text', swp: 'Text'
};

function isBinary(buffer) {
  const probe = buffer.subarray(0, 8192);
  for (let i = 0; i < probe.length; i++) {
    if (probe[i] === 0) return true;
  }
  return false;
}

function isSourceFile(relativePath) {
  const name = relativePath.split('/').at(-1).toLowerCase();
  if (SOURCE_FILENAMES.has(name)) return true;
  const ext = extname(name).slice(1);
  return SOURCE_EXTENSIONS.has(ext);
}

function decodeText(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

function notebookSource(text) {
  const notebook = JSON.parse(text);
  const cells = Array.isArray(notebook.cells) ? notebook.cells : [];
  return cells
    .filter((cell) => cell && cell.cell_type === 'code')
    .map((cell) => Array.isArray(cell.source) ? cell.source.join('') : String(cell.source || ''))
    .join('');
}

function countText(buffer, relativePath) {
  const text = decodeText(buffer);
  const source = extname(relativePath).toLowerCase() === '.ipynb' ? notebookSource(text) : text;
  const chars = Array.from(source).length;
  let nonWhitespace = 0;
  for (const character of source) {
    if (!/\s/u.test(character)) nonWhitespace += 1;
  }
  const normalized = source.replace(/\r\n?/g, '\n');
  const body = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  const lines = body.length === 0 ? 0 : body.split('\n').length;
  const codeLines = body === '' ? 0 : body.split('\n').filter((line) => line.trim().length > 0).length;
  return { lines, codeLines, chars, nonWsChars: nonWhitespace };
}

async function trackedSourceFiles(root) {
  const result = await exec('git', ['-C', root, 'ls-files', '-z', '--cached'], { timeout: 30000, maxBuffer: 1024 * 1024 * 16 });
  return String(result.stdout)
    .split('\0')
    .filter(Boolean)
    .filter(isSourceFile);
}

export async function scanRepository(root) {
  const totals = { files: 0, lines: 0, codeLines: 0, chars: 0, nonWsChars: 0, bytes: 0 };
  const perLang = new Map();
  const files = await trackedSourceFiles(root);
  const exclusions = [];
  const failures = [];
  const exclude = (relativePath, reason) => exclusions.push({ path: relativePath, reason });
  for (const relativePath of files) {
    const full = join(root, relativePath);
    let fileStat;
    try {
      fileStat = await lstat(full);
    } catch (error) {
      failures.push(`${relativePath}: stat failed (${error.message})`);
      continue;
    }
    if (fileStat.isSymbolicLink()) {
      exclude(relativePath, 'symlink');
      continue;
    }
    if (!fileStat.isFile()) {
      exclude(relativePath, 'not-regular-file');
      continue;
    }
    let buffer;
    try {
      buffer = await readFile(full);
    } catch (error) {
      failures.push(`${relativePath}: read failed (${error.message})`);
      continue;
    }
    if (isBinary(buffer)) {
      failures.push(`${relativePath}: binary content in a source file`);
      continue;
    }
    let counted;
    try {
      counted = countText(buffer, relativePath);
    } catch (error) {
      failures.push(`${relativePath}: parse failed (${error.message})`);
      continue;
    }
    totals.files += 1;
    totals.lines += counted.lines;
    totals.codeLines += counted.codeLines;
    totals.chars += counted.chars;
    totals.nonWsChars += counted.nonWsChars;
    totals.bytes += fileStat.size;
    const name = relativePath.split('/').at(-1).toLowerCase();
    const ext = extname(name).slice(1);
    const lang = EXT_LANG[ext] || EXT_LANG[name] || 'Unknown';
    const bucket = perLang.get(lang) || { files: 0, lines: 0, codeLines: 0, chars: 0, bytes: 0 };
    bucket.files += 1;
    bucket.lines += counted.lines;
    bucket.codeLines += counted.codeLines;
    bucket.chars += counted.chars;
    bucket.bytes += fileStat.size;
    perLang.set(lang, bucket);
  }
  if (failures.length) throw new Error(`Code Census failed for ${failures.length} source files: ${failures.slice(0, 20).join('; ')}`);
  return {
    totals,
    scannedFiles: files.length,
    excludedFiles: exclusions.length,
    exclusionSamples: exclusions.slice(0, 50),
    policy: 'all tracked regular source files; Unicode code points; notebook code cells; no file-size limit; dependencies and generated source included when tracked',
    perLang: [...perLang.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.codeLines - a.codeLines)
  };
}

export async function ensureClones(repos, targetDir, { token = '', owner = 'akaanakbaik', log = () => {} } = {}) {
  await mkdir(targetDir, { recursive: true });
  const manifestPath = join(targetDir, 'manifest.json');
  let manifest = {};
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    manifest = {};
  }
  const auth = token ? `x-access-token:${token}@` : '';
  const outcomes = [];
  const tasks = repos.map((repo) => async () => {
    const dir = join(targetDir, repo.name);
    let head = null;
    let lsRemoteFailed = false;
    try {
      const ls = await execWithRetry('git', ['ls-remote', `https://${auth}github.com/${owner}/${repo.name}.git`, 'HEAD'], { timeout: 30000 });
      head = String(ls.stdout).split(/\s+/)[0] || null;
    } catch {
      lsRemoteFailed = true;
    }
    if (!head && !lsRemoteFailed && repo.size === 0) {
      if (existsSync(dir)) await rm(dir, { recursive: true, force: true });
      await mkdir(dir, { recursive: true });
      await exec('git', ['init', '--quiet', dir], { timeout: 30000 });
      manifest[repo.name] = 'EMPTY';
      outcomes.push({ repo: repo.name, status: 'empty', head: null });
      log(`empty repository ${repo.name}`);
      return;
    }
    if (head && manifest[repo.name] === head && existsSync(dir)) {
      outcomes.push({ repo: repo.name, status: 'cached', head });
      return;
    }
    if (existsSync(dir)) {
      await rm(dir, { recursive: true, force: true });
    }
    const branch = repo.default_branch || 'main';
    let cloneError = null;
    let cloned = false;
    for (let attempt = 0; attempt < 3 && !cloned; attempt++) {
      try {
        if (existsSync(dir)) await rm(dir, { recursive: true, force: true });
        await exec('git', ['clone', '--depth', '1', '--single-branch', '--branch', branch, `https://${auth}github.com/${owner}/${repo.name}.git`, dir], { timeout: 240000, maxBuffer: 1024 * 1024 * 8 });
        cloned = true;
      } catch (error) {
        cloneError = error;
        if (attempt < 2) await sleep(Math.min(30000, 1000 * 2 ** attempt));
      }
    }
    if (cloned) {
      if (head) manifest[repo.name] = head;
      outcomes.push({ repo: repo.name, status: head ? 'cloned' : 'cloned-nohead', head });
      log(`cloned ${repo.name}@${branch}`);
    } else {
      outcomes.push({ repo: repo.name, status: 'skipped', error: String(cloneError).slice(0, 140) });
    }
  });
  await runPool(tasks, 6);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  return outcomes;
}

export function aggregateCodeMetrics(repoScans) {
  const totals = { files: 0, lines: 0, codeLines: 0, chars: 0, nonWsChars: 0, bytes: 0 };
  let scannedFiles = 0;
  let excludedFiles = 0;
  const exclusionSamples = [];
  const policies = new Set();
  const perLang = new Map();
  for (const scan of repoScans) {
    if (!scan) continue;
    totals.files += scan.totals.files;
    totals.lines += scan.totals.lines;
    totals.codeLines += scan.totals.codeLines;
    totals.chars += scan.totals.chars;
    totals.nonWsChars += scan.totals.nonWsChars;
    totals.bytes += scan.totals.bytes;
    scannedFiles += scan.scannedFiles || 0;
    excludedFiles += scan.excludedFiles || 0;
    if (scan.policy) policies.add(scan.policy);
    if (Array.isArray(scan.exclusionSamples)) {
      const room = Math.max(0, 50 - exclusionSamples.length);
      exclusionSamples.push(...scan.exclusionSamples.slice(0, room).map((sample) => ({ repository: scan.repo || 'unknown', ...sample })));
    }
    for (const lang of scan.perLang) {
      const bucket = perLang.get(lang.name) || { files: 0, lines: 0, codeLines: 0, chars: 0, bytes: 0 };
      bucket.files += lang.files;
      bucket.lines += lang.lines;
      bucket.codeLines += lang.codeLines;
      bucket.chars += lang.chars;
      bucket.bytes += lang.bytes;
      perLang.set(lang.name, bucket);
    }
  }
  return {
    totals,
    repositories: repoScans.length,
    scannedFiles,
    excludedFiles,
    exclusionSamples,
    policy: policies.size === 1 ? [...policies][0] : 'mixed Code Census policies',
    perLang: [...perLang.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.codeLines - a.codeLines)
  };
}

