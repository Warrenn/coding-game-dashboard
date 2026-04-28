import { useCallback, useEffect, useState } from 'react';
import type {
  DetectedAchievement,
  InboxEntry,
  PaymentRequest,
  PricingRule,
  Snapshot,
} from '@cgd/shared';
import type { Payment } from '@cgd/shared';
import { computeOutstandingLines, totals, type OutstandingLine } from '../data/derived.js';
import { APP_CURRENCY, formatMoney } from '../data/currency.js';
import { findDuplicatePendingRequest } from '../data/duplicates.js';
import { useToast } from '../ui/toast.js';
import type { WebLedger } from '../data/ledger.js';
import type { FunctionUrlClient } from '../data/function-url.js';

interface PlayerViewProps {
  ledger: WebLedger;
  lambda: FunctionUrlClient;
  /** Override clock for tests. */
  now?: () => Date;
}

interface DataState {
  loading: boolean;
  snapshot: Snapshot | null;
  achievements: DetectedAchievement[];
  rules: PricingRule[];
  payments: Payment[];
  requests: PaymentRequest[];
  inbox: InboxEntry[];
}

const INITIAL: DataState = {
  loading: true,
  snapshot: null,
  achievements: [],
  rules: [],
  payments: [],
  requests: [],
  inbox: [],
};

