import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dateStamp, writeBadge, jakartaNow } from './lib/engine.mjs';
import { liveClockSvg, motivationQuoteSvg } from './lib/charts.mjs';

async function pickRandomQuote() {
  try {
    const raw = await readFile('scripts/data/quotes.json', 'utf8');
    const quotes = JSON.parse(raw);
    if (!quotes.length) return null;
    const index = Math.floor(Math.random() * quotes.length);
    const chosen = quotes[index];
    await writeFile('generated/motivation-quote.svg', motivationQuoteSvg(chosen, index, quotes.length));
    return { index, total: quotes.length, author: chosen.author };
  } catch (error) {
    console.log(`[live-clock] quote skipped: ${error.message}`);
    return null;
  }
}

async function main() {
  const now = jakartaNow();
  const generatedAt = dateStamp();
  await mkdir('generated', { recursive: true });
  await mkdir('badges', { recursive: true });
  await writeFile(
    'generated/live-clock.svg',
    liveClockSvg({
      hour: now.hour,
      minute: now.minute,
      second: now.second,
      dateText: now.dateText,
      dayName: now.dayName,
      generatedAt
    })
  );
  await writeBadge('live-time', 'Jakarta time (WIB)', now.timeText, 'b45309');
  await writeBadge('live-date', 'Jakarta date', now.dateText, '0e7490');
  const picked = await pickRandomQuote();
  if (picked) console.log(`[live-clock] quote #${picked.index + 1}/${picked.total} by ${picked.author}`);
  console.log(`[live-clock] ${now.timeText} WIB — ${now.dateText} — ${now.dayName}`);

}

main().catch((error) => {
  console.error(`[live-clock] FATAL: ${error.stack || error.message}`);
  process.exit(1);
});
