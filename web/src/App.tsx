import { AuthProvider, useAuth, SignInPanel } from './auth/index.js';
import { config, isConfigComplete } from './config.js';
import { useLedger } from './data/use-ledger.js';
import { AgreementPage } from './views/AgreementPage.js';

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
      <section>
        <h2>{role === 'PAYER' ? 'Payer view' : 'Player view'}</h2>
        <p>Achievements, payments, and inbox land in Steps 10 + 11.</p>
      </section>
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
