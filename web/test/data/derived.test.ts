import type { DetectedAchievement, Payment, PricingRule, Snapshot } from '@cgd/shared';
import { computeOutstandingLines, totals } from '../../src/data/derived.js';

const NOW = '2026-04-25T12:00:00.000Z';

const BADGE_GOLD: DetectedAchievement = {
  achievementKey: 'BADGE#A',
  category: 'BADGE',
  title: 'Gold badge',
  level: 'GOLD',
  detectedAt: NOW,
  metadata: {},
};
const BADGE_BRONZE: DetectedAchievement = {
  ...BADGE_GOLD,
  achievementKey: 'BADGE#B',
  title: 'Bronze badge',
  level: 'BRONZE',
};
const RULE_GOLD: PricingRule = {
  ruleId: 'r-gold',
  kind: 'badge-level',
  level: 'GOLD',
  unitPrice: 10,
};

function makeSnapshot(xp: number): Snapshot {
  return {
    fetchedAt: NOW,
    handle: 'h',
    userId: 1,
    pseudo: 'p',
    level: 1,
    xp,
    overallRank: 100,
    clashRank: null,
    clashTotalPlayers: null,
    totalAchievements: 0,
    achievements: [],
  };
}

describe('computeOutstandingLines — badges', () => {
  it('matches BADGE achievement to its level rule', () => {
    const lines = computeOutstandingLines({
      achievements: [BADGE_GOLD],
      rules: [RULE_GOLD],
      payments: [],
      snapshot: null,
    });
    expect(lines[0].currentUnitPrice).toBe(10);
    expect(lines[0].ruleId).toBe('r-gold');
    expect(lines[0].paid).toBeNull();
  });

  it('returns null price when no rule covers the level', () => {
    const lines = computeOutstandingLines({
      achievements: [BADGE_BRONZE],
      rules: [RULE_GOLD],
      payments: [],
      snapshot: null,
    });
    expect(lines[0].currentUnitPrice).toBeNull();
    expect(lines[0].ruleId).toBeNull();
  });

  it('marks line as paid when a payment line item references the key', () => {
    const payment: Payment = {
      paymentId: 'p1',
      paidAt: NOW,
      totalAmount: 8,
      currency: 'ZAR',
      lineItems: [
        {
          achievementKey: 'BADGE#A',
          unitPriceAtPayment: 8,
          quantity: 1,
          description: 'gold',
        },
      ],
    };
    const lines = computeOutstandingLines({
      achievements: [BADGE_GOLD],
      rules: [RULE_GOLD],
      payments: [payment],
      snapshot: null,
    });
    expect(lines[0].paid?.unitPriceAtPayment).toBe(8);
    // The PAID price is preserved separately from the current price (immutable).
    expect(lines[0].currentUnitPrice).toBe(10);
  });
});

