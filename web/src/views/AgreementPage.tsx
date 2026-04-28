import { useEffect, useState, type FormEvent } from 'react';
import type { AchievementLevel, AgreementMeta, PricingRule } from '@cgd/shared';
import type { WebLedger } from '../data/ledger.js';
import type { Role } from '../auth/types.js';
import { APP_CURRENCY, formatMoney } from '../data/currency.js';
import { useModal } from '../ui/modal.js';
import { useToast } from '../ui/toast.js';

interface AgreementPageProps {
  ledger: WebLedger;
  role: Role;
}

const LEVELS: AchievementLevel[] = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];

function makeRuleId(): string {
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function AgreementPage({ ledger, role }: AgreementPageProps) {
  const toast = useToast();
  const modal = useModal();
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
  // ruleId currently being inline-edited, plus its draft price
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');

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

  function startEdit(rule: PricingRule) {
    setEditingRuleId(rule.ruleId);
    setEditPrice(String(rule.unitPrice));
    setError(null);
  }

  async function saveEdit(rule: PricingRule, e: FormEvent) {
    e.preventDefault();
    if (!isPayer) return;
    const price = Number(editPrice);
    if (!Number.isFinite(price) || price < 0) {
      setError('price must be a non-negative number');
      return;
    }
    const updated: PricingRule = { ...rule, unitPrice: price };
    setSaving(true);
    setError(null);
    try {
      await ledger.upsertPricingRule(updated);
      setRules((prev) => prev.map((r) => (r.ruleId === rule.ruleId ? updated : r)));
      setEditingRuleId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save-failed');
    } finally {
      setSaving(false);
    }
  }

  async function deleteRule(ruleId: string) {
    if (!isPayer) return;
    const ok = await modal.confirm({
      title: 'Delete pricing rule?',
      message: 'Any payments already recorded against it stay paid.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      await ledger.deletePricingRule(ruleId);
      setRules((prev) => prev.filter((r) => r.ruleId !== ruleId));
      if (editingRuleId === ruleId) setEditingRuleId(null);
      toast.success('Pricing rule deleted.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'delete-failed';
      setError(msg);
      toast.error(`Delete failed: ${msg}`);
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
          {rules.map((r) => {
            const label =
              r.kind === 'badge-level'
                ? `Badge ${r.level}`
                : r.kind === 'xp-milestone'
                  ? `Every ${r.every} XP`
                  : r.kind;
            const isEditing = editingRuleId === r.ruleId;
            return (
              <li key={r.ruleId}>
                {label} →{' '}
                {isEditing ? (
                  <form
                    onSubmit={(e) => saveEdit(r, e)}
                    style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}
                  >
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editPrice}
                      aria-label={`edit-price-${r.ruleId}`}
                      onChange={(e) => setEditPrice(e.target.value)}
                      required
                    />
                    <button type="submit" disabled={saving}>
                      Save
                    </button>
                    <button type="button" onClick={() => setEditingRuleId(null)} disabled={saving}>
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    {formatMoney(r.unitPrice)}
                    {isPayer && (
                      <>
                        {' '}
                        <button
                          type="button"
                          aria-label={`edit-${r.ruleId}`}
                          onClick={() => startEdit(r)}
                          disabled={saving}
                        >
                          Edit
                        </button>{' '}
                        <button
                          type="button"
                          aria-label={`delete-${r.ruleId}`}
                          onClick={() => deleteRule(r.ruleId)}
                          disabled={saving}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </>
                )}
              </li>
            );
          })}
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
