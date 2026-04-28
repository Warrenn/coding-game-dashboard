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
    deletePricingRule: jest.fn(async () => undefined),
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

  it('adds a badge-level pricing rule via ledger.upsertPricingRule', async () => {
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

  it('adds an xp-milestone rule when kind=XP milestone is selected', async () => {
    const ledger = fakeLedger();
    render(<AgreementPage ledger={ledger} role="PAYER" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /add rule/i })).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText(/^Kind/i), { target: { value: 'xp-milestone' } });
    fireEvent.change(screen.getByLabelText(/^Every \(XP\)/i), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText(/Unit price/i), { target: { value: '3' } });

    await act(async () => {
      screen.getByRole('button', { name: /add rule/i }).click();
    });

    const arg = (ledger.upsertPricingRule as jest.Mock).mock.calls[0][0] as PricingRule & {
      every: number;
    };
    expect(arg.kind).toBe('xp-milestone');
    expect(arg.every).toBe(500);
    expect(arg.unitPrice).toBe(3);
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

describe('AgreementPage — payer can edit and delete rules', () => {
  it('Edit button reveals an inline price input; Save calls upsertPricingRule', async () => {
    const ledger = fakeLedger();
    render(<AgreementPage ledger={ledger} role="PAYER" />);
    await waitFor(() => expect(screen.getByText(/Badge GOLD/)).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'edit-r1' }));
    });

    const input = screen.getByLabelText('edit-price-r1');
    fireEvent.change(input, { target: { value: '25' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(ledger.upsertPricingRule).toHaveBeenCalled();
    const arg = (ledger.upsertPricingRule as jest.Mock).mock.calls[0][0] as PricingRule;
    expect(arg.ruleId).toBe('r1');
    expect(arg.kind).toBe('badge-level');
    expect(arg.unitPrice).toBe(25);
  });

  it('Cancel during edit discards the draft and leaves the rule unchanged', async () => {
    const ledger = fakeLedger();
    render(<AgreementPage ledger={ledger} role="PAYER" />);
    await waitFor(() => expect(screen.getByText(/Badge GOLD/)).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'edit-r1' }));
    });
    fireEvent.change(screen.getByLabelText('edit-price-r1'), { target: { value: '99' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });

    expect(ledger.upsertPricingRule).not.toHaveBeenCalled();
  });

  it('Delete button removes the rule via deletePricingRule (after confirm)', async () => {
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    try {
      const ledger = fakeLedger();
      render(<AgreementPage ledger={ledger} role="PAYER" />);
      await waitFor(() => expect(screen.getByText(/Badge GOLD/)).toBeInTheDocument());

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'delete-r1' }));
      });

      expect(ledger.deletePricingRule).toHaveBeenCalledWith('r1');
      // Optimistic UI removes the row immediately.
      expect(screen.queryByText(/Badge GOLD/)).not.toBeInTheDocument();
    } finally {
      window.confirm = originalConfirm;
    }
  });

  it('Delete is a no-op when user cancels the confirm dialog', async () => {
    const originalConfirm = window.confirm;
    window.confirm = () => false;
    try {
      const ledger = fakeLedger();
      render(<AgreementPage ledger={ledger} role="PAYER" />);
      await waitFor(() => expect(screen.getByText(/Badge GOLD/)).toBeInTheDocument());

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'delete-r1' }));
      });

      expect(ledger.deletePricingRule).not.toHaveBeenCalled();
      expect(screen.getByText(/Badge GOLD/)).toBeInTheDocument();
    } finally {
      window.confirm = originalConfirm;
    }
  });

  it('Player role does not see Edit/Delete buttons', async () => {
    render(<AgreementPage ledger={fakeLedger()} role="PLAYER" />);
    await waitFor(() => expect(screen.getByText(/Badge GOLD/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'edit-r1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'delete-r1' })).not.toBeInTheDocument();
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
