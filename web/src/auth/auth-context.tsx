import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  decodeJwtPayload,
  exchangeGoogleTokenForAwsCredentials,
  type CredentialsExchanger,
} from './cognito.js';
import type { AuthConfig, AuthContextValue, AuthState, Role } from './types.js';

const initialState: AuthState = {
  status: 'signed-out',
  user: null,
  role: null,
  credentials: null,
  error: null,
};

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps extends PropsWithChildren {
  config: AuthConfig;
  /** Override the credentials exchanger for tests. */
  exchanger?: CredentialsExchanger;
}

function determineRole(email: string, config: AuthConfig): Role | null {
  if (email.toLowerCase() === config.payerEmail.toLowerCase()) return 'PAYER';
  if (email.toLowerCase() === config.playerEmail.toLowerCase()) return 'PLAYER';
  return null;
}

export function AuthProvider({ children, config, exchanger }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>(initialState);
  const exchange = exchanger ?? exchangeGoogleTokenForAwsCredentials;

  const signInWithGoogleToken = useCallback(
    async (idToken: string) => {
      setState({ ...initialState, status: 'signing-in' });
      let payload: Record<string, unknown>;
      try {
        payload = decodeJwtPayload(idToken);
      } catch (e) {
        setState({
          ...initialState,
          status: 'error',
          error: e instanceof Error ? e.message : 'invalid token',
        });
        return;
      }

      const email = typeof payload.email === 'string' ? payload.email : '';
      const role = determineRole(email, config);
      if (!role) {
        setState({
          ...initialState,
          status: 'denied',
          user: { email },
          error: 'email not authorized for this app',
        });
        return;
      }

      try {
        const credentials = await exchange({
          identityPoolId: config.identityPoolId,
          region: config.region,
          googleIdToken: idToken,
        });
        setState({
          status: 'signed-in',
          user: {
            email,
            name: typeof payload.name === 'string' ? payload.name : undefined,
            picture: typeof payload.picture === 'string' ? payload.picture : undefined,
          },
          role,
          credentials,
          error: null,
        });
      } catch (e) {
        setState({
          ...initialState,
          status: 'error',
          error: e instanceof Error ? e.message : 'cognito exchange failed',
        });
      }
    },
    [config, exchange],
  );

  const signOut = useCallback(() => {
    setState(initialState);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, signInWithGoogleToken, signOut }),
    [state, signInWithGoogleToken, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
