import { createClient, runPool, shannonEntropy, herfindahl, giniCoefficient, concentrationRatio, paretoAnalysis, logNormalize, geometricMean, median, coefficientOfVariation, humanSize, ageFrom, preciseAge, dateStamp } from './engine.mjs';

const FRONTEND_DEPS = new Map(
  Object.entries({
    react: 'React',
    vite: 'Vite',
    next: 'Next.js',
    vue: 'Vue',
    nuxt: 'Nuxt',
    svelte: 'Svelte',
    tailwindcss: 'Tailwind',
    bootstrap: 'Bootstrap',
    'framer-motion': 'Framer Motion',
    'lucide-react': 'Lucide',
    '@vitejs/plugin-react': 'Vite React',
    '@react-three/fiber': 'R3F',
    three: 'Three.js',
    'vue-router': 'Vue Router',
    pinia: 'Pinia',
    redux: 'Redux',
    'react-redux': 'React Redux',
    'react-router-dom': 'React Router',
    styled: 'Styled Components',
    '@emotion/react': 'Emotion',
    'next-auth': 'NextAuth',
    shadcn: 'shadcn/ui'
  })
);

const BACKEND_DEPS = new Map(
  Object.entries({
    express: 'Express',
    fastify: 'Fastify',
    hono: 'Hono',
    grammy: 'grammY',
    telegraf: 'Telegraf',
    '@whiskeysockets/baileys': 'Baileys',
    '@kelvdra/baileys': 'Baileys',
    axios: 'Axios',
    undici: 'Undici',
    mongoose: 'Mongoose',
    mongodb: 'MongoDB',
    mysql2: 'MySQL',
    pg: 'PostgreSQL',
    postgres: 'Postgres',
    redis: 'Redis',
    ioredis: 'Redis',
    '@supabase/supabase-js': 'Supabase',
    '@neondatabase/serverless': 'Neon DB',
    prisma: 'Prisma',
    'drizzle-orm': 'Drizzle',
    pm2: 'PM2',
    'node-cron': 'Cron',
    puppeteer: 'Puppeteer',
    playwright: 'Playwright',
    zod: 'Zod',
    jsonwebtoken: 'JWT',
    bcrypt: 'bcrypt',
    cors: 'CORS',
    helmet: 'Helmet',
    ws: 'WebSocket',
    socket: 'Socket.io',
    'socket.io': 'Socket.io',
    bull: 'Bull',
    'bullmq': 'BullMQ',
    'graphql': 'GraphQL',
    '@prisma/client': 'Prisma'
  })
);

export function computeLanguageMath(byBytes, byRepo) {
  const byBytesSorted = [...byBytes.entries()]
    .map(([name, bytes]) => ({ name, bytes, repos: (byRepo.get(name) || { repos: 0 }).repos || 0 }))
    .sort((a, b) => b.bytes - a.bytes);
  const byRepoSorted = [...byRepo.entries()]
    .map(([name, value]) => ({ name, repos: value.repos }))
    .sort((a, b) => b.repos - a.repos || byBytes.get(a.name) - byBytes.get(b.name));
  const totalBytes = byBytesSorted.reduce((a, x) => a + x.bytes, 0);
  const weights = byBytesSorted.map((x) => x.bytes);
  const repoWeights = byRepoSorted.map((x) => x.repos);
  const entropy = shannonEntropy(weights);
  const entropyMax = byBytesSorted.length ? Math.log2(byBytesSorted.length) : 0;
  const hhi = herfindahl(weights) * 10000;
  const gini = giniCoefficient(weights);
  const cr3 = concentrationRatio(weights, 3) * 100;
  const cr5 = concentrationRatio(weights, 5) * 100;
  const p80 = paretoAnalysis(weights, 0.8);
  return {
    byBytes: byBytesSorted,
    byRepo: byRepoSorted,
    totalBytes,
    languagesCount: byBytesSorted.length,
    entropy,
    entropyMax,
    redundancy: entropyMax ? 1 - entropy / entropyMax : 0,
    hhi,
    gini,
    cr3,
    cr5,
    pareto80: p80,
    topShare: totalBytes ? (byBytesSorted[0]?.bytes / totalBytes || 0) * 100 : 0,
    geomeanBytes: geometricMean(weights),
    medianBytes: median(weights),
    cv: coefficientOfVariation(weights),
    logNormalizedRepo: logNormalize(repoWeights)
  };
}

export async function fetchPerRepoLanguages(client, username, allRepos) {
  const tasks = allRepos.map((repo) => async () => {
    const languages = await client.request(`/repos/${username}/${encodeURIComponent(repo.name)}/languages`);
    return { repo: repo.name, languages: languages || {} };
  });
  return runPool(tasks, 6);
}

export async function fetchPerRepoSubscribers(client, username, allRepos) {
  const tasks = allRepos.map((repo) => async () => {
    const full = await client.request(`/repos/${username}/${encodeURIComponent(repo.name)}`);
    return { repo: repo.name, subscribers: full && full.subscribers_count ? full.subscribers_count : 0 };
  });
  return runPool(tasks, 6);
}

async function fetchPackageJson(client, username, repo) {
  try {
    const ref = encodeURIComponent(repo.default_branch || 'main');
    const file = await client.request(`/repos/${username}/${encodeURIComponent(repo.name)}/contents/package.json?ref=${ref}`);
    if (!file || !file.content) return null;
    return JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
  } catch (error) {
    if (String(error.message || error).startsWith('404 ')) return null;
    throw error;
  }
}

