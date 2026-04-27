// Derived computations across ledger entities. The web view layer reads
// raw rows via WebLedger, then runs these helpers to produce display data.
import type { DetectedAchievement, Payment, PricingRule } from '@cgd/shared';

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
  achievements: DetectedAchievement[];
  rules: PricingRule[];
  payments: Payment[];
}

export function computeOutstandingLines({
  achievements,
  rules,
  payments,
}: ComputeInput): OutstandingLine[] {
  return achievements.map((a) => {
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
