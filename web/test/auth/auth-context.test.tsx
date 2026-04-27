import { jest } from '@jest/globals';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { AwsCredentialIdentity } from '@aws-sdk/types';
import { AuthProvider, useAuth, PayerOnly, PlayerOnly } from '../../src/auth/index.js';
import type { AuthConfig } from '../../src/auth/index.js';

const CONFIG: AuthConfig = {
  region: 'us-east-1',
  identityPoolId: 'us-east-1:fake-pool',
  payerEmail: 'payer@example.com',
  playerEmail: 'player@example.com',
};

const FAKE_CREDS: AwsCredentialIdentity = {
  accessKeyId: 'AKIA',
  secretAccessKey: 'sk',
  sessionToken: 'st',
};

function makeJwt(payload: Record<string, unknown>): string {
  const b64 = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString('base64').replace(/=+$/, '');
  return `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(payload)}.sig`;
}

describe('AuthProvider', () => {
  function wrapper(extraProps: { exchanger?: () => Promise<AwsCredentialIdentity> } = {}) {
    return ({ children }: { children: React.ReactNode }) => (
      <AuthProvider config={CONFIG} exchanger={extraProps.exchanger ?? (async () => FAKE_CREDS)}>
        {children}
      </AuthProvider>
    );
  }

  it('starts signed-out', () => {
    const { result } = renderHook(() => useAuth(), { wrapper: wrapper() });
    expect(result.current.status).toBe('signed-out');
    expect(result.current.user).toBeNull();
    expect(result.current.role).toBeNull();
    expect(result.current.credentials).toBeNull();
  });

  it('signs in PAYER when token email matches PayerEmail', async () => {
    const exchanger = jest.fn(async () => FAKE_CREDS);
    const { result } = renderHook(() => useAuth(), { wrapper: wrapper({ exchanger }) });
    await act(async () => {
      await result.current.signInWithGoogleToken(
        makeJwt({ email: 'payer@example.com', name: 'P' }),
      );
    });
    expect(result.current.status).toBe('signed-in');
    expect(result.current.role).toBe('PAYER');
    expect(result.current.user?.email).toBe('payer@example.com');
    expect(result.current.user?.name).toBe('P');
    expect(result.current.credentials).toEqual(FAKE_CREDS);
    expect(exchanger).toHaveBeenCalledWith(
      expect.objectContaining({
        identityPoolId: CONFIG.identityPoolId,
        region: CONFIG.region,
      }),
    );
  });

  it('signs in PLAYER when token email matches PlayerEmail', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.signInWithGoogleToken(makeJwt({ email: 'player@example.com' }));
    });
    expect(result.current.status).toBe('signed-in');
    expect(result.current.role).toBe('PLAYER');
  });

  it('email match is case-insensitive', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.signInWithGoogleToken(makeJwt({ email: 'PAYER@Example.COM' }));
    });
    expect(result.current.status).toBe('signed-in');
    expect(result.current.role).toBe('PAYER');
  });

  it('denies unknown emails', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.signInWithGoogleToken(makeJwt({ email: 'someone-else@example.com' }));
    });
    expect(result.current.status).toBe('denied');
    expect(result.current.role).toBeNull();
    expect(result.current.credentials).toBeNull();
  });

  it('errors on malformed JWT', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.signInWithGoogleToken('not-a-jwt');
    });
    expect(result.current.status).toBe('error');
  });

  it('errors when exchanger throws', async () => {
    const exchanger = jest.fn(async () => {
      throw new Error('cognito-down');
    });
    const { result } = renderHook(() => useAuth(), { wrapper: wrapper({ exchanger }) });
    await act(async () => {
      await result.current.signInWithGoogleToken(makeJwt({ email: 'payer@example.com' }));
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('cognito-down');
  });

  it('signOut returns to signed-out', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.signInWithGoogleToken(makeJwt({ email: 'payer@example.com' }));
    });
    expect(result.current.status).toBe('signed-in');
    act(() => {
      result.current.signOut();
    });
    expect(result.current.status).toBe('signed-out');
    expect(result.current.role).toBeNull();
    expect(result.current.credentials).toBeNull();
  });

  it('useAuth throws when used outside provider', () => {
    expect(() => renderHook(() => useAuth())).toThrow(/AuthProvider/);
  });
});

describe('Role gates', () => {
  function TestApp() {
    const auth = useAuth();
    return (
      <div>
        <div data-testid="status">{auth.status}</div>
        <PayerOnly fallback={<span>not-payer</span>}>
          <span>payer-content</span>
        </PayerOnly>
        <PlayerOnly fallback={<span>not-player</span>}>
          <span>player-content</span>
        </PlayerOnly>
        <button onClick={() => auth.signInWithGoogleToken(makeJwt({ email: 'payer@example.com' }))}>
          sign-in-payer
        </button>
      </div>
    );
  }

  it('shows neither when signed-out', () => {
    render(
      <AuthProvider config={CONFIG} exchanger={async () => FAKE_CREDS}>
        <TestApp />
      </AuthProvider>,
    );
    expect(screen.getByText('not-payer')).toBeInTheDocument();
    expect(screen.getByText('not-player')).toBeInTheDocument();
  });

  it('shows payer-content after PAYER sign-in, hides player-content', async () => {
    render(
      <AuthProvider config={CONFIG} exchanger={async () => FAKE_CREDS}>
        <TestApp />
      </AuthProvider>,
    );
    await act(async () => {
      screen.getByText('sign-in-payer').click();
    });
    await waitFor(() => expect(screen.getByText('payer-content')).toBeInTheDocument());
    expect(screen.queryByText('player-content')).not.toBeInTheDocument();
  });
});