export async function fetchDependencyStacks(client, username, allRepos, log) {
  const frontend = new Map();
  const backend = new Map();
  const tasks = allRepos.map((repo) => async () => {
    const pkg = await fetchPackageJson(client, username, repo);
    if (!pkg) return;
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    for (const dep of Object.keys(deps)) {
      if (FRONTEND_DEPS.has(dep)) {
        const name = FRONTEND_DEPS.get(dep);
        frontend.set(name, (frontend.get(name) || 0) + 1);
      }
      if (BACKEND_DEPS.has(dep)) {
        const name = BACKEND_DEPS.get(dep);
        backend.set(name, (backend.get(name) || 0) + 1);
      }
    }
  });
  await runPool(tasks, 6);
  const sort = ([a, x], [b, y]) => y - x || a.localeCompare(b);
  return {
    frontend: [...frontend.entries()].sort(sort).map(([name, count]) => ({ name, count })),
    backend: [...backend.entries()].sort(sort).map(([name, count]) => ({ name, count }))
  };
}

export async function fetchProfileData({ username, token = '', log = () => {} }) {
  const client = createClient({ token, owner: username, log });
  log(`fetching user ${username}`);
  const user = await client.request(`/users/${username}`);
  const allRepos = (await client.paginate(`/users/${username}/repos?type=owner&sort=updated&direction=desc`)).filter((r) => !r.private);
  log(`fetched ${allRepos.length} public repositories`);
  const original = allRepos.filter((r) => !r.fork);
  const forked = allRepos.filter((r) => r.fork);
  const archived = allRepos.filter((r) => r.archived);
  const totalStars = allRepos.reduce((a, r) => a + (r.stargazers_count || 0), 0);
  const totalForks = allRepos.reduce((a, r) => a + (r.forks_count || 0), 0);
  const totalSizeKb = allRepos.reduce((a, r) => a + (r.size || 0), 0);
  log('fetching languages for every repository');
  const perRepoLanguages = await fetchPerRepoLanguages(client, username, allRepos);
  log('fetching real subscriber (watch) counts for every repository');
  const perRepoSubscribers = await fetchPerRepoSubscribers(client, username, allRepos);
  const totalWatchers = perRepoSubscribers.reduce((a, s) => a + s.subscribers, 0);
  const byBytes = new Map();
  const byRepo = new Map();
  for (const { languages } of perRepoLanguages) {
    for (const [lang, bytes] of Object.entries(languages)) {
      byBytes.set(lang, (byBytes.get(lang) || 0) + Number(bytes || 0));
      const current = byRepo.get(lang) || { repos: 0 };
      current.repos += 1;
      byRepo.set(lang, current);
    }
  }
  let languageDistribution = computeLanguageMath(byBytes, byRepo);
  if (!languageDistribution.byBytes.length) {
    const fallback = new Map();
    for (const r of allRepos) {
      const lang = r.language || 'Unknown';
      fallback.set(lang, (fallback.get(lang) || 0) + 1);
      byBytes.set(lang, (byBytes.get(lang) || 0) + 1);
      const current = byRepo.get(lang) || { repos: 0 };
      current.repos += 1;
      byRepo.set(lang, current);
    }
    languageDistribution = computeLanguageMath(byBytes, byRepo);
  }
  log('scanning dependency stacks');
  const deps = await fetchDependencyStacks(client, username, allRepos, log);
  const byStars = [...allRepos].sort(
    (a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0) || (b.forks_count || 0) - (a.forks_count || 0) || new Date(b.updated_at) - new Date(a.updated_at)
  );
  const byUpdate = [...allRepos].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  const bySize = [...allRepos].sort((a, b) => (b.size || 0) - (a.size || 0));
  const data = {
    username,
    user,
    client,
    allRepos,
    original,
    forked,
    archived,
    perRepoLanguages,
    languageDistribution,
    dependencyStacks: deps,
    byStars,
    byUpdate,
    bySize,
    generatedAt: dateStamp(),
    publicRepos: allRepos.length,
    originalRepos: original.length,
    forkedRepos: forked.length,
    archivedRepos: archived.length,
    followers: user.followers || 0,
    following: user.following || 0,
    publicGists: user.public_gists || 0,
    totalStars,
    totalForks,
    totalWatchers,
    totalSize: humanSize(totalSizeKb),
    totalSizeKb,
    topLanguage: languageDistribution.byBytes[0]?.name || 'Unknown',
    accountAge: ageFrom(user.created_at),
    accountAgePrecise: preciseAge(user.created_at).label,
    accountCreatedAt: user.created_at,
    topRepo: byStars[0]?.name || 'none',
    recentRepo: byUpdate[0]?.name || 'none',
    largestRepo: bySize[0]?.name || 'none',
    topRepositories: byStars.slice(0, 3).map((r) => ({
      name: r.name,
      url: r.html_url,
      stars: r.stargazers_count || 0,
      forks: r.forks_count || 0,
      language: r.language || 'Unknown'
    })),
    recentRepositories: byUpdate.slice(0, 8).map((r) => ({
      name: r.name,
      url: r.html_url,
      language: r.language || 'Unknown',
      updatedAt: r.updated_at
    }))
  };
  return data;
}
