import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
export const FIXTURES_DIR = join(dirname(__filename), '..', 'fixtures');

export interface Fixture {
  scenario: string;
  handle: string;
  userId: number;
  stats: unknown;
  achievements: unknown;
  clashRank: unknown;
}

interface StatsLike {
  codingamer?: {
    publicHandle?: unknown;
    userId?: unknown;
  };
}

export function loadAllFixtures(): Fixture[] {
  const out: Fixture[] = [];
  for (const scenario of readdirSync(FIXTURES_DIR)) {
    const dir = join(FIXTURES_DIR, scenario);
    if (!statSync(dir).isDirectory()) continue;
    let stats: StatsLike;
    let achievements: unknown;
    let clashRank: unknown;
    try {
      stats = JSON.parse(readFileSync(join(dir, 'stats.json'), 'utf-8')) as StatsLike;
      achievements = JSON.parse(readFileSync(join(dir, 'achievements.json'), 'utf-8'));
      clashRank = JSON.parse(readFileSync(join(dir, 'clashRank.json'), 'utf-8'));
    } catch {
      continue;
    }
    const handle = stats?.codingamer?.publicHandle;
    const userId = stats?.codingamer?.userId;
    if (typeof handle !== 'string' || typeof userId !== 'number') continue;
    out.push({ scenario, handle, userId, stats, achievements, clashRank });
  }
  return out;
}
