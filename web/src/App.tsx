import { AuthProvider, useAuth, PayerOnly, PlayerOnly, SignInPanel } from './auth/index.js';
import { config, isConfigComplete } from './config.js';

function ConfigMissing() {
  return (
    <main>
      <h1>coding-game dashboard</h1>
      <p>Configuration is incomplete. Set VITE_* env vars and rebuild.</p>
    </main>
  );
}

function SignedInShell() {
  const { user, role, signOut } = useAuth();
  return (
    <main>
      <header>
        <h1>coding-game dashboard</h1>
        <div className="auth-status">
          Signed in as <strong>{user?.email}</strong> ({role}) ·{' '}
          <button onClick={signOut}>sign out</button>
        </div>
      </header>
      <PayerOnly>
        <section>
          <h2>Payer view</h2>
          <p>Agreement, payments, request inbox land in Steps 9 + 11.</p>
        </section>
      </PayerOnly>
      <PlayerOnly>
        <section>
          <h2>Player view</h2>
          <p>Achievements + payment requests land in Step 10.</p>
        </section>
      </PlayerOnly>
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
