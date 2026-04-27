// Exchange a Google ID token for AWS credentials via Cognito Identity Pool.
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers';
import type { AwsCredentialIdentity } from '@aws-sdk/types';

export interface ExchangeOptions {
  identityPoolId: string;
  region: string;
  googleIdToken: string;
}

export type CredentialsExchanger = (opts: ExchangeOptions) => Promise<AwsCredentialIdentity>;

export const exchangeGoogleTokenForAwsCredentials: CredentialsExchanger = async (opts) => {
  const provider = fromCognitoIdentityPool({
    identityPoolId: opts.identityPoolId,
    logins: { 'accounts.google.com': opts.googleIdToken },
    clientConfig: { region: opts.region },
  });
  return provider();
};

/**
 * Decode a JWT's payload without verifying the signature. The Cognito Identity
 * Pool verifies it on its end; we only read the email claim here to map to a role.
 */
export function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error('not a JWT');
  const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(json);
}
