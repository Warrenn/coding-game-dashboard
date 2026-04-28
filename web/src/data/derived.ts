// Derived computations across ledger entities. The web view layer reads
// raw rows via WebLedger, then runs these helpers to produce display data.
import type { DetectedAchievement, Payment, PricingRule, Snapshot } from '@cgd/shared';

export interface OutstandingLine {
  achievementKey: string;
  title: string;
  currentUnitPrice: number | null;
  /** Pricing rule that matched, or null if none configured for this category. */
  ruleId: string | null;
  paid: {
    payment: Payment;
    unitPriceAtPayment: number;
  } | null;
}

function findBadgeRule(
  rules: PricingRule[],
  level: DetectedAchievement['level'],
): PricingRule | null {
  for (const r of rules) {
    if (r.kind === 'badge-level' && r.level === level) return r;
  }
  return null;
}

function findPaymentForKey(payments: Payment[], achievementKey: string): OutstandingLine['paid'] {
  // Latest payment first per the storage layer's ScanIndexForward=false; just walk.
  for (const p of payments) {
    for (const li of p.lineItems) {
      if (li.achievementKey === achievementKey) {
        return { payment: p, unitPriceAtPayment: li.unitPriceAtPayment };
      }
    }
  }
  return null;
}

export interface ComputeInput {
  /** Persisted achievement rows (currently: BADGE only — emitted by the Lambda fetcher). */
  achievements: DetectedAchievement[];
  rules: PricingRule[];
  payments: Payment[];
  /**
   * Latest snapshot for synthetic achievement derivation (XP milestones,
   * later: rank tiers, clash rank tiers). null when not yet fetched.
   */
  snapshot: Snapshot | null;
}

/**
 * For each xp-milestone rule, emit one synthetic OutstandingLine per
 * milestone the player has reached. Achievement keys use the absolute XP
 * threshold (XP#1000, XP#2000, …) — independent of the rule's `every`
 * value, so changing the rule never re-prices already-paid milestones.
 */
function deriveXpLines(
  snapshot: Snapshot,
  rules: PricingRule[],
  payments: Payment[],
): OutstandingLine[] {
  const out: OutstandingLine[] = [];
  const seen = new Set<string>();
  for (const r of rules) {
    if (r.kind !== 'xp-milestone') continue;
    const milestones = Math.floor(snapshot.xp / r.every);
    for (let n = 1; n <= milestones; n++) {
      const xp = n * r.every;
      const key = `XP#${xp}`;
      if (seen.has(key)) continue; // dedupe across overlapping rules
      seen.add(key);
      out.push({
        achievementKey: key,
        title: `XP ${xp}`,
        currentUnitPrice: r.unitPrice,
        ruleId: r.ruleId,
        paid: findPaymentForKey(payments, key),
      });
    }
  }
  return out;
}

export function computeOutstandingLines({
  achievements,
  rules,
  payments,
  snapshot,
}: ComputeInput): OutstandingLine[] {
  const fromAchievements = achievements.map<OutstandingLine>((a) => {
    if (a.category === 'BADGE') {
      const rule = findBadgeRule(rules, a.level);
      return {
        achievementKey: a.achievementKey,
        title: a.title,
        currentUnitPrice: rule?.unitPrice ?? null,
        ruleId: rule?.ruleId ?? null,
        paid: findPaymentForKey(payments, a.achievementKey),
      };
    }
    return {
      achievementKey: a.achievementKey,
      title: a.title,
      currentUnitPrice: null,
      ruleId: null,
      paid: findPaymentForKey(payments, a.achievementKey),
    };
  });

  const fromXp = snapshot ? deriveXpLines(snapshot, rules, payments) : [];

  return [...fromAchievements, ...fromXp];
}

export interface OutstandingTotals {
  unpaidLines: number;
  unpaidAmount: number;
  paidAmount: number;
}

export function totals(lines: OutstandingLine[]): OutstandingTotals {
  let unpaidLines = 0;
  let unpaidAmount = 0;
  let paidAmount = 0;
  for (const l of lines) {
    if (l.paid) {
      paidAmount += l.paid.unitPriceAtPayment;
    } else if (l.currentUnitPrice !== null) {
      unpaidLines++;
      unpaidAmount += l.currentUnitPrice;
    }
  }
  return { unpaidLines, unpaidAmount, paidAmount };
}