export function PlayerView({ ledger, lambda, now = () => new Date() }: PlayerViewProps) {
  const toast = useToast();
  const [state, setState] = useState<DataState>(INITIAL);
  const [refreshing, setRefreshing] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);
  type AchievementFilter = 'all' | 'paid' | 'outstanding' | 'unpriced';
  const [achievementFilter, setAchievementFilter] = useState<AchievementFilter>('all');

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [snapshot, achievements, rules, payments, requests, inbox] = await Promise.all([
        ledger.getLatestSnapshot(),
        ledger.listAchievements(),
        ledger.listPricingRules(),
        ledger.listPayments(),
        ledger.listRequests(),
        ledger.listInbox('PLAYER'),
      ]);
      setState({ loading: false, snapshot, achievements, rules, payments, requests, inbox });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load-failed');
      setState((s) => ({ ...s, loading: false }));
    }
  }, [ledger]);

  const dismissInboxEntry = useCallback(
    async (eventId: string) => {
      try {
        await ledger.deleteInboxEntry('PLAYER', eventId);
        setState((s) => ({ ...s, inbox: s.inbox.filter((e) => e.eventId !== eventId) }));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'dismiss-failed');
      }
    },
    [ledger, toast],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await lambda.post('/snapshot', {});
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`refresh failed: ${res.status} ${text.slice(0, 200)}`);
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'refresh-failed');
    } finally {
      setRefreshing(false);
    }
  }, [lambda, reload]);

  // Initial load: hit DDB first, then trigger CodinGame fetch automatically
  // if no snapshot exists yet so the user doesn't have to click Refresh.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await reload();
      if (cancelled) return;
      // After reload, if state.snapshot is still null, kick a fetch.
      // We re-read via state setter to avoid a stale-closure dep.
      setState((s) => {
        if (!s.snapshot && !cancelled) {
          void handleRefresh();
        }
        return s;
      });
    })();
    return () => {
      cancelled = true;
    };
    // handleRefresh is intentionally omitted — it depends on reload which
    // already changes when ledger changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  const lines: OutstandingLine[] = computeOutstandingLines(state);
  const t = totals(lines);
  const outstandingLines = lines.filter((l) => !l.paid && l.currentUnitPrice !== null);

  // Send (or re-send) the SNS notification for a request id without writing
  // a new REQUEST row. Used both by the normal submit flow and by the
  // "Re-notify" action on a duplicate.
  const sendNotify = useCallback(
    async (requestId: string, lineCount: number, totalAmount: number) => {
      const res = await lambda.post('/notify-payment-request', {
        requestId,
        subject: `Payment request: ${lineCount} item(s)`,
        message: `Player requested ${formatMoney(totalAmount)} for ${lineCount} item(s)`,
      });
      if (!res.ok) throw new Error(`notify failed: ${res.status}`);
    },
    [lambda],
  );

  const handleRequestPayment = useCallback(async () => {
    if (outstandingLines.length === 0) return;
    setRequesting(true);
    setError(null);
    setDuplicateNotice(null);
    try {
      const candidateKeys = outstandingLines.map((l) => l.achievementKey);
      const totalAmount = outstandingLines.reduce((s, l) => s + (l.currentUnitPrice ?? 0), 0);
      const duplicate = findDuplicatePendingRequest(state.requests, candidateKeys);

      if (duplicate) {
        // Don't write a new REQUEST; surface the existing one.
        setDuplicateNotice(
          `You already have a pending request for these ${candidateKeys.length} item(s), submitted ${duplicate.requestedAt}. Click "Re-send notification" to email the payer again.`,
        );
        return;
      }

      const requestId = `req-${now().getTime().toString(36)}`;
      const requestedAt = now().toISOString();
      const req: PaymentRequest = {
        requestId,
        requestedAt,
        achievementKeys: candidateKeys,
        totalAmount,
        currency: APP_CURRENCY,
        status: 'PENDING',
      };
      await ledger.submitPaymentRequest(req);
      await sendNotify(requestId, candidateKeys.length, totalAmount);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'request-failed');
    } finally {
      setRequesting(false);
    }
  }, [outstandingLines, state.requests, ledger, now, reload, sendNotify]);

  const cancelRequest = useCallback(
    async (r: PaymentRequest) => {
      const ok = await toast.confirm('Cancel this payment request? It will be removed.');
      if (!ok) return;
      setError(null);
      try {
        await ledger.deletePaymentRequest(r);
        setState((s) => ({
          ...s,
          requests: s.requests.filter((x) => x.requestId !== r.requestId),
        }));
        toast.success('Request cancelled.');
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'cancel-failed';
        setError(msg);
        toast.error(`Cancel failed: ${msg}`);
      }
    },
    [ledger, toast],
  );

  const handleResendNotify = useCallback(async () => {
    setRequesting(true);
    setError(null);
    try {
      const candidateKeys = outstandingLines.map((l) => l.achievementKey);
      const totalAmount = outstandingLines.reduce((s, l) => s + (l.currentUnitPrice ?? 0), 0);
      const duplicate = findDuplicatePendingRequest(state.requests, candidateKeys);
      if (!duplicate) {
        setDuplicateNotice(null);
        return;
      }
      await sendNotify(duplicate.requestId, candidateKeys.length, totalAmount);
      setDuplicateNotice(`Re-sent notification for request ${duplicate.requestId}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'notify-failed');
    } finally {
      setRequesting(false);
    }
  }, [outstandingLines, state.requests, sendNotify]);

  if (state.loading) return <p>Loading…</p>;

  return (
    <section aria-labelledby="player-heading">
      <h2 id="player-heading">My achievements</h2>
      {error && <p role="alert">{error}</p>}
      {duplicateNotice && (
        <div className="duplicate-notice" role="status">
          <p>{duplicateNotice}</p>
          <button onClick={handleResendNotify} disabled={requesting}>
            Re-send notification
          </button>{' '}
          <button onClick={() => setDuplicateNotice(null)} disabled={requesting}>
            Dismiss
          </button>
        </div>
      )}

      <div className="actions">
        <button onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh from CodinGame'}
        </button>
        <button
          onClick={handleRequestPayment}
          disabled={requesting || outstandingLines.length === 0}
        >
          {requesting ? 'Requesting…' : `Request payment (${outstandingLines.length} item(s))`}
        </button>
      </div>

      <dl className="totals">
        <dt>Outstanding</dt>
        <dd>
          {formatMoney(t.unpaidAmount)} ({t.unpaidLines} item(s))
        </dd>
        <dt>Paid to date</dt>
        <dd>{formatMoney(t.paidAmount)}</dd>
      </dl>

      {state.snapshot && (
        <p>
          Last snapshot: {state.snapshot.fetchedAt} · {state.snapshot.totalAchievements} badges ·
          rank {state.snapshot.overallRank} · XP {state.snapshot.xp}
        </p>
      )}

      <h3>Achievements</h3>
      {lines.length === 0 ? (
        <p>No achievements detected yet. Click "Refresh from CodinGame".</p>
      ) : (
        <>
          <div className="actions" style={{ marginBottom: '0.6rem' }}>
            {(['all', 'paid', 'outstanding', 'unpriced'] as const).map((f) => {
              const count =
                f === 'all'
                  ? lines.length
                  : f === 'paid'
                    ? lines.filter((l) => l.paid).length
                    : f === 'outstanding'
                      ? lines.filter((l) => !l.paid && l.currentUnitPrice !== null).length
                      : lines.filter((l) => !l.paid && l.currentUnitPrice === null).length;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setAchievementFilter(f)}
                  style={{
                    background:
                      achievementFilter === f ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: achievementFilter === f ? 'var(--bg)' : 'var(--fg)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)} ({count})
                </button>
              );
            })}
          </div>
          <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            {lines
              .filter((l) => {
                if (achievementFilter === 'all') return true;
                if (achievementFilter === 'paid') return Boolean(l.paid);
                if (achievementFilter === 'outstanding')
                  return !l.paid && l.currentUnitPrice !== null;
                // unpriced
                return !l.paid && l.currentUnitPrice === null;
              })
              .map((l) => (
              <tr key={l.achievementKey}>
                <td>
                  {l.title}
                  {l.badgeLevel && (
                    <span style={{ color: 'var(--fg-dim)', marginLeft: '0.5rem' }}>
                      ({l.badgeLevel})
                    </span>
                  )}
                </td>
                <td>
                  {l.paid
                    ? 'Paid'
                    : l.currentUnitPrice === null
                      ? l.badgeLevel
                        ? `Unpriced — payer should add a Badge ${l.badgeLevel} rule`
                        : 'Unpriced'
                      : 'Outstanding'}
                </td>
                <td>
                  {l.paid
                    ? formatMoney(l.paid.unitPriceAtPayment)
                    : l.currentUnitPrice === null
                      ? '—'
                      : formatMoney(l.currentUnitPrice)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </>
      )}

      <h3>From the payer</h3>
      {state.inbox.length === 0 ? (
        <p>No messages.</p>
      ) : (
        <ul>
          {state.inbox.map((e) => (
            <li key={e.eventId}>
              <strong>{e.subject}</strong> — {e.message}{' '}
              <button
                type="button"
                aria-label={`dismiss-player-inbox-${e.eventId}`}
                onClick={() => dismissInboxEntry(e.eventId)}
              >
                Dismiss
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3>My requests</h3>
      {state.requests.length === 0 ? (
        <p>No requests submitted.</p>
      ) : (
        <ul>
          {state.requests.map((r) => (
            <li key={r.requestId}>
              {r.requestedAt} · {formatMoney(r.totalAmount)} · {r.status}
              {r.status === 'PENDING' && (
                <>
                  {' '}
                  <button
                    type="button"
                    aria-label={`cancel-${r.requestId}`}
                    onClick={() => cancelRequest(r)}
                    disabled={requesting}
                  >
                    Cancel
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
