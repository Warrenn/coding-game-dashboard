import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  DetectedAchievement,
  InboxEntry,
  Payment,
  PaymentLineItem,
  PaymentRequest,
  PricingRule,
} from '@cgd/shared';
import { computeOutstandingLines, totals } from '../data/derived.js';
import type { WebLedger } from '../data/ledger.js';

interface PayerViewProps {
  ledger: WebLedger;
  /** Override clock for tests. */
  now?: () => Date;
}

interface DataState {
  loading: boolean;
  achievements: DetectedAchievement[];
  rules: PricingRule[];
  payments: Payment[];
  requests: PaymentRequest[];
  inbox: InboxEntry[];
}

const INITIAL: DataState = {
  loading: true,
  achievements: [],
  rules: [],
  payments: [],
  requests: [],
  inbox: [],
};

export function PayerView({ ledger, now = () => new Date() }: PayerViewProps) {
  const [state, setState] = useState<DataState>(INITIAL);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [achievements, rules, payments, requests, inbox] = await Promise.all([
        ledger.listAchievements(),
        ledger.listPricingRules(),
        ledger.listPayments(),
        ledger.listRequests(),
        ledger.listInbox('PAYER'),
      ]);
      setState({ loading: false, achievements, rules, payments, requests, inbox });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load-failed');
      setState((s) => ({ ...s, loading: false }));
    }
  }, [ledger]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const lines = useMemo(() => computeOutstandingLines(state), [state]);
  const t = totals(lines);
  const outstanding = lines.filter((l) => !l.paid && l.currentUnitPrice !== null);

  const selectedTotal = outstanding
    .filter((l) => selected.has(l.achievementKey))
    .reduce((s, l) => s + (l.currentUnitPrice ?? 0), 0);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleRecordPayment = useCallback(async () => {
    if (selected.size === 0) return;
    setRecording(true);
    setError(null);
    try {
      const lineItems: PaymentLineItem[] = outstanding
        .filter((l) => selected.has(l.achievementKey))
        .map((l) => ({
          achievementKey: l.achievementKey,
          unitPriceAtPayment: l.currentUnitPrice ?? 0,
          quantity: 1,
          description: l.title,
        }));
      const paidAt = now().toISOString();
      const payment: Payment = {
        paymentId: `pay-${now().getTime().toString(36)}`,
        paidAt,
        totalAmount: lineItems.reduce((s, li) => s + li.unitPriceAtPayment * li.quantity, 0),
        currency: 'USD',
        note: note || undefined,
        lineItems,
      };
      await ledger.recordPayment(payment);
      setSelected(new Set());
      setNote('');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'record-failed');
    } finally {
      setRecording(false);
    }
  }, [selected, outstanding, ledger, now, note, reload]);

  if (state.loading) return <p>Loading…</p>;

  return (
    <section aria-labelledby="payer-heading">
      <h2 id="payer-heading">Ledger</h2>
      {error && <p role="alert">{error}</p>}

      <dl className="totals">
        <dt>Outstanding to player</dt>
        <dd>
          {t.unpaidAmount.toFixed(2)} ({t.unpaidLines} item(s))
        </dd>
        <dt>Paid to date</dt>
        <dd>{t.paidAmount.toFixed(2)}</dd>
      </dl>

      <h3>Inbox</h3>
      {state.inbox.length === 0 ? (
        <p>No payment requests pending.</p>
      ) : (
        <ul>
          {state.inbox.map((e) => (
            <li key={e.eventId}>
              <strong>{e.subject}</strong> — {e.message}
            </li>
          ))}
        </ul>
      )}

      <h3>Record payment</h3>
      {outstanding.length === 0 ? (
        <p>Nothing outstanding.</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>Pay?</th>
                <th>Item</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {outstanding.map((l) => (
                <tr key={l.achievementKey}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`pay-${l.achievementKey}`}
                      checked={selected.has(l.achievementKey)}
                      onChange={() => toggle(l.achievementKey)}
                    />
                  </td>
                  <td>{l.title}</td>
                  <td>{(l.currentUnitPrice ?? 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <label>
            Note (optional){' '}
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
          </label>
          <p>
            Selected total: <strong>{selectedTotal.toFixed(2)}</strong>
          </p>
          <button onClick={handleRecordPayment} disabled={recording || selected.size === 0}>
            {recording ? 'Recording…' : `Record payment (${selected.size} item(s))`}
          </button>
        </>
      )}

      <h3>Payment history</h3>
      {state.payments.length === 0 ? (
        <p>No payments recorded yet.</p>
      ) : (
        <ul>
          {state.payments.map((p) => (
            <li key={p.paymentId}>
              {p.paidAt} — {p.totalAmount.toFixed(2)} {p.currency} ({p.lineItems.length} line(s))
              {p.note && ` — ${p.note}`}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
