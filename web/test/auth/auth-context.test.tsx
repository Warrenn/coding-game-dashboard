import { jest } from '@jest/globals';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { AwsCredentialIdentity } from '@aws-sdk/types';
import { AuthProvider, useAuth, PayerOnly, PlayerOnly } from '../../src/auth/index.js';
import type { AuthConfig, Role } from '../../src/auth/index.js';

const CONFIG: AuthConfig = {
  region: 'us-east-1',
  identityPoolId: 'us-east-1:fake-pool',
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

const PAYER_RESOLVER = async () => 'PAYER' as Role;
const PLAYER_RESOLVER = async () => 'PLAYER' as Role;
const DENY_RESOLVER = async () => null;

describe('AuthProvider', () => {
  function wrapper(
    extraProps: {
      exchanger?: () => Promise<AwsCredentialIdentity>;
      roleResolver?: () => Promise<Role | null>;
    } = {},
  ) {
    return ({ children }: { children: React.ReactNode }) => (
      <AuthProvider
        config={CONFIG}
        exchanger={extraProps.exchanger ?? (async () => FAKE_CREDS)}
        roleResolver={extraProps.roleResolver ?? PAYER_RESOLVER}
      >
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

  it('signs in PAYER when role resolver returns PAYER', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper({ roleResolver: PAYER_RESOLVER }),
    });
    await act(async () => {
      await result.current.signInWithGoogleToken(makeJwt({ email: 'someone@example.com' }));
    });
    expect(result.current.status).toBe('signed-in');
    expect(result.current.role).toBe('PAYER');
    expect(result.current.user?.email).toBe('someone@example.com');
    expect(result.current.credentials).toEqual(FAKE_CREDS);
  });

  it('signs in PLAYER when role resolver returns PLAYER', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper({ roleResolver: PLAYER_RESOLVER }),
    });
    await act(async () => {
      await result.current.signInWithGoogleToken(makeJwt({ email: 'p@example.com' }));
    });
    expect(result.current.status).toBe('signed-in');
    expect(result.current.role).toBe('PLAYER');
  });

  it('denies sign-in when role resolver returns null', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper({ roleResolver: DENY_RESOLVER }),
    });
    await act(async () => {
      await result.current.signInWithGoogleToken(makeJwt({ email: 'unknown@example.com' }));
    });
    expect(result.current.status).toBe('denied');
    expect(result.current.role).toBeNull();
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
      await result.current.signInWithGoogleToken(makeJwt({ email: 'a@example.com' }));
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('cognito-down');
  });

  it('errors when role resolver throws', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper({
        roleResolver: async () => {
          throw new Error('sts-down');
        },
      }),
    });
    await act(async () => {
      await result.current.signInWithGoogleToken(makeJwt({ email: 'a@example.com' }));
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('sts-down');
  });

  it('signOut returns to signed-out', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.signInWithGoogleToken(makeJwt({ email: 'a@example.com' }));
    });
    expect(result.current.status).toBe('signed-in');
    act(() => {
      result.current.signOut();
    });
    expect(result.current.status).toBe('signed-out');
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
        <button onClick={() => auth.signInWithGoogleToken(makeJwt({ email: 'a@example.com' }))}>
          sign-in
        </button>
      </div>
    );
  }

  it('shows neither when signed-out', () => {
    render(
      <AuthProvider
        config={CONFIG}
        exchanger={async () => FAKE_CREDS}
        roleResolver={PAYER_RESOLVER}
      >
        <TestApp />
      </AuthProvider>,
    );
    expect(screen.getByText('not-payer')).toBeInTheDocument();
    expect(screen.getByText('not-player')).toBeInTheDocument();
  });

  it('shows payer-content after PAYER sign-in, hides player-content', async () => {
    render(
      <AuthProvider
        config={CONFIG}
        exchanger={async () => FAKE_CREDS}
        roleResolver={PAYER_RESOLVER}
      >
        <TestApp />
      </AuthProvider>,
    );
    await act(async () => {
      screen.getByText('sign-in').click();
    });
    await waitFor(() => expect(screen.getByText('payer-content')).toBeInTheDocument());
    expect(screen.queryByText('player-content')).not.toBeInTheDocument();
  });
});
