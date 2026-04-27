import type { DetectedAchievement, Payment, PricingRule } from '@cgd/shared';
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

describe('computeOutstandingLines', () => {
  it('matches BADGE achievement to its level rule', () => {
    const lines = computeOutstandingLines({
      achievements: [BADGE_GOLD],
      rules: [RULE_GOLD],
      payments: [],
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
    });
    expect(lines[0].currentUnitPrice).toBeNull();
    expect(lines[0].ruleId).toBeNull();
  });

  it('marks line as paid when a payment line item references the key', () => {
    const payment: Payment = {
      paymentId: 'p1',
      paidAt: NOW,
      totalAmount: 8,
      currency: 'USD',
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
    });
    expect(lines[0].paid?.unitPriceAtPayment).toBe(8);
    // The PAID price is preserved separately from the current price (immutable).
    expect(lines[0].currentUnitPrice).toBe(10);
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
          currency: 'USD',
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
    });
    const t = totals(lines);
    expect(t.paidAmount).toBe(8);
    // Bronze has no rule → 0 unpaid amount, 0 unpaid lines.
    expect(t.unpaidLines).toBe(0);
    expect(t.unpaidAmount).toBe(0);
  });

  it('counts unpaid lines and sums them at current price', () => {
    const lines = computeOutstandingLines({
      achievements: [BADGE_GOLD],
      rules: [RULE_GOLD],
      payments: [],
    });
    const t = totals(lines);
    expect(t.unpaidLines).toBe(1);
    expect(t.unpaidAmount).toBe(10);
    expect(t.paidAmount).toBe(0);
  });
});
