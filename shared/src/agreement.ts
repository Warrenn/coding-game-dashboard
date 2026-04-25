import { z } from 'zod';
import { AchievementLevelSchema } from './codingame.js';

/**
 * One pricing rule. Each kind targets a different achievement category.
 * The web layer joins these with the snapshot to compute outstanding amounts.
 */
export const PricingRuleSchema = z.discriminatedUnion('kind', [
  z.object({
    ruleId: z.string(),
    kind: z.literal('badge-level'),
    level: AchievementLevelSchema,
    unitPrice: z.number().nonnegative(),
  }),
  z.object({
    ruleId: z.string(),
    kind: z.literal('rank-tier'),
    label: z.string(),
    maxRank: z.number().int().positive(),
    unitPrice: z.number().nonnegative(),
  }),
  z.object({
    ruleId: z.string(),
    kind: z.literal('xp-milestone'),
    every: z.number().int().positive(),
    unitPrice: z.number().nonnegative(),
  }),
  z.object({
    ruleId: z.string(),
    kind: z.literal('clash-rank-tier'),
    label: z.string(),
    maxRank: z.number().int().positive(),
    unitPrice: z.number().nonnegative(),
  }),
]);
export type PricingRule = z.infer<typeof PricingRuleSchema>;

export const AgreementMetaSchema = z.object({
  handle: z.string().min(1),
  currency: z.string().min(3).max(3).default('ZAR'),
  updatedAt: z.string(),
});
export type AgreementMeta = z.infer<typeof AgreementMetaSchema>;
