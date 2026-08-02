import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, readdir, stat, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { runPool } from './engine.mjs';

const exec = promisify(execFile);

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'vendor', 'dist', 'build', 'out', '.next', '__pycache__',
  '.venv', 'venv', 'env', 'target', '.gradle', '.idea', '.cache', 'coverage',
  '.turbo', '.svelte-kit', '.vercel', '.expo', 'Pods', 'DerivedData', 'bin', 'obj',
  '.parcel-cache', '.yarn', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.svn',
  '.hg', 'bower_components', 'jspm_packages', '.pnpm-store', '.nuxt', '.output',
  '.docusaurus', 'site-packages', '.serverless', '.terraform', 'node_modules_install'
]);

const SKIP_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'composer.lock',
  'poetry.lock', 'Cargo.lock', 'Gemfile.lock', 'go.sum', 'npm-shrinkwrap.json',
  '.DS_Store', 'Thumbs.db', 'LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING', 'AUTHORS'
]);

const BINARY_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'tiff', 'avif', 'woff', 'woff2',
  'ttf', 'otf', 'eot', 'pdf', 'zip', 'gz', 'tar', '7z', 'rar', 'xz', 'bz2', 'jar',
  'war', 'class', 'so', 'dll', 'exe', 'dylib', 'o', 'a', 'bin', 'dat', 'db', 'sqlite',
  'sqlite3', 'mp3', 'mp4', 'webm', 'mov', 'avi', 'mkv', 'wav', 'flac', 'ogg', 'm4a',
  'iso', 'img', 'lockb', 'wasm', 'pyc', 'pyo', 'pyd', 'map', 'jpeg', 'jfif', 'psd',
  'xcf', 'blend', 'fbx', 'obj3d', 'stl', 'dwg', 'dxf', 'pdb', 'p12', 'pfx', 'key'
]);

const MAX_FILE_BYTES = 4 * 1024 * 1024;

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

function isSkippedPath(relativePath) {
  const lower = relativePath.toLowerCase();
  if (/\.min\.(js|css)$/.test(lower)) return true;
  if (/\.bundle\.(js|css)$/.test(lower)) return true;
  if (lower.endsWith('.map')) return true;
  if (lower.endsWith('.min')) return true;
  return false;
}

function isBinary(buffer) {
  const probe = buffer.subarray(0, 8192);
  for (let i = 0; i < probe.length; i++) {
    if (probe[i] === 0) return true;
  }
  return false;
}

function countText(buffer) {
  const text = buffer.toString('utf8');
  const totalChars = text.length;
  let nonWhitespace = 0;
  for (let i = 0; i < totalChars; i++) {
    const c = text.charCodeAt(i);
    if (c !== 32 && c !== 9 && c !== 10 && c !== 13 && c !== 11 && c !== 12) nonWhitespace += 1;
  }
  const body = text.endsWith('\n') ? text.slice(0, -1) : text;
  const lines = body.split('\n');
  let codeLines = 0;
  for (const line of lines) {
    if (line.trim().length > 0) codeLines += 1;
  }
  return { lines: lines.length, codeLines, chars: totalChars, nonWsChars: nonWhitespace };
}

export async function scanRepository(root) {
  const totals = { files: 0, lines: 0, codeLines: 0, chars: 0, nonWsChars: 0, bytes: 0 };
  const perLang = new Map();
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const name = entry.name;
      const ext = extname(name).toLowerCase().slice(1);
      if (SKIP_FILES.has(name)) continue;
      if (BINARY_EXT.has(ext)) continue;
      if (isSkippedPath(full.replace(root, ''))) continue;
      let fileStat;
      try {
        fileStat = await stat(full);
      } catch {
        continue;
      }
      if (fileStat.size === 0 || fileStat.size > MAX_FILE_BYTES) continue;
      let buffer;
      try {
        buffer = await readFile(full);
      } catch {
        continue;
      }
      if (isBinary(buffer)) continue;
      const counted = countText(buffer);
      totals.files += 1;
      totals.lines += counted.lines;
      totals.codeLines += counted.codeLines;
      totals.chars += counted.chars;
      totals.nonWsChars += counted.nonWsChars;
      totals.bytes += fileStat.size;
      const lang = EXT_LANG[ext] || 'Unknown';
      const bucket = perLang.get(lang) || { files: 0, lines: 0, codeLines: 0, chars: 0, bytes: 0 };
      bucket.files += 1;
      bucket.lines += counted.lines;
      bucket.codeLines += counted.codeLines;
      bucket.chars += counted.chars;
      bucket.bytes += fileStat.size;
      perLang.set(lang, bucket);
    }
  }
  return {
    totals,
    perLang: [...perLang.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.lines - a.lines)
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
    try {
      const ls = await exec('git', ['ls-remote', `https://${auth}github.com/${owner}/${repo.name}.git`, 'HEAD'], { timeout: 30000 });
      head = String(ls.stdout).split(/\s+/)[0] || null;
    } catch {
      head = null;
    }
    if (head && manifest[repo.name] === head && existsSync(dir)) {
      outcomes.push({ repo: repo.name, status: 'cached', head });
      return;
    }
    if (existsSync(dir)) {
      await rm(dir, { recursive: true, force: true });
    }
    const branch = repo.default_branch || 'main';
    try {
      await exec(
        'git',
        ['clone', '--depth', '1', '--single-branch', '--branch', branch, `https://${auth}github.com/${owner}/${repo.name}.git`, dir],
        { timeout: 240000, maxBuffer: 1024 * 1024 * 8 }
      );
      if (head) manifest[repo.name] = head;
      outcomes.push({ repo: repo.name, status: head ? 'cloned' : 'cloned-nohead', head });
      log(`cloned ${repo.name}@${branch}`);
    } catch (error) {
      outcomes.push({ repo: repo.name, status: 'skipped', error: String(error).slice(0, 140) });
    }
  });
  await runPool(tasks, 6);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  return outcomes;
}

export function aggregateCodeMetrics(repoScans) {
  const totals = { files: 0, lines: 0, codeLines: 0, chars: 0, nonWsChars: 0, bytes: 0 };
  const perLang = new Map();
  for (const scan of repoScans) {
    if (!scan) continue;
    totals.files += scan.totals.files;
    totals.lines += scan.totals.lines;
    totals.codeLines += scan.totals.codeLines;
    totals.chars += scan.totals.chars;
    totals.nonWsChars += scan.totals.nonWsChars;
    totals.bytes += scan.totals.bytes;
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
    perLang: [...perLang.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.lines - a.lines)
  };
}

