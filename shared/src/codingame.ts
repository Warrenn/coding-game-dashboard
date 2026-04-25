// Raw shapes returned by the CodinGame /services/* endpoints — derived from
// the seed fixture captured 2026-04-25 against handle
// ddc52ca3f0b26475dc7cc96153dbdf803390791. `passthrough()` lets us keep
// future fields without rev'ing the schema.
import { z } from 'zod';

export const AchievementLevelSchema = z.enum(['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']);
export type AchievementLevel = z.infer<typeof AchievementLevelSchema>;

export const CodinGameStatsSchema = z
  .object({
    codingamer: z
      .object({
        userId: z.number(),
        publicHandle: z.string(),
        pseudo: z.string(),
        level: z.number(),
        xp: z.number(),
        rank: z.number(),
        countryId: z.string().nullable().optional(),
      })
      .passthrough(),
    achievementCount: z.number().nullable(),
    codingamerPoints: z.number().nullable(),
  })
  .passthrough();
export type CodinGameStats = z.infer<typeof CodinGameStatsSchema>;

export const CodinGameAchievementSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    points: z.number(),
    level: AchievementLevelSchema,
    progress: z.number(),
    progressMax: z.number(),
    completionTime: z.number().nullable().optional(),
  })
  .passthrough();
export type CodinGameAchievement = z.infer<typeof CodinGameAchievementSchema>;

export const CodinGameAchievementsSchema = z.array(CodinGameAchievementSchema);

export const CodinGameClashRankSchema = z
  .object({
    rank: z.number(),
    totalPlayers: z.number(),
  })
  .nullable();
export type CodinGameClashRank = z.infer<typeof CodinGameClashRankSchema>;
