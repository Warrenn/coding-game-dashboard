import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

type Kind = 'info' | 'success' | 'error' | 'confirm';

interface ToastBase {
  id: string;
  kind: Kind;
  message: string;
}

interface ConfirmToast extends ToastBase {
  kind: 'confirm';
  resolve: (ok: boolean) => void;
}

type Toast = ToastBase | ConfirmToast;

interface ToastContextValue {
  show: (kind: Exclude<Kind, 'confirm'>, message: string, durationMs?: number) => void;
  confirm: (message: string) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastSeq = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (kind: Exclude<Kind, 'confirm'>, message: string, durationMs?: number) => {
      const id = `t-${toastSeq++}`;
      const ms = durationMs ?? (kind === 'error' ? 8000 : 4000);
      setToasts((prev) => [...prev, { id, kind, message }]);
      setTimeout(() => remove(id), ms);
    },
    [remove],
  );

  const confirm = useCallback(
    (message: string): Promise<boolean> =>
      new Promise((resolve) => {
        const id = `t-${toastSeq++}`;
        const wrappedResolve = (ok: boolean) => {
          remove(id);
          resolve(ok);
        };
        setToasts((prev) => [
          ...prev,
          { id, kind: 'confirm', message, resolve: wrappedResolve },
        ]);
      }),
    [remove],
  );

  return (
    <ToastContext.Provider value={{ show, confirm }}>
      {children}
      <div className="toast-container" role="region" aria-label="notifications">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <p>{t.message}</p>
            {t.kind === 'confirm' && (
              <div className="toast-actions">
                <button onClick={() => (t as ConfirmToast).resolve(true)}>Confirm</button>
                <button
                  onClick={() => (t as ConfirmToast).resolve(false)}
                  style={{ background: 'transparent', color: 'var(--fg-dim)', border: '1px solid var(--border)' }}
                >
                  Cancel
                </button>
              </div>
            )}
            {t.kind !== 'confirm' && (
              <button
                aria-label="dismiss-toast"
                onClick={() => remove(t.id)}
                style={{
                  background: 'transparent',
                  color: 'var(--fg-dim)',
                  border: 'none',
                  padding: '0 0 0 0.5rem',
                  fontSize: '1rem',
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // No-provider fallback (tests, isolated rendering): silently no-op for
    // info/success/error; defer to native window.confirm so test mocks of
    // window.confirm still work without rewriting render wrappers.
    return {
      info: () => {},
      success: () => {},
      error: () => {},
      confirm: async (message: string) =>
        typeof globalThis.confirm === 'function' ? globalThis.confirm(message) : true,
    };
  }
  return {
    info: (message: string) => ctx.show('info', message),
    success: (message: string) => ctx.show('success', message),
    error: (message: string) => ctx.show('error', message),
    confirm: (message: string) => ctx.confirm(message),
  };
}
