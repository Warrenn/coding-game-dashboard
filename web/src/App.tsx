import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AuthProvider, useAuth, SignInPanel } from './auth/index.js';
import { loadConfig, type AppConfig } from './config.js';
import { FunctionUrlClient } from './data/function-url.js';
import { useLedger } from './data/use-ledger.js';
import { ModalProvider } from './ui/modal.js';
import { ToastProvider } from './ui/toast.js';
import { AgreementPage } from './views/AgreementPage.js';
import { PlayerView } from './views/PlayerView.js';
import { PayerView } from './views/PayerView.js';

type TabId = 'ledger' | 'agreement' | 'achievements';

interface TabSpec {
  id: TabId;
  label: string;
  panel: ReactNode;
}

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

  // Payer's primary view is the Ledger; player's is Agreement (until they have
  // a handle configured, achievements panel can't load anything useful).
  const tabs: TabSpec[] = useMemo(() => {
    if (!ledger || !role) return [];
    if (role === 'PAYER') {
      return [
        { id: 'ledger', label: 'Ledger', panel: <PayerView ledger={ledger} /> },
        {
          id: 'agreement',
          label: 'Agreement',
          panel: <AgreementPage ledger={ledger} role={role} />,
        },
      ];
    }
    const playerTabs: TabSpec[] = [
      {
        id: 'agreement',
        label: 'Agreement',
        panel: <AgreementPage ledger={ledger} role={role} />,
      },
    ];
    if (lambda) {
      playerTabs.push({
        id: 'achievements',
        label: 'My achievements',
        panel: <PlayerView ledger={ledger} lambda={lambda} />,
      });
    }
    return playerTabs;
  }, [ledger, role, lambda]);

  const [active, setActive] = useState<TabId | null>(null);
  useEffect(() => {
    if (tabs.length === 0) return;
    if (active && tabs.some((t) => t.id === active)) return;
    setActive(tabs[0].id);
  }, [tabs, active]);

  return (
    <main>
      <header>
        <h1>coding-game dashboard</h1>
        <div className="auth-status">
          Signed in as <strong>{user?.email}</strong> ({role}) ·{' '}
          <button onClick={signOut}>sign out</button>
        </div>
      </header>
      {tabs.length > 0 && (
        <>
          <div role="tablist" aria-label="Sections" className="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-controls={`panel-${t.id}`}
                aria-selected={active === t.id}
                tabIndex={active === t.id ? 0 : -1}
                onClick={() => setActive(t.id)}
                className={active === t.id ? 'tab tab-active' : 'tab'}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tabs.map((t) => (
            <div
              key={t.id}
              role="tabpanel"
              id={`panel-${t.id}`}
              aria-labelledby={`tab-${t.id}`}
              hidden={active !== t.id}
            >
              {t.panel}
            </div>
          ))}
        </>
      )}
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
      <ModalProvider>
        <AuthProvider config={{ region: config.region, identityPoolId: config.identityPoolId }}>
          <Inner config={config} />
        </AuthProvider>
      </ModalProvider>
    </ToastProvider>
  );
}
