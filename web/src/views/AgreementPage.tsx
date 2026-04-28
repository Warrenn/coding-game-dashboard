import { useEffect, useState, type FormEvent } from 'react';
import type { AchievementLevel, AgreementMeta, PricingRule } from '@cgd/shared';
import type { WebLedger } from '../data/ledger.js';
import type { Role } from '../auth/types.js';
import { APP_CURRENCY, formatMoney } from '../data/currency.js';

interface AgreementPageProps {
  ledger: WebLedger;
  role: Role;
}

const LEVELS: AchievementLevel[] = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];

function makeRuleId(): string {
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function AgreementPage({ ledger, role }: AgreementPageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<AgreementMeta | null>(null);
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [saving, setSaving] = useState(false);

  // Local edit state (used only by PAYER role)
  const [handleField, setHandleField] = useState('');
  const [newRuleKind, setNewRuleKind] = useState<'badge-level' | 'xp-milestone'>('badge-level');
  const [newRuleLevel, setNewRuleLevel] = useState<AchievementLevel>('BRONZE');
  const [newRuleEvery, setNewRuleEvery] = useState('1000');
  const [newRulePrice, setNewRulePrice] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([ledger.getAgreementMeta(), ledger.listPricingRules()])
      .then(([m, r]) => {
        if (cancelled) return;
        setMeta(m);
        setRules(r);
        if (m) {
          setHandleField(m.handle);
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'load-failed'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [ledger]);

  const isPayer = role === 'PAYER';

  async function saveMeta(e: FormEvent) {
    e.preventDefault();
    if (!isPayer) return;
    setSaving(true);
    setError(null);
    try {
      const next: AgreementMeta = {
        handle: handleField.trim(),
        currency: APP_CURRENCY,
        updatedAt: new Date().toISOString(),
      };
      await ledger.putAgreementMeta(next);
      setMeta(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save-failed');
    } finally {
      setSaving(false);
    }
  }

  async function addRule(e: FormEvent) {
    e.preventDefault();
    if (!isPayer) return;
    const price = Number(newRulePrice);
    if (!Number.isFinite(price) || price < 0) {
      setError('price must be a non-negative number');
      return;
    }
    let rule: PricingRule;
    if (newRuleKind === 'badge-level') {
      rule = {
        ruleId: makeRuleId(),
        kind: 'badge-level',
        level: newRuleLevel,
        unitPrice: price,
      };
    } else {
      const every = Math.floor(Number(newRuleEvery));
      if (!Number.isFinite(every) || every <= 0) {
        setError('XP increment must be a positive integer');
        return;
      }
      rule = {
        ruleId: makeRuleId(),
        kind: 'xp-milestone',
        every,
        unitPrice: price,
      };
    }
    setSaving(true);
    setError(null);
    try {
      await ledger.upsertPricingRule(rule);
      setRules((prev) => [...prev, rule]);
      setNewRulePrice('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save-failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading agreement…</p>;

  return (
    <section aria-labelledby="agreement-heading">
      <h2 id="agreement-heading">Agreement</h2>

      {error && <p role="alert">{error}</p>}

      <h3>Profile</h3>
      <p>
        Currency: <strong>{APP_CURRENCY}</strong> (fixed)
      </p>
      {isPayer ? (
        <form onSubmit={saveMeta}>
          <label>
            CodinGame handle{' '}
            <input
              value={handleField}
              onChange={(e) => setHandleField(e.target.value)}
              placeholder="hex-handle"
              required
            />
          </label>
          <button type="submit" disabled={saving}>
            Save profile
          </button>
        </form>
      ) : (
        <dl>
          <dt>Handle</dt>
          <dd>{meta?.handle ?? '(not set)'}</dd>
          <dt>Updated</dt>
          <dd>{meta?.updatedAt ?? '—'}</dd>
        </dl>
      )}

      <h3>Pricing rules</h3>
      {rules.length === 0 ? (
        <p>No pricing rules configured.</p>
      ) : (
        <ul>
          {rules.map((r) => (
            <li key={r.ruleId}>
              {r.kind === 'badge-level' && (
                <>
                  Badge {r.level} → {formatMoney(r.unitPrice)}
                </>
              )}
              {r.kind === 'xp-milestone' && (
                <>
                  Every {r.every} XP → {formatMoney(r.unitPrice)}
                </>
              )}
              {r.kind !== 'badge-level' && r.kind !== 'xp-milestone' && (
                <>
                  {r.kind} → {formatMoney(r.unitPrice)}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {isPayer && (
        <form onSubmit={addRule}>
          <label>
            Kind{' '}
            <select
              value={newRuleKind}
              onChange={(e) => setNewRuleKind(e.target.value as 'badge-level' | 'xp-milestone')}
            >
              <option value="badge-level">Badge level</option>
              <option value="xp-milestone">XP milestone</option>
            </select>
          </label>
          {newRuleKind === 'badge-level' ? (
            <label>
              Level{' '}
              <select
                value={newRuleLevel}
                onChange={(e) => setNewRuleLevel(e.target.value as AchievementLevel)}
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Every (XP){' '}
              <input
                type="number"
                step="1"
                min="1"
                value={newRuleEvery}
                onChange={(e) => setNewRuleEvery(e.target.value)}
                required
              />
            </label>
          )}
          <label>
            Unit price{' '}
            <input
              type="number"
              step="0.01"
              min="0"
              value={newRulePrice}
              onChange={(e) => setNewRulePrice(e.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={saving}>
            Add rule
          </button>
        </form>
      )}
    </section>
  );
}
