import { useCallback, useEffect, useState } from 'react';
import type { DetectedAchievement, PaymentRequest, PricingRule, Snapshot } from '@cgd/shared';
import type { Payment } from '@cgd/shared';
import { computeOutstandingLines, totals, type OutstandingLine } from '../data/derived.js';
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
}

const INITIAL: DataState = {
  loading: true,
  snapshot: null,
  achievements: [],
  rules: [],
  payments: [],
  requests: [],
};

export function PlayerView({ ledger, lambda, now = () => new Date() }: PlayerViewProps) {
  const [state, setState] = useState<DataState>(INITIAL);
  const [refreshing, setRefreshing] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [snapshot, achievements, rules, payments, requests] = await Promise.all([
        ledger.getLatestSnapshot(),
        ledger.listAchievements(),
        ledger.listPricingRules(),
        ledger.listPayments(),
        ledger.listRequests(),
      ]);
      setState({ loading: false, snapshot, achievements, rules, payments, requests });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load-failed');
      setState((s) => ({ ...s, loading: false }));
    }
  }, [ledger]);

  useEffect(() => {
    void reload();
  }, [reload]);

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

  const lines: OutstandingLine[] = computeOutstandingLines(state);
  const t = totals(lines);
  const outstandingLines = lines.filter((l) => !l.paid && l.currentUnitPrice !== null);

  const handleRequestPayment = useCallback(async () => {
    if (outstandingLines.length === 0) return;
    setRequesting(true);
    setError(null);
    try {
      const requestId = `req-${now().getTime().toString(36)}`;
      const requestedAt = now().toISOString();
      const totalAmount = outstandingLines.reduce((s, l) => s + (l.currentUnitPrice ?? 0), 0);
      const req: PaymentRequest = {
        requestId,
        requestedAt,
        achievementKeys: outstandingLines.map((l) => l.achievementKey),
        totalAmount,
        currency: 'USD',
        status: 'PENDING',
      };
      await ledger.submitPaymentRequest(req);
      const res = await lambda.post('/notify-payment-request', {
        requestId,
        subject: `Payment request: ${outstandingLines.length} item(s)`,
        message: `Player requested ${totalAmount} USD for ${outstandingLines.length} item(s)`,
      });
      if (!res.ok) throw new Error(`notify failed: ${res.status}`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'request-failed');
    } finally {
      setRequesting(false);
    }
  }, [outstandingLines, ledger, lambda, now, reload]);

  if (state.loading) return <p>Loading…</p>;

  return (
    <section aria-labelledby="player-heading">
      <h2 id="player-heading">My achievements</h2>
      {error && <p role="alert">{error}</p>}

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
          {t.unpaidAmount.toFixed(2)} ({t.unpaidLines} item(s))
        </dd>
        <dt>Paid to date</dt>
        <dd>{t.paidAmount.toFixed(2)}</dd>
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
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.achievementKey}>
                <td>{l.title}</td>
                <td>
                  {l.paid ? 'Paid' : l.currentUnitPrice === null ? 'Unpriced' : 'Outstanding'}
                </td>
                <td>
                  {l.paid
                    ? l.paid.unitPriceAtPayment.toFixed(2)
                    : l.currentUnitPrice === null
                      ? '—'
                      : l.currentUnitPrice.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>My requests</h3>
      {state.requests.length === 0 ? (
        <p>No requests submitted.</p>
      ) : (
        <ul>
          {state.requests.map((r) => (
            <li key={r.requestId}>
              {r.requestedAt} · {r.totalAmount} {r.currency} · {r.status}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
