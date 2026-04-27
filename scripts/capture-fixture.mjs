#!/usr/bin/env node
// One-shot capture of the three verified CodinGame /services/* responses for a
// given handle. Output goes to tools/mock-codingame/fixtures/<handle>/.
//
// Usage:
//   node scripts/capture-fixture.mjs <handle> [output-name]
//
// output-name defaults to "seed". The fixture directory is overwritten.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(__filename));

const HANDLE = process.argv[2];
const OUTPUT_NAME = process.argv[3] ?? 'seed';

if (!HANDLE) {
  console.error('Usage: capture-fixture.mjs <handle> [output-name]');
  process.exit(1);
}

const FIXTURE_DIR = join(ROOT, 'tools', 'mock-codingame', 'fixtures', OUTPUT_NAME);

const UA = 'coding-game-dashboard/0.0.0 (+https://github.com/Warrenn/coding-game-dashboard)';
const BASE = 'https://www.codingame.com';

async function call(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': UA,
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${path} → ${res.status}\n${text.slice(0, 500)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${path} returned non-JSON: ${text.slice(0, 500)}`);
  }
}

function pickUserId(stats) {
  return stats?.codingamer?.userId ?? stats?.userId ?? stats?.codingamer?.id ?? stats?.id ?? null;
}

mkdirSync(FIXTURE_DIR, { recursive: true });

console.log(`Capturing fixture "${OUTPUT_NAME}" for handle: ${HANDLE}`);

const stats = await call('/services/CodinGamer/findCodingamePointsStatsByHandle', [HANDLE]);
writeFileSync(join(FIXTURE_DIR, 'stats.json'), JSON.stringify(stats, null, 2) + '\n');
console.log(`  stats.json saved`);

const userId = pickUserId(stats);
if (!userId) {
  console.error('Could not find userId in stats response. Top-level keys:', Object.keys(stats));
  console.error('Full response written for inspection.');
  process.exit(1);
}
console.log(`  userId=${userId}`);

const achievements = await call('/services/Achievement/findByCodingamerId', [userId]);
writeFileSync(join(FIXTURE_DIR, 'achievements.json'), JSON.stringify(achievements, null, 2) + '\n');
const aLen = Array.isArray(achievements) ? achievements.length : '?';
console.log(`  achievements.json saved (${aLen} items)`);

const clash = await call('/services/ClashOfCode/getClashRankByCodinGamerId', [userId]);
writeFileSync(join(FIXTURE_DIR, 'clashRank.json'), JSON.stringify(clash, null, 2) + '\n');
console.log(`  clashRank.json saved`);

const meta = {
  handle: HANDLE,
  userId,
  capturedAt: new Date().toISOString(),
  endpoints: [
    '/services/CodinGamer/findCodingamePointsStatsByHandle',
    '/services/Achievement/findByCodingamerId',
    '/services/ClashOfCode/getClashRankByCodinGamerId',
  ],
};
writeFileSync(join(FIXTURE_DIR, '_meta.json'), JSON.stringify(meta, null, 2) + '\n');

console.log(`\nFixture written to ${FIXTURE_DIR}`);
