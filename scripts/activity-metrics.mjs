import { mkdir, writeFile } from 'node:fs/promises';
import { createClient, compact, thousandSep, dateStamp } from './lib/engine.mjs';
import { fetchUserActivity, computeStreak, fetchCommitTimestamps } from './lib/activity.mjs';
import { streakSvg, commitHoursSvg } from './lib/charts.mjs';

const username = process.env.PROFILE_USERNAME || 'akaanakbaik';
const token = process.env.GITHUB_TOKEN || '';

async function main() {
  const log = (msg) => console.log(`[activity-metrics] ${msg}`);
  const client = createClient({ token, owner: username, log });
  const allRepos = (await client.paginate(`/users/${username}/repos?type=owner&sort=updated&direction=desc`)).filter((r) => !r.private);
  log(`found ${allRepos.length} public repositories`);
  const activity = await fetchUserActivity(token, username, log);
  const streak = computeStreak(activity);
  log(`streak current=${streak.currentStreak}d longest=${streak.longest}d activeDays=${streak.activeDays} contributions=${streak.totalContributions}`);
  const commitHours = await fetchCommitTimestamps(client, username, allRepos, log);
  log(`commits sampled=${commitHours.sampled} peak=${commitHours.peakHour}:00 mean=${commitHours.circularMean.toFixed(1)}:00 busiest=${commitHours.peakWeekday}`);
  await mkdir('generated', { recursive: true });
  await mkdir('stats', { recursive: true });
  await writeFile('generated/streak.svg', streakSvg({ ...activity, ...streak, activeDays: streak.activeDays }));
  await writeFile('generated/commit-hours.svg', commitHoursSvg({ ...commitHours, totalCommitContributions: activity.totalCommitContributions }));
  const snapshot = {
    username,
    generatedAt: dateStamp(),
    activity: {
      pullRequests: activity.pullRequests,
      issues: activity.issues,
      reposContributed: activity.reposContributed,
      totalCommitContributions: activity.totalCommitContributions,
      totalPRReviews: activity.totalPRReviews,
      totalContributions: activity.totalContributions
    },
    streak,
    commitHours: {
      sampled: commitHours.sampled,
      hourCounts: commitHours.hourCounts,
      weekdayCounts: commitHours.weekdayCounts,
      peakHour: commitHours.peakHour,
      peakWeekday: commitHours.peakWeekday,
      circularMean: commitHours.circularMean,
      circularStd: commitHours.circularStd,
      activeHours: commitHours.activeHours
    }
  };
  await writeFile('stats/activity-metrics.json', JSON.stringify(snapshot, null, 2) + '\n');
}

main().catch((error) => {
  console.error(`[activity-metrics] FATAL: ${error.stack || error.message}`);
  process.exit(1);
});
