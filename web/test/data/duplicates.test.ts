import type { PaymentRequest } from '@cgd/shared';
import { findDuplicatePendingRequest } from '../../src/data/duplicates.js';

const NOW = '2026-04-28T12:00:00.000Z';

function req(keys: string[], status: PaymentRequest['status'] = 'PENDING'): PaymentRequest {
  return {
    requestId: `r-${keys.join(',')}-${status}`,
    requestedAt: NOW,
    achievementKeys: keys,
    totalAmount: 10,
    currency: 'ZAR',
    status,
  };
}

describe('findDuplicatePendingRequest', () => {
  it('returns null when no requests exist', () => {
    expect(findDuplicatePendingRequest([], ['BADGE#A'])).toBeNull();
  });

  it('returns the matching pending request when keys match exactly', () => {
    const existing = [req(['BADGE#A', 'BADGE#B'])];
    const result = findDuplicatePendingRequest(existing, ['BADGE#A', 'BADGE#B']);
    expect(result).toBe(existing[0]);
  });

  it('matches regardless of key order', () => {
    const existing = [req(['BADGE#A', 'BADGE#B', 'XP#1000'])];
    const result = findDuplicatePendingRequest(existing, ['XP#1000', 'BADGE#B', 'BADGE#A']);
    expect(result).not.toBeNull();
  });

  it('returns null when key sets differ', () => {
    const existing = [req(['BADGE#A'])];
    expect(findDuplicatePendingRequest(existing, ['BADGE#A', 'BADGE#B'])).toBeNull();
    expect(findDuplicatePendingRequest(existing, ['BADGE#B'])).toBeNull();
  });

  it('ignores PAID and CANCELLED requests', () => {
    const existing = [req(['BADGE#A'], 'PAID'), req(['BADGE#A'], 'CANCELLED')];
    expect(findDuplicatePendingRequest(existing, ['BADGE#A'])).toBeNull();
  });

  it('returns null for empty candidate keys', () => {
    expect(findDuplicatePendingRequest([req(['BADGE#A'])], [])).toBeNull();
  });
});
