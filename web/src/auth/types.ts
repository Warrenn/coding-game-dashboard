import type { AwsCredentialIdentity } from '@aws-sdk/types';

export type Role = 'PAYER' | 'PLAYER';

export type AuthStatus = 'signed-out' | 'signing-in' | 'signed-in' | 'denied' | 'error';

export interface AuthUser {
  email: string;
  name?: string;
  picture?: string;
}

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  role: Role | null;
  credentials: AwsCredentialIdentity | null;
  error: string | null;
}

export interface AuthContextValue extends AuthState {
  /** Hand a Google ID token (JWT) to the auth layer. */
  signInWithGoogleToken: (idToken: string) => Promise<void>;
  signOut: () => void;
}

export interface AuthConfig {
  region: string;
  identityPoolId: string;
}
