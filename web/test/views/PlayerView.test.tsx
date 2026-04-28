import { jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  DetectedAchievement,
  PaymentRequest,
  PricingRule,
  Snapshot,
  Payment,
} from '@cgd/shared';
import { PlayerView } from '../../src/views/PlayerView.js';

const NOW = '2026-04-25T12:00:00.000Z';

const SNAPSHOT: Snapshot = {
  fetchedAt: NOW,
  handle: 'mock-active',
  userId: 9000001,
  pseudo: 'mock-active',
  level: 18,
  xp: 12500,
  overallRank: 5000,
  clashRank: 1234,
  clashTotalPlayers: 50000,
  totalAchievements: 2,
  achievements: [],
};

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
    title: 'Bronze B',
    level: 'BRONZE',
    detectedAt: NOW,
    metadata: {},
  },
];

const RULES: PricingRule[] = [{ ruleId: 'r1', kind: 'badge-level', level: 'GOLD', unitPrice: 10 }];

function fakeLedger(
  opts: {
    payments?: Payment[];
    requests?: PaymentRequest[];
    achievements?: DetectedAchievement[];
  } = {},
) {
  return {
    getLatestSnapshot: jest.fn(async () => SNAPSHOT),
    listAchievements: jest.fn(async () => opts.achievements ?? ACHIEVEMENTS),
    listPricingRules: jest.fn(async () => RULES),
    listPayments: jest.fn(async () => opts.payments ?? []),
    listRequests: jest.fn(async () => opts.requests ?? []),
    listInbox: jest.fn(async () => []),
    submitPaymentRequest: jest.fn(async () => undefined),
    deleteInboxEntry: jest.fn(async () => undefined),
  } as unknown as Parameters<typeof PlayerView>[0]['ledger'];
}

function fakeLambda(opts: { okSnapshot?: boolean; okNotify?: boolean } = {}) {
  return {
    post: jest.fn(async (path: string) => {
      if (path === '/snapshot') {
        return new Response(JSON.stringify({}), { status: opts.okSnapshot === false ? 502 : 200 });
      }
      if (path === '/notify-payment-request') {
        return new Response(JSON.stringify({}), { status: opts.okNotify === false ? 500 : 200 });
      }
      return new Response('', { status: 404 });
    }),
  } as unknown as Parameters<typeof PlayerView>[0]['lambda'];
}

describe('PlayerView', () => {
  it('renders achievements with paid/outstanding status and totals', async () => {
    render(<PlayerView ledger={fakeLedger()} lambda={fakeLambda()} />);
    await waitFor(() => expect(screen.getAllByText('Gold A').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Bronze B').length).toBeGreaterThan(0);
    // Gold A → outstanding 10 ZAR; Bronze B → unpriced (no rule)
    expect(screen.getAllByText(/R[\s ]?10[.,]00/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/1 item\(s\)/).length).toBeGreaterThanOrEqual(1);
  });

  it('refresh button calls /snapshot', async () => {
    const ledger = fakeLedger();
    const lambda = fakeLambda();
    render(<PlayerView ledger={ledger} lambda={lambda} />);
    await waitFor(() => expect(screen.getAllByText('Gold A').length).toBeGreaterThan(0));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /refresh from codingame/i }));
    });

    await waitFor(() => expect(lambda.post).toHaveBeenCalledWith('/snapshot', {}));
  });

  it('request payment writes REQUEST and calls /notify-payment-request', async () => {
    const ledger = fakeLedger();
    const lambda = fakeLambda();
    render(<PlayerView ledger={ledger} lambda={lambda} now={() => new Date(NOW)} />);
    await waitFor(() => expect(screen.getAllByText('Gold A').length).toBeGreaterThan(0));

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /request payment for 1 item\(s\)/i }),
      );
    });

    expect(ledger.submitPaymentRequest).toHaveBeenCalled();
    expect(lambda.post).toHaveBeenCalledWith(
      '/notify-payment-request',
      expect.objectContaining({ subject: expect.stringContaining('1 item') }),
    );
  });

  it('shows surface error when refresh fails', async () => {
    const lambda = fakeLambda({ okSnapshot: false });
    render(<PlayerView ledger={fakeLedger()} lambda={lambda} />);
    await waitFor(() => expect(screen.getAllByText('Gold A').length).toBeGreaterThan(0));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /refresh from codingame/i }));
    });
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('shows empty-state message when no achievements detected', async () => {
    const ledger = fakeLedger({ achievements: [] });
    render(<PlayerView ledger={ledger} lambda={fakeLambda()} />);
    await waitFor(() =>
      expect(screen.getByText(/No achievements detected yet/)).toBeInTheDocument(),
    );
  });

  it('shows "Nothing outstanding to request" when no outstanding lines', async () => {
    const ledger = fakeLedger({
      // Only Bronze, which has no rule → unpriced, not outstanding
      achievements: [ACHIEVEMENTS[1]],
    });
    render(<PlayerView ledger={ledger} lambda={fakeLambda()} />);
    await waitFor(() =>
      expect(screen.getByText(/Nothing outstanding to request/i)).toBeInTheDocument(),
    );
  });
});
