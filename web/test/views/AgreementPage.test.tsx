import { jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AgreementMeta, PricingRule } from '@cgd/shared';
import { AgreementPage } from '../../src/views/AgreementPage.js';

const SAMPLE_META: AgreementMeta = {
  handle: 'mock-active',
  currency: 'USD',
  updatedAt: '2026-04-25T12:00:00.000Z',
};

const SAMPLE_RULE: PricingRule = {
  ruleId: 'r1',
  kind: 'badge-level',
  level: 'GOLD',
  unitPrice: 10,
};

function fakeLedger(overrides: Partial<Record<string, unknown>> = {}) {
  const base = {
    getAgreementMeta: jest.fn(async () => SAMPLE_META),
    listPricingRules: jest.fn(async () => [SAMPLE_RULE]),
    putAgreementMeta: jest.fn(async () => undefined),
    upsertPricingRule: jest.fn(async () => undefined),
  };
  return Object.assign(base, overrides) as unknown as Parameters<typeof AgreementPage>[0]['ledger'];
}

describe('AgreementPage — player (read-only)', () => {
  it('renders handle, currency notice, and rule list', async () => {
    render(<AgreementPage ledger={fakeLedger()} role="PLAYER" />);
    await waitFor(() => expect(screen.getByText('mock-active')).toBeInTheDocument());
    expect(screen.getByText('ZAR')).toBeInTheDocument();
    expect(screen.getByText(/Badge GOLD/)).toBeInTheDocument();
  });

  it('shows no edit forms', async () => {
    render(<AgreementPage ledger={fakeLedger()} role="PLAYER" />);
    await waitFor(() => expect(screen.getByText('mock-active')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /save profile/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add rule/i })).not.toBeInTheDocument();
  });
});

describe('AgreementPage — payer (edit)', () => {
  it('shows the edit form pre-filled with existing handle', async () => {
    render(<AgreementPage ledger={fakeLedger()} role="PAYER" />);
    await waitFor(() => expect(screen.getByLabelText(/CodinGame handle/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/CodinGame handle/i)).toHaveValue('mock-active');
    // Currency is fixed to ZAR — no input rendered, just a static notice.
    expect(screen.queryByLabelText(/^Currency/i)).not.toBeInTheDocument();
    // ZAR is rendered inside a <strong>; assert that strong contains it.
    expect(screen.getByText('ZAR')).toBeInTheDocument();
  });

  it('saves profile via ledger.putAgreementMeta', async () => {
    const ledger = fakeLedger();
    render(<AgreementPage ledger={ledger} role="PAYER" />);
    await waitFor(() => expect(screen.getByLabelText(/CodinGame handle/i)).toBeInTheDocument());

    const handle = screen.getByLabelText(/CodinGame handle/i);
    fireEvent.change(handle, { target: { value: 'new-handle' } });

    await act(async () => {
      screen.getByRole('button', { name: /save profile/i }).click();
    });

    expect(ledger.putAgreementMeta).toHaveBeenCalled();
    const arg = (ledger.putAgreementMeta as jest.Mock).mock.calls[0][0] as { handle: string };
    expect(arg.handle).toBe('new-handle');
  });

  it('adds a pricing rule via ledger.upsertPricingRule', async () => {
    const ledger = fakeLedger();
    render(<AgreementPage ledger={ledger} role="PAYER" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /add rule/i })).toBeInTheDocument(),
    );

    const price = screen.getByLabelText(/Unit price/i);
    fireEvent.change(price, { target: { value: '15' } });

    await act(async () => {
      screen.getByRole('button', { name: /add rule/i }).click();
    });

    expect(ledger.upsertPricingRule).toHaveBeenCalled();
    const arg = (ledger.upsertPricingRule as jest.Mock).mock.calls[0][0] as PricingRule;
    expect(arg.kind).toBe('badge-level');
    expect(arg.unitPrice).toBe(15);
  });

  it('surfaces load errors', async () => {
    const ledger = fakeLedger({
      getAgreementMeta: jest.fn(async () => {
        throw new Error('boom');
      }),
    });
    render(<AgreementPage ledger={ledger} role="PAYER" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/boom/));
  });
});

describe('AgreementPage — empty state', () => {
  it('shows "no rules" message when no rules exist', async () => {
    const ledger = fakeLedger({ listPricingRules: jest.fn(async () => []) });
    render(<AgreementPage ledger={ledger} role="PAYER" />);
    await waitFor(() =>
      expect(screen.getByText(/No pricing rules configured/i)).toBeInTheDocument(),
    );
  });

  it('shows "(not set)" for player view when meta is null', async () => {
    const ledger = fakeLedger({
      getAgreementMeta: jest.fn(async () => null),
      listPricingRules: jest.fn(async () => []),
    });
    render(<AgreementPage ledger={ledger} role="PLAYER" />);
    await waitFor(() => expect(screen.getByText(/\(not set\)/)).toBeInTheDocument());
  });
});
