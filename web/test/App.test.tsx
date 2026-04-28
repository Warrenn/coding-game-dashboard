import { render, screen, waitFor } from '@testing-library/react';
import { App } from '../src/App.js';
import { _resetConfigCacheForTests } from '../src/config.js';

const FAKE_CONFIG = {
  region: 'us-east-1',
  identityPoolId: 'us-east-1:fake',
  googleClientId: 'fake.apps.googleusercontent.com',
  ledgerTable: 'fake-table',
  lambdaUrl: 'https://fake.lambda-url.us-east-1.on.aws/',
};

describe('App', () => {
  beforeEach(() => {
    _resetConfigCacheForTests();
    // Reset module-level cache by re-importing not needed in jsdom; just stub fetch.
    (globalThis as { fetch: typeof fetch }).fetch = (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => FAKE_CONFIG,
      }) as unknown as Response) as typeof fetch;
  });

  it('renders the dashboard heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /coding-game dashboard/i })).toBeInTheDocument();
  });

  it('shows config error when /config.json fetch fails', async () => {
    (globalThis as { fetch: typeof fetch }).fetch = (async () =>
      ({ ok: false, status: 404 }) as unknown as Response) as typeof fetch;
    render(<App />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent(/config\.json/i);
  });
});
