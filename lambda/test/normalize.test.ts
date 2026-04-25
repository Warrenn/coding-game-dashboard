import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CodinGameStatsSchema,
  CodinGameAchievementsSchema,
  CodinGameClashRankSchema,
  SnapshotSchema,
  type CodinGameStats,
  type CodinGameAchievement,
  type CodinGameClashRank,
} from '@cgd/shared';
import { normalize } from '../src/normalize.js';

const __filename = fileURLToPath(import.meta.url);
const FIXTURES = join(dirname(__filename), '..', '..', 'tools', 'mock-codingame', 'fixtures');

function loadStats(scenario: string): CodinGameStats {
  return CodinGameStatsSchema.parse(
    JSON.parse(readFileSync(join(FIXTURES, scenario, 'stats.json'), 'utf-8')),
  );
}
function loadAchievements(scenario: string): CodinGameAchievement[] {
  return CodinGameAchievementsSchema.parse(
    JSON.parse(readFileSync(join(FIXTURES, scenario, 'achievements.json'), 'utf-8')),
  );
}
function loadClash(scenario: string): CodinGameClashRank {
  return CodinGameClashRankSchema.parse(
    JSON.parse(readFileSync(join(FIXTURES, scenario, 'clashRank.json'), 'utf-8')),
  );
}

const FROZEN_TIME = '2026-04-25T12:00:00.000Z';

describe('normalize', () => {
  describe('mock-active', () => {
    const stats = loadStats('mock-active');
    const achievements = loadAchievements('mock-active');
    const clash = loadClash('mock-active');

    it('top-level fields mirror raw stats', () => {
      const snapshot = normalize({ stats, achievements, clashRank: clash, fetchedAt: FROZEN_TIME });
      expect(snapshot.handle).toBe('mock-active');
      expect(snapshot.userId).toBe(9000001);
      expect(snapshot.pseudo).toBe('mock-active');
      expect(snapshot.level).toBe(18);
      expect(snapshot.xp).toBe(12500);
      expect(snapshot.overallRank).toBe(5000);
      expect(snapshot.fetchedAt).toBe(FROZEN_TIME);
    });

    it('clash fields populated from raw clashRank', () => {
      const snapshot = normalize({ stats, achievements, clashRank: clash, fetchedAt: FROZEN_TIME });
      expect(snapshot.clashRank).toBe(1234);
      expect(snapshot.clashTotalPlayers).toBe(50000);
    });

    it('emits one BADGE achievement per completed badge', () => {
      const snapshot = normalize({ stats, achievements, clashRank: clash, fetchedAt: FROZEN_TIME });
      expect(snapshot.achievements).toHaveLength(5);
      for (const a of snapshot.achievements) {
        expect(a.category).toBe('BADGE');
        expect(a.achievementKey).toMatch(/^BADGE#/);
        expect(['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']).toContain(a.level);
        expect(a.detectedAt).toBe(FROZEN_TIME);
      }
    });

    it('totalAchievements equals completed-badge count', () => {
      const snapshot = normalize({ stats, achievements, clashRank: clash, fetchedAt: FROZEN_TIME });
      expect(snapshot.totalAchievements).toBe(5);
    });

    it('output validates against SnapshotSchema', () => {
      const snapshot = normalize({ stats, achievements, clashRank: clash, fetchedAt: FROZEN_TIME });
      expect(() => SnapshotSchema.parse(snapshot)).not.toThrow();
    });

    it('idempotent: two runs produce identical achievementKeys (in same order)', () => {
      const a = normalize({ stats, achievements, clashRank: clash, fetchedAt: FROZEN_TIME });
      const b = normalize({ stats, achievements, clashRank: clash, fetchedAt: FROZEN_TIME });
      expect(a.achievements.map((x) => x.achievementKey)).toEqual(
        b.achievements.map((x) => x.achievementKey),
      );
    });

    it('badge metadata captures source ids', () => {
      const snapshot = normalize({ stats, achievements, clashRank: clash, fetchedAt: FROZEN_TIME });
      const first = snapshot.achievements[0];
      expect(first.metadata.badgeId).toBe('PZ_PLAY_1');
      expect(first.metadata.points).toBe(5);
    });
  });

  describe('mock-empty', () => {
    const stats = loadStats('mock-empty');
    const achievements = loadAchievements('mock-empty');
    const clash = loadClash('mock-empty');

    it('emits no detected achievements', () => {
      const snapshot = normalize({ stats, achievements, clashRank: clash, fetchedAt: FROZEN_TIME });
      expect(snapshot.achievements).toEqual([]);
      expect(snapshot.totalAchievements).toBe(0);
    });

    it('clashRank null when raw clash is null', () => {
      const snapshot = normalize({ stats, achievements, clashRank: clash, fetchedAt: FROZEN_TIME });
      expect(snapshot.clashRank).toBeNull();
      expect(snapshot.clashTotalPlayers).toBeNull();
    });
  });

  describe('seed (real captured fixture)', () => {
    const stats = loadStats('seed');
    const achievements = loadAchievements('seed');
    const clash = loadClash('seed');

    it('handle and userId match capture metadata', () => {
      const snapshot = normalize({ stats, achievements, clashRank: clash, fetchedAt: FROZEN_TIME });
      expect(snapshot.handle).toBe('ddc52ca3f0b26475dc7cc96153dbdf803390791');
      expect(snapshot.userId).toBe(1970933);
    });

    it('emits achievements only for completed badges (progress >= progressMax)', () => {
      const expectedCount = achievements.filter((a) => a.progress >= a.progressMax).length;
      const snapshot = normalize({ stats, achievements, clashRank: clash, fetchedAt: FROZEN_TIME });
      expect(snapshot.achievements).toHaveLength(expectedCount);
    });

    it('output validates against SnapshotSchema', () => {
      const snapshot = normalize({ stats, achievements, clashRank: clash, fetchedAt: FROZEN_TIME });
      expect(() => SnapshotSchema.parse(snapshot)).not.toThrow();
    });

    it('clashRank null when seed has no clash data', () => {
      const snapshot = normalize({ stats, achievements, clashRank: clash, fetchedAt: FROZEN_TIME });
      expect(snapshot.clashRank).toBeNull();
    });
  });

  describe('skipping incomplete achievements', () => {
    it('omits items where progress < progressMax', () => {
      const stats = loadStats('mock-active');
      const incomplete: CodinGameAchievement = {
        id: 'INCOMPLETE_1',
        title: 'In progress',
        description: 'not done',
        points: 0,
        level: 'BRONZE',
        progress: 1,
        progressMax: 5,
        completionTime: null,
      };
      const snapshot = normalize({
        stats,
        achievements: [incomplete],
        clashRank: null,
        fetchedAt: FROZEN_TIME,
      });
      expect(snapshot.achievements).toEqual([]);
      expect(snapshot.totalAchievements).toBe(0);
    });
  });
});
