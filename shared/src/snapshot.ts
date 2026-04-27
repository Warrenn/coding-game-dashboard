// Normalized snapshot the Lambda writes to DynamoDB and the web reads.
// Decouples the persisted shape from CodinGame's raw responses so endpoint
// drift doesn't ripple into storage.
import { z } from 'zod';
import { AchievementLevelSchema } from './codingame.js';

export const AchievementCategorySchema = z.enum(['BADGE', 'RANK', 'XP', 'CLASH_RANK']);
export type AchievementCategory = z.infer<typeof AchievementCategorySchema>;

export const DetectedAchievementSchema = z.object({
  /** Stable, idempotent key used as DynamoDB SK. */
  achievementKey: z.string(),
  category: AchievementCategorySchema,
  /** Display title (e.g. badge title). */
  title: z.string(),
  /** Badge level when category=BADGE; null for XP/RANK/CLASH_RANK. */
  level: AchievementLevelSchema.nullable(),
  /** ISO-8601 timestamp of detection (i.e. when this snapshot ran). */
  detectedAt: z.string(),
  /** Free-form metadata pinned per category. */
  metadata: z.record(z.string(), z.unknown()),
});
export type DetectedAchievement = z.infer<typeof DetectedAchievementSchema>;

export const SnapshotSchema = z.object({
  fetchedAt: z.string(),
  handle: z.string(),
  userId: z.number(),
  pseudo: z.string(),
  level: z.number(),
  xp: z.number(),
  overallRank: z.number(),
  clashRank: z.number().nullable(),
  clashTotalPlayers: z.number().nullable(),
  totalAchievements: z.number(),
  achievements: z.array(DetectedAchievementSchema),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

/** Stable badge key. Idempotent — same input always yields same key. */
export function badgeAchievementKey(badgeId: string): string {
  return `BADGE#${badgeId}`;
}
