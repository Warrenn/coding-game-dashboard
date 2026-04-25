import { useMemo } from 'react';
import { AuthProvider, useAuth, SignInPanel, PlayerOnly, PayerOnly } from './auth/index.js';
import { config, isConfigComplete } from './config.js';
import { FunctionUrlClient } from './data/function-url.js';
import { useLedger } from './data/use-ledger.js';
import { AgreementPage } from './views/AgreementPage.js';
import { PlayerView } from './views/PlayerView.js';

function ConfigMissing() {
  return (
    <main>
      <h1>coding-game dashboard</h1>
      <p>Configuration is incomplete. Set VITE_* env vars and rebuild.</p>
    </main>
  );
}

function SignedInShell() {
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
  }, [credentials]);

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
      <PayerOnly>
        <section>
          <h2>Payer view</h2>
          <p>Inbox + record payment land in Step 11.</p>
        </section>
      </PayerOnly>
    </main>
  );
}

function Inner() {
  const { status } = useAuth();
  if (status !== 'signed-in') {
    return (
      <main>
        <h1>coding-game dashboard</h1>
        <SignInPanel googleClientId={config.googleClientId} />
      </main>
    );
  }
  return <SignedInShell />;
}

export function App() {
  if (!isConfigComplete()) return <ConfigMissing />;
  return (
    <AuthProvider config={config}>
      <Inner />
    </AuthProvider>
  );
}
