// Detect duplicate pending payment requests. A duplicate is a PENDING
// request that covers exactly the same set of achievementKeys as a new
// candidate request, regardless of order.
import type { PaymentRequest } from '@cgd/shared';

function keySet(keys: readonly string[]): Set<string> {
  return new Set(keys);
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const k of a) if (!b.has(k)) return false;
  return true;
}

/**
 * Returns the first existing PENDING request that covers the same set of
 * achievementKeys as `candidateKeys`, or null when no duplicate exists.
 */
export function findDuplicatePendingRequest(
  existing: PaymentRequest[],
  candidateKeys: readonly string[],
): PaymentRequest | null {
  if (candidateKeys.length === 0) return null;
  const candidate = keySet(candidateKeys);
  for (const r of existing) {
    if (r.status !== 'PENDING') continue;
    if (setsEqual(keySet(r.achievementKeys), candidate)) return r;
  }
  return null;
}