describe('computeOutstandingLines — XP milestones', () => {
  const RULE_XP_1000: PricingRule = {
    ruleId: 'r-xp',
    kind: 'xp-milestone',
    every: 1000,
    unitPrice: 5,
  };

  it('emits one line per milestone reached (XP#<absolute-threshold>)', () => {
    const lines = computeOutstandingLines({
      achievements: [],
      rules: [RULE_XP_1000],
      payments: [],
      snapshot: makeSnapshot(3500), // 3 milestones: 1000, 2000, 3000
    });
    expect(lines.map((l) => l.achievementKey)).toEqual(['XP#1000', 'XP#2000', 'XP#3000']);
    expect(lines.every((l) => l.currentUnitPrice === 5)).toBe(true);
    expect(lines.every((l) => l.ruleId === 'r-xp')).toBe(true);
  });

  it('emits zero lines when player has not reached the first milestone', () => {
    const lines = computeOutstandingLines({
      achievements: [],
      rules: [RULE_XP_1000],
      payments: [],
      snapshot: makeSnapshot(500),
    });
    expect(lines.filter((l) => l.achievementKey.startsWith('XP#'))).toEqual([]);
  });

  it('marks XP milestone paid when a payment references its key', () => {
    const payment: Payment = {
      paymentId: 'p',
      paidAt: NOW,
      totalAmount: 5,
      currency: 'ZAR',
      lineItems: [
        {
          achievementKey: 'XP#1000',
          unitPriceAtPayment: 5,
          quantity: 1,
          description: '',
        },
      ],
    };
    const lines = computeOutstandingLines({
      achievements: [],
      rules: [RULE_XP_1000],
      payments: [payment],
      snapshot: makeSnapshot(2500),
    });
    const paid = lines.find((l) => l.achievementKey === 'XP#1000');
    expect(paid?.paid).not.toBeNull();
    const unpaid = lines.find((l) => l.achievementKey === 'XP#2000');
    expect(unpaid?.paid).toBeNull();
  });

  it('preserves frozen price on paid milestones even after rule changes', () => {
    const payment: Payment = {
      paymentId: 'p',
      paidAt: NOW,
      totalAmount: 5,
      currency: 'ZAR',
      lineItems: [
        { achievementKey: 'XP#1000', unitPriceAtPayment: 5, quantity: 1, description: '' },
      ],
    };
    // Rule changed: now 8 ZAR per 1000 XP
    const lines = computeOutstandingLines({
      achievements: [],
      rules: [{ ...RULE_XP_1000, unitPrice: 8 }],
      payments: [payment],
      snapshot: makeSnapshot(2500),
    });
    expect(lines.find((l) => l.achievementKey === 'XP#1000')?.paid?.unitPriceAtPayment).toBe(5);
    // New milestone (XP#2000) at the new rate
    expect(lines.find((l) => l.achievementKey === 'XP#2000')?.currentUnitPrice).toBe(8);
  });

  it('dedupes overlapping XP keys when multiple xp-milestone rules cover the same threshold', () => {
    const lines = computeOutstandingLines({
      achievements: [],
      rules: [
        RULE_XP_1000,
        { ruleId: 'r-xp-2', kind: 'xp-milestone', every: 1000, unitPrice: 99 },
      ],
      payments: [],
      snapshot: makeSnapshot(2500),
    });
    const xpLines = lines.filter((l) => l.achievementKey.startsWith('XP#'));
    expect(xpLines.map((l) => l.achievementKey)).toEqual(['XP#1000', 'XP#2000']);
    // First rule wins (price 5, not 99)
    expect(xpLines[0].currentUnitPrice).toBe(5);
  });

  it('omits XP lines when snapshot is null (not yet fetched)', () => {
    const lines = computeOutstandingLines({
      achievements: [BADGE_GOLD],
      rules: [RULE_GOLD, RULE_XP_1000],
      payments: [],
      snapshot: null,
    });
    expect(lines.map((l) => l.achievementKey)).toEqual(['BADGE#A']);
  });
});

describe('totals', () => {
  it('sums unpaid amount at current price and paid amount at frozen price', () => {
    const lines = computeOutstandingLines({
      achievements: [BADGE_GOLD, BADGE_BRONZE],
      rules: [RULE_GOLD],
      payments: [
        {
          paymentId: 'p',
          paidAt: NOW,
          totalAmount: 8,
          currency: 'ZAR',
          lineItems: [
            {
              achievementKey: 'BADGE#A',
              unitPriceAtPayment: 8,
              quantity: 1,
              description: '',
            },
          ],
        },
      ],
      snapshot: null,
    });
    const t = totals(lines);
    expect(t.paidAmount).toBe(8);
    expect(t.unpaidLines).toBe(0);
    expect(t.unpaidAmount).toBe(0);
  });

  it('counts XP milestones in unpaid totals', () => {
    const lines = computeOutstandingLines({
      achievements: [],
      rules: [{ ruleId: 'r-xp', kind: 'xp-milestone', every: 1000, unitPrice: 5 }],
      payments: [],
      snapshot: makeSnapshot(3500),
    });
    const t = totals(lines);
    expect(t.unpaidLines).toBe(3);
    expect(t.unpaidAmount).toBe(15);
  });
});
