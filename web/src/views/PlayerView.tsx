import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useModal } from '../ui/modal.js';
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

type LineStatus = 'paid' | 'requested' | 'outstanding' | 'unpriced';

function statusOf(
  line: OutstandingLine,
  pendingByKey: Map<string, PaymentRequest>,
): LineStatus {
  if (line.paid) return 'paid';
  if (line.currentUnitPrice === null) return 'unpriced';
  if (pendingByKey.has(line.achievementKey)) return 'requested';
  return 'outstanding';
}

const STATUS_LABEL: Record<LineStatus, string> = {
  paid: 'Paid',
  requested: 'Requested',
  outstanding: 'Outstanding',
  unpriced: 'Unpriced',
};

// Order matters: shown left → right. "All" rightmost per requested layout.
const FILTERS: ('outstanding' | 'requested' | 'paid' | 'unpriced' | 'all')[] = [
  'outstanding',
  'requested',
  'paid',
  'unpriced',
  'all',
];

export function PlayerView({ ledger, lambda, now = () => new Date() }: PlayerViewProps) {
  const toast = useToast();
  const modal = useModal();
  const [state, setState] = useState<DataState>(INITIAL);
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('outstanding');

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

  // Initial load + auto-fetch when no snapshot.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await reload();
      if (cancelled) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  const lines: OutstandingLine[] = computeOutstandingLines(state);
  const t = totals(lines);

  // Map every achievementKey that's in any PENDING request → that request.
  // Used to compute per-row status and to find what to cancel.
  const pendingByKey = useMemo(() => {
    const m = new Map<string, PaymentRequest>();
    for (const r of state.requests) {
      if (r.status !== 'PENDING') continue;
      for (const k of r.achievementKeys) {
        if (!m.has(k)) m.set(k, r);
      }
    }
    return m;
  }, [state.requests]);

  const lineStatuses = useMemo(
    () => new Map(lines.map((l) => [l.achievementKey, statusOf(l, pendingByKey)])),
    [lines, pendingByKey],
  );

  const counts: Record<(typeof FILTERS)[number], number> = {
    outstanding: 0,
    requested: 0,
    paid: 0,
    unpriced: 0,
    all: lines.length,
  };
  for (const l of lines) {
    const s = lineStatuses.get(l.achievementKey)!;
    counts[s]++;
  }

  const visibleLines = lines.filter((l) =>
    filter === 'all' ? true : lineStatuses.get(l.achievementKey) === filter,
  );

  const requestSingle = useCallback(
    async (line: OutstandingLine) => {
      if (line.currentUnitPrice == null) return;
      setBusyKey(line.achievementKey);
      setError(null);
      try {
        const requestId = `req-${now().getTime().toString(36)}-${line.achievementKey
          .replace(/[^A-Za-z0-9]/g, '')
          .slice(0, 8)}`;
        const requestedAt = now().toISOString();
        const req: PaymentRequest = {
          requestId,
          requestedAt,
          achievementKeys: [line.achievementKey],
          totalAmount: line.currentUnitPrice,
          currency: APP_CURRENCY,
          status: 'PENDING',
        };
        await ledger.submitPaymentRequest(req);
        const res = await lambda.post('/notify-payment-request', {
          requestId,
          subject: `Payment request: ${line.title}`,
          message: `Player requested ${formatMoney(line.currentUnitPrice)} for "${line.title}"`,
        });
        if (!res.ok) throw new Error(`notify failed: ${res.status}`);
        await reload();
        toast.success(`Requested payment for ${line.title}.`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'request-failed';
        setError(msg);
        toast.error(`Request failed: ${msg}`);
      } finally {
        setBusyKey(null);
      }
    },
    [ledger, lambda, now, reload, toast],
  );

  const cancelKey = useCallback(
    async (line: OutstandingLine) => {
      const matching = state.requests.filter(
        (r) => r.status === 'PENDING' && r.achievementKeys.includes(line.achievementKey),
      );
      if (matching.length === 0) return;
      const ok = await modal.confirm({
        title: 'Cancel payment request?',
        message:
          matching.some((r) => r.achievementKeys.length > 1)
            ? `This is part of a request that also includes other items. Cancelling here will cancel the whole request (${matching.reduce((s, r) => s + r.achievementKeys.length, 0)} items).`
            : 'The request will be removed.',
        confirmLabel: 'Cancel request',
        cancelLabel: 'Keep',
        danger: true,
      });
      if (!ok) return;

      setBusyKey(line.achievementKey);
      setError(null);
      try {
        for (const r of matching) {
          await ledger.deletePaymentRequest(r);
        }
        const cancelled = new Set(matching.map((r) => r.requestId));
        setState((s) => ({
          ...s,
          requests: s.requests.filter((r) => !cancelled.has(r.requestId)),
        }));
        toast.success('Request cancelled.');
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'cancel-failed';
        setError(msg);
        toast.error(`Cancel failed: ${msg}`);
      } finally {
        setBusyKey(null);
      }
    },
    [ledger, modal, state.requests, toast],
  );

  if (state.loading) return <p>Loading…</p>;

  return (
    <section aria-labelledby="player-heading">
      <h2 id="player-heading">My achievements</h2>
      {error && <p role="alert">{error}</p>}

      <div className="actions">
        <button onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh from CodinGame'}
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
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? 'var(--accent)' : 'var(--bg-elevated)',
                  color: filter === f ? 'var(--bg)' : 'var(--fg)',
                  border: '1px solid var(--border)',
                  // 'all' floats right per the requested layout.
                  ...(f === 'all' ? { marginLeft: 'auto' } : {}),
                }}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
              </button>
            ))}
          </div>
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Price</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleLines.map((l) => {
                const s = lineStatuses.get(l.achievementKey)!;
                return (
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
                      {STATUS_LABEL[s]}
                      {s === 'unpriced' && l.badgeLevel && (
                        <span style={{ color: 'var(--fg-dim)', marginLeft: '0.4rem' }}>
                          — payer should add a Badge {l.badgeLevel} rule
                        </span>
                      )}
                    </td>
                    <td>
                      {l.paid
                        ? formatMoney(l.paid.unitPriceAtPayment)
                        : l.currentUnitPrice === null
                          ? '—'
                          : formatMoney(l.currentUnitPrice)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {s === 'outstanding' && (
                        <button
                          type="button"
                          aria-label={`request-${l.achievementKey}`}
                          onClick={() => requestSingle(l)}
                          disabled={busyKey !== null}
                        >
                          Request
                        </button>
                      )}
                      {s === 'requested' && (
                        <button
                          type="button"
                          aria-label={`cancel-${l.achievementKey}`}
                          onClick={() => cancelKey(l)}
                          disabled={busyKey !== null}
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
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
    </section>
  );
}
