import { mkdir, writeFile } from 'node:fs/promises';
import { dateStamp, writeBadge } from './lib/engine.mjs';
import { liveClockSvg } from './lib/charts.mjs';

function jakartaParts(date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);
}

async function main() {
  const now = new Date();
  const parts = jakartaParts(now);
  const wib = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  const dateText = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(now);
  const dayName = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', weekday: 'long' }).format(now);
  const generatedAt = dateStamp();
  await mkdir('generated', { recursive: true });
  await mkdir('badges', { recursive: true });
  await writeFile(
    'generated/live-clock.svg',
    liveClockSvg({ hour: Number(wib.hour), minute: Number(wib.minute), second: Number(wib.second), dateText, dayName, generatedAt })
  );
  await writeBadge('live-time', 'Jakarta time (WIB)', `${wib.hour}:${wib.minute}:${wib.second}`, 'f59e0b');
  await writeBadge('live-date', 'Jakarta date', dateText, '06b6d4');
  console.log(`[live-clock] ${wib.hour}:${wib.minute}:${wib.second} WIB — ${dateText} — ${dayName}`);
}

main().catch((error) => {
  console.error(`[live-clock] FATAL: ${error.stack || error.message}`);
  process.exit(1);
});
