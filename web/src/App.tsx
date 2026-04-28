import { useEffect, useMemo, useState } from 'react';
import { AuthProvider, useAuth, SignInPanel, PlayerOnly, PayerOnly } from './auth/index.js';
import { loadConfig, type AppConfig } from './config.js';
import { FunctionUrlClient } from './data/function-url.js';
import { useLedger } from './data/use-ledger.js';
import { ToastProvider } from './ui/toast.js';
import { AgreementPage } from './views/AgreementPage.js';
import { PlayerView } from './views/PlayerView.js';
import { PayerView } from './views/PayerView.js';

function SignedInShell({ config }: { config: AppConfig }) {
  const { user, role, credentials, signOut } = useAuth();
  const ledger = useLedger({
    credentials,
    region: config.region,
    tableName: config.ledgerTable,
  });
  const lambda = useMemo(() => {
    if (!credentials || !config.lambdaUrl) return null;
    return new FunctionUrlClient({
      baseUrl: config.lambdaUrl,
      region: config.region,
      credentialsProvider: async () => credentials,
    });
  }, [credentials, config.lambdaUrl, config.region]);

  return (
    <main>
      <header>
        <h1>coding-game dashboard</h1>
        <div className="auth-status">
          Signed in as <strong>{user?.email}</strong> ({role}) ·{' '}
          <button onClick={signOut}>sign out</button>
        </div>
      </header>
      {ledger && role && <AgreementPage ledger={ledger} role={role} />}
      <PlayerOnly>{ledger && lambda && <PlayerView ledger={ledger} lambda={lambda} />}</PlayerOnly>
      <PayerOnly>{ledger && <PayerView ledger={ledger} />}</PayerOnly>
    </main>
  );
}

function Inner({ config }: { config: AppConfig }) {
  const { status } = useAuth();
  if (status !== 'signed-in') {
    return (
      <main>
        <h1>coding-game dashboard</h1>
        <SignInPanel googleClientId={config.googleClientId} />
      </main>
    );
  }
  return <SignedInShell config={config} />;
}

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadConfig()
      .then(setConfig)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'config-load-failed'));
  }, []);

  if (error) {
    return (
      <main>
        <h1>coding-game dashboard</h1>
        <p role="alert">Failed to load /config.json: {error}</p>
      </main>
    );
  }

  if (!config) {
    return (
      <main>
        <h1>coding-game dashboard</h1>
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <ToastProvider>
      <AuthProvider config={{ region: config.region, identityPoolId: config.identityPoolId }}>
        <Inner config={config} />
      </AuthProvider>
    </ToastProvider>
  );
}
