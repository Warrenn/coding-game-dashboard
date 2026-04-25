// Web app configuration. Vite injects VITE_* env vars at build time. The
// deploy script writes a .env.production based on CloudFormation outputs;
// for local dev, drop a .env.local with the same keys.
import type { AuthConfig } from './auth/index.js';

interface AppConfig extends AuthConfig {
  googleClientId: string;
  ledgerTable: string;
  lambdaUrl: string;
}

function readEnv(key: string, fallback = ''): string {
  // Vite replaces `import.meta.env.VITE_*` at build time. In Jest, env is
  // empty; tests construct their own config and don't read this module.
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  return env?.[key] ?? fallback;
}

export const config: AppConfig = {
  region: readEnv('VITE_AWS_REGION', 'us-east-1'),
  identityPoolId: readEnv('VITE_COGNITO_IDENTITY_POOL_ID'),
  payerEmail: readEnv('VITE_PAYER_EMAIL'),
  playerEmail: readEnv('VITE_PLAYER_EMAIL'),
  googleClientId: readEnv('VITE_GOOGLE_CLIENT_ID'),
  ledgerTable: readEnv('VITE_LEDGER_TABLE'),
  lambdaUrl: readEnv('VITE_LAMBDA_URL'),
};

export function isConfigComplete(): boolean {
  return Boolean(
    config.identityPoolId &&
    config.payerEmail &&
    config.playerEmail &&
    config.googleClientId &&
    config.ledgerTable &&
    config.lambdaUrl,
  );
}
