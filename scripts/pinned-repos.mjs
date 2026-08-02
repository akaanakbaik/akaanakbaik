import { mkdir, writeFile } from 'node:fs/promises';
import { createClient, runPool } from './lib/engine.mjs';
import { pinnedRepoCardSvg } from './lib/charts.mjs';

const username = process.env.PROFILE_USERNAME || 'akaanakbaik';
const token = process.env.GITHUB_TOKEN || '';
const featured = (process.env.PINNED_REPOS || 'portofoliov2,dastermv2,musika')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

async function main() {
  const log = (msg) => console.log(`[pinned-repos] ${msg}`);
  const client = createClient({ token, owner: username, log });
  const tasks = featured.map((name, index) => async () => {
    try {
      const repo = await client.request(`/repos/${username}/${encodeURIComponent(name)}`);
      const card = pinnedRepoCardSvg(
        {
          name: repo.name,
          url: repo.html_url,
          description: repo.description,
          language: repo.language || 'Unknown',
          stars: repo.stargazers_count || 0,
          forks: repo.forks_count || 0
        },
        index
      );
      await writeFile(`generated/pinned-${name}.svg`, card);
      log(`generated pinned-${name}.svg`);
    } catch (error) {
      log(`skip ${name}: ${error.message}`);
      process.exitCode = 1;
    }
  });
  await mkdir('generated', { recursive: true });
  await runPool(tasks, 3);
  log('pinned repos generation complete');
}

main().catch((error) => {
  console.error(`[pinned-repos] FATAL: ${error.stack || error.message}`);
  process.exit(1);
});
