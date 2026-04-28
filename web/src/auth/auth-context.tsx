import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import type { AwsCredentialIdentity } from '@aws-sdk/types';
import {
  decodeJwtPayload,
  exchangeGoogleTokenForAwsCredentials,
  type CredentialsExchanger,
} from './cognito.js';
import { roleFromAssumedRoleArn } from './role.js';
import type { AuthConfig, AuthContextValue, AuthState, Role } from './types.js';

const initialState: AuthState = {
  status: 'signed-out',
  user: null,
  role: null,
  credentials: null,
  error: null,
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Determines the app role from an STS GetCallerIdentity ARN. */
export type RoleResolver = (input: {
  region: string;
  credentials: AwsCredentialIdentity;
}) => Promise<Role | null>;

const defaultRoleResolver: RoleResolver = async ({ region, credentials }) => {
  const sts = new STSClient({ region, credentials });
  const result = await sts.send(new GetCallerIdentityCommand({}));
  return roleFromAssumedRoleArn(result.Arn);
};

export interface AuthProviderProps extends PropsWithChildren {
  config: AuthConfig;
  /** Override the credentials exchanger for tests. */
  exchanger?: CredentialsExchanger;
  /** Override the role resolver for tests. */
  roleResolver?: RoleResolver;
}

export function AuthProvider({ children, config, exchanger, roleResolver }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>(initialState);
  const exchange = exchanger ?? exchangeGoogleTokenForAwsCredentials;
  const resolveRole = roleResolver ?? defaultRoleResolver;

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

      let credentials: AwsCredentialIdentity;
      try {
        credentials = await exchange({
          identityPoolId: config.identityPoolId,
          region: config.region,
          googleIdToken: idToken,
        });
      } catch (e) {
        setState({
          ...initialState,
          status: 'error',
          user: { email },
          error: e instanceof Error ? e.message : 'cognito exchange failed',
        });
        return;
      }

      let role: Role | null;
      try {
        role = await resolveRole({ region: config.region, credentials });
      } catch (e) {
        setState({
          ...initialState,
          status: 'error',
          user: { email },
          error: e instanceof Error ? e.message : 'role resolution failed',
        });
        return;
      }

      if (!role) {
        setState({
          ...initialState,
          status: 'denied',
          user: { email },
          error: 'email not authorized for this app',
        });
        return;
      }

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
    },
    [config, exchange, resolveRole],
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
