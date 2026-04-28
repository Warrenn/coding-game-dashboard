import { jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  DetectedAchievement,
  InboxEntry,
  Payment,
  PaymentRequest,
  PricingRule,
} from '@cgd/shared';
import { PayerView } from '../../src/views/PayerView.js';

const NOW = '2026-04-25T12:00:00.000Z';

const ACHIEVEMENTS: DetectedAchievement[] = [
  {
    achievementKey: 'BADGE#A',
    category: 'BADGE',
    title: 'Gold A',
    level: 'GOLD',
    detectedAt: NOW,
    metadata: {},
  },
  {
    achievementKey: 'BADGE#B',
    category: 'BADGE',
    title: 'Gold B',
    level: 'GOLD',
    detectedAt: NOW,
    metadata: {},
  },
];

const RULES: PricingRule[] = [{ ruleId: 'r1', kind: 'badge-level', level: 'GOLD', unitPrice: 10 }];

function fakeLedger(
  opts: {
    payments?: Payment[];
    requests?: PaymentRequest[];
    inbox?: InboxEntry[];
  } = {},
) {
  return {
    getLatestSnapshot: jest.fn(async () => null),
    listAchievements: jest.fn(async () => ACHIEVEMENTS),
    listPricingRules: jest.fn(async () => RULES),
    listPayments: jest.fn(async () => opts.payments ?? []),
    listRequests: jest.fn(async () => opts.requests ?? []),
    listInbox: jest.fn(async () => opts.inbox ?? []),
    recordPayment: jest.fn(async () => undefined),
    deletePayment: jest.fn(async () => undefined),
    setPaymentRequestStatus: jest.fn(async () => undefined),
    writeInbox: jest.fn(async () => undefined),
  } as unknown as Parameters<typeof PayerView>[0]['ledger'];
}

describe('PayerView', () => {
  it('shows outstanding total and item count', async () => {
    render(<PayerView ledger={fakeLedger()} />);
    await waitFor(() => expect(screen.getByText(/2 item\(s\)/)).toBeInTheDocument());
    // ZAR formatted via Intl: "R 20,00" (en-ZA uses , decimal separator, NBSP after R)
    expect(screen.getByText(/R[\s ]?20[.,]00/)).toBeInTheDocument();
  });

  it('renders inbox entries', async () => {
    const inbox: InboxEntry[] = [
      { eventId: '1', subject: 'Payment requested', message: 'pay me $10', refId: 'req-1' },
    ];
    render(<PayerView ledger={fakeLedger({ inbox })} />);
    await waitFor(() => expect(screen.getByText(/Payment requested/)).toBeInTheDocument());
    expect(screen.getByText(/pay me \$10/)).toBeInTheDocument();
  });

  it('records a payment with checked line items', async () => {
    const ledger = fakeLedger();
    render(<PayerView ledger={ledger} now={() => new Date(NOW)} />);
    await waitFor(() => expect(screen.getByText('Gold A')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByLabelText('pay-BADGE#A'));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /record payment \(1 item\(s\)\)/i }));
    });

    expect(ledger.recordPayment).toHaveBeenCalled();
    const arg = (ledger.recordPayment as jest.Mock).mock.calls[0][0] as Payment;
    expect(arg.lineItems).toHaveLength(1);
    expect(arg.lineItems[0].achievementKey).toBe('BADGE#A');
    expect(arg.lineItems[0].unitPriceAtPayment).toBe(10);
    expect(arg.totalAmount).toBe(10);
  });

  it('disables Record payment when none selected', async () => {
    render(<PayerView ledger={fakeLedger()} />);
    await waitFor(() => expect(screen.getByText('Gold A')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /record payment \(0 item\(s\)\)/i })).toBeDisabled();
  });

  it('shows "Nothing outstanding" when all paid', async () => {
    const payments: Payment[] = [
      {
        paymentId: 'p1',
        paidAt: NOW,
        totalAmount: 20,
        currency: 'USD',
        lineItems: [
          {
            achievementKey: 'BADGE#A',
            unitPriceAtPayment: 10,
            quantity: 1,
            description: '',
          },
          {
            achievementKey: 'BADGE#B',
            unitPriceAtPayment: 10,
            quantity: 1,
            description: '',
          },
        ],
      },
    ];
    render(<PayerView ledger={fakeLedger({ payments })} />);
    await waitFor(() => expect(screen.getByText(/Nothing outstanding/)).toBeInTheDocument());
  });

  it('shows "no payments" empty state when no history', async () => {
    render(<PayerView ledger={fakeLedger()} />);
    await waitFor(() => expect(screen.getByText(/No payments recorded yet/)).toBeInTheDocument());
  });

  it('undo deletes the payment and reverts a PAID request to PENDING', async () => {
    const payments: Payment[] = [
      {
        paymentId: 'p1',
        paidAt: NOW,
        totalAmount: 10,
        currency: 'ZAR',
        lineItems: [
          { achievementKey: 'BADGE#A', unitPriceAtPayment: 10, quantity: 1, description: '' },
        ],
      },
    ];
    const requests: PaymentRequest[] = [
      {
        requestId: 'req-1',
        requestedAt: NOW,
        achievementKeys: ['BADGE#A'],
        totalAmount: 10,
        currency: 'ZAR',
        status: 'PAID',
      },
    ];
    const ledger = fakeLedger({ payments, requests });
    const origConfirm = globalThis.confirm;
    globalThis.confirm = () => true;
    try {
      render(<PayerView ledger={ledger} now={() => new Date(NOW)} />);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'undo-p1' })).toBeInTheDocument(),
      );

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'undo-p1' }));
      });

      await waitFor(() => expect(ledger.deletePayment).toHaveBeenCalled());
      expect(ledger.setPaymentRequestStatus).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: 'req-1' }),
        'PENDING',
      );
      expect(ledger.writeInbox).toHaveBeenCalledWith(
        'PLAYER',
        expect.objectContaining({ subject: 'Payment was undone' }),
      );
    } finally {
      globalThis.confirm = origConfirm;
    }
  });
});
