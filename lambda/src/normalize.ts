import {
  badgeAchievementKey,
  type CodinGameAchievement,
  type CodinGameClashRank,
  type CodinGameStats,
  type DetectedAchievement,
  type Snapshot,
} from '@cgd/shared';

export interface NormalizeInput {
  stats: CodinGameStats;
  achievements: CodinGameAchievement[];
  clashRank: CodinGameClashRank;
  fetchedAt: string;
}

function isCompleted(a: CodinGameAchievement): boolean {
  return a.progress >= a.progressMax;
}

function toDetectedBadge(a: CodinGameAchievement, fetchedAt: string): DetectedAchievement {
  return {
    achievementKey: badgeAchievementKey(a.id),
    category: 'BADGE',
    title: a.title,
    level: a.level,
    detectedAt: fetchedAt,
    metadata: {
      badgeId: a.id,
      points: a.points,
      description: a.description,
      completionTime: a.completionTime ?? null,
    },
  };
}

export function normalize(input: NormalizeInput): Snapshot {
  const { stats, achievements, clashRank, fetchedAt } = input;
  const completedBadges = achievements
    .filter(isCompleted)
    .map((a) => toDetectedBadge(a, fetchedAt));

  return {
    fetchedAt,
    handle: stats.codingamer.publicHandle,
    userId: stats.codingamer.userId,
    pseudo: stats.codingamer.pseudo,
    level: stats.codingamer.level,
    xp: stats.codingamer.xp,
    overallRank: stats.codingamer.rank,
    clashRank: clashRank?.rank ?? null,
    clashTotalPlayers: clashRank?.totalPlayers ?? null,
    totalAchievements: completedBadges.length,
    achievements: completedBadges,
  };
}
