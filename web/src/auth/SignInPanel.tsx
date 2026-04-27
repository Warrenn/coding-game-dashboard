import { useEffect, useRef } from 'react';
import { useAuth } from './auth-context.js';

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const GIS_LOAD_TIMEOUT_MS = 5_000;

interface GoogleAccountsId {
  initialize: (config: {
    client_id: string;
    callback: (resp: { credential: string }) => void;
  }) => void;
  renderButton: (parent: HTMLElement, opts: Record<string, unknown>) => void;
}

interface GoogleAccountsGlobal {
  accounts: { id: GoogleAccountsId };
}

declare global {
  interface Window {
    google?: GoogleAccountsGlobal;
  }
}

interface SignInPanelProps {
  googleClientId: string;
}

function loadGoogleIdentityServices(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no-window'));
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('gis-load-failed')));
      return;
    }
    const s = document.createElement('script');
    s.src = GIS_SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('gis-load-failed'));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error('gis-load-timeout')), GIS_LOAD_TIMEOUT_MS);
  });
}

export function SignInPanel({ googleClientId }: SignInPanelProps) {
  const auth = useAuth();
  const buttonHostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (auth.status === 'signed-in') return;
    let cancelled = false;
    loadGoogleIdentityServices()
      .then(() => {
        if (cancelled || !window.google || !buttonHostRef.current) return;
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: (resp) => {
            void auth.signInWithGoogleToken(resp.credential);
          },
        });
        window.google.accounts.id.renderButton(buttonHostRef.current, {
          theme: 'filled_black',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
        });
      })
      .catch(() => {
        // Surfaces in dev console; auth.status stays signed-out.
      });
    return () => {
      cancelled = true;
    };
  }, [auth, googleClientId]);

  if (auth.status === 'signed-in') return null;

  return (
    <div className="auth-panel">
      {auth.status === 'denied' ? (
        <p>This Google account is not authorized for this app.</p>
      ) : auth.status === 'error' ? (
        <p>Sign-in failed: {auth.error}</p>
      ) : (
        <p>Sign in with the configured Google account to continue.</p>
      )}
      <div ref={buttonHostRef} />
    </div>
  );
}
