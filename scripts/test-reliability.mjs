import assert from 'node:assert/strict';
import { createClient, streakDayLabel, jakartaDateTime } from './lib/engine.mjs';

for (const [days, label] of [[0, '0 days'], [1, '1 day'], [2, '2 days'], [7, '7 days']]) {
  assert.equal(streakDayLabel(days), label);
}
assert.equal(jakartaDateTime('2026-11-05T03:34:29Z'), '05 Nov 2026, 10:34 WIB');
assert.equal(jakartaDateTime(null), 'unknown');
assert.equal(jakartaDateTime('invalid'), 'unknown');
const originalFetch = globalThis.fetch;
const originalRandom = Math.random;
Math.random = () => 0;
try {
  let networkAttempts = 0;
  globalThis.fetch = async () => {
    networkAttempts += 1;
    if (networkAttempts < 3) throw new TypeError('simulated network failure');
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const retryLogs = [];
  const client = createClient({ log: (message) => retryLogs.push(message) });
  const recovered = await client.request('/reliability-test', { retries: 2, timeoutMs: 1000 });
  assert.deepEqual(recovered, { ok: true });
  assert.equal(networkAttempts, 3);
  assert.equal(retryLogs.length, 2);

  let serverAttempts = 0;
  globalThis.fetch = async () => {
    serverAttempts += 1;
    if (serverAttempts === 1) return new Response('temporary failure', { status: 503 });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const recoveredServer = await client.request('/server-test', { retries: 1, timeoutMs: 1000 });
  assert.deepEqual(recoveredServer, { ok: true });
  assert.equal(serverAttempts, 2);
  console.log('Reliability tests passed');
} finally {
  globalThis.fetch = originalFetch;
  Math.random = originalRandom;
}
