import { mkdir, writeFile } from 'node:fs/promises';
import { createClient, compact, thousandSep, dateStamp, classifyRhythm } from './lib/engine.mjs';
import { fetchUserActivity, computeStreak, fetchCommitTimestamps, fetchTopReposRanking } from './lib/activity.mjs';
import { streakSvg, commitHoursSvg, calendarSvg, codingRhythmSvg, topReposSvg, codingAgeSvg, liveClockSvg } from './lib/charts.mjs';
import { preciseAge } from './lib/engine.mjs';

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
  log('ranking top repositories by composite score');
  const topRanked = await fetchTopReposRanking(client, token, username, allRepos, commitHours.perRepoCounts, log);
  log(`top 5: ${topRanked.slice(0, 5).map((r) => `${r.name}(${r.scorePct.toFixed(1)})`).join(', ')}`);
  const rhythm = classifyRhythm(commitHours.hourCounts);
  const user = await client.request(`/users/${username}`);
  const codingAge = preciseAge(user.created_at);
  const now = new Date();
  const wibParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(now);
  const wib = Object.fromEntries(wibParts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  await mkdir('generated', { recursive: true });
  await mkdir('stats', { recursive: true });
  await writeFile('generated/streak.svg', streakSvg({ ...activity, ...streak, activeDays: streak.activeDays }));
  await writeFile('generated/commit-hours.svg', commitHoursSvg({ ...commitHours, totalCommitContributions: activity.totalCommitContributions }));
  await writeFile('generated/calendar.svg', calendarSvg({ days: activity.days, level: activity.level, currentStreak: streak.currentStreak, longest: streak.longest }));
  await writeFile('generated/coding-rhythm.svg', codingRhythmSvg({ rhythm, hourCounts: commitHours.hourCounts, peakHour: commitHours.peakHour, sampled: commitHours.sampled, circularMean: commitHours.circularMean, circularStd: commitHours.circularStd, activeHours: commitHours.activeHours }));
  await writeFile('generated/top-repos.svg', topReposSvg(topRanked));
  await writeFile('generated/coding-age.svg', codingAgeSvg({ years: codingAge.years, months: codingAge.months, days: codingAge.days, totalDays: codingAge.totalDays, label: codingAge.label, createdAtText: new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(user.created_at)), repos: allRepos.length, commits: activity.totalCommitContributions }));
  await writeFile('generated/live-clock.svg', liveClockSvg({ hour: Number(wib.hour), minute: Number(wib.minute), second: Number(wib.second), dateText: new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'long', year: 'numeric' }).format(now), dayName: new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', weekday: 'long' }).format(now), generatedAt: dateStamp() }));
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
      activeHours: commitHours.activeHours,
      rhythm
    },
    codingAge: {
      years: codingAge.years,
      months: codingAge.months,
      days: codingAge.days,
      totalDays: codingAge.totalDays,
      label: codingAge.label
    },
    top5Repos: topRanked.slice(0, 5)
  };
  await writeFile('stats/activity-metrics.json', JSON.stringify(snapshot, null, 2) + '\n');
}

main().catch((error) => {
  console.error(`[activity-metrics] FATAL: ${error.stack || error.message}`);
  process.exit(1);
});
