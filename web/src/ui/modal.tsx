import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export type ConfirmOptions =
  | string
  | {
      title?: string;
      message: string;
      confirmLabel?: string;
      cancelLabel?: string;
      danger?: boolean;
    };

interface ModalContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

interface NormalisedOpts {
  title?: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
}

const ModalContext = createContext<ModalContextValue | null>(null);

function normalise(opts: ConfirmOptions): NormalisedOpts {
  if (typeof opts === 'string') {
    return { message: opts, confirmLabel: 'Confirm', cancelLabel: 'Cancel', danger: false };
  }
  return {
    title: opts.title,
    message: opts.message,
    confirmLabel: opts.confirmLabel ?? 'Confirm',
    cancelLabel: opts.cancelLabel ?? 'Cancel',
    danger: opts.danger ?? false,
  };
}

export function ModalProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<{
    opts: NormalisedOpts;
    resolve: (b: boolean) => void;
  } | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions): Promise<boolean> =>
      new Promise((resolve) => {
        setRequest({ opts: normalise(opts), resolve });
      }),
    [],
  );

  const close = useCallback(
    (ok: boolean) => {
      if (request) {
        request.resolve(ok);
        setRequest(null);
      }
    },
    [request],
  );

  // Escape closes (= cancel).
  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request, close]);

  return (
    <ModalContext.Provider value={{ confirm }}>
      {children}
      {request && (
        <div
          className="modal-backdrop"
          onClick={() => close(false)}
          role="dialog"
          aria-modal="true"
          aria-label={request.opts.title ?? 'Confirm'}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {request.opts.title && <h3>{request.opts.title}</h3>}
            <p>{request.opts.message}</p>
            <div className="modal-actions">
              <button
                type="button"
                onClick={() => close(false)}
                style={{
                  background: 'transparent',
                  color: 'var(--fg-dim)',
                  border: '1px solid var(--border)',
                }}
              >
                {request.opts.cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => close(true)}
                className={request.opts.danger ? 'danger' : ''}
                autoFocus
              >
                {request.opts.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) {
    // Fallback: native confirm. Tests / unwrapped renders.
    return {
      confirm: async (opts: ConfirmOptions) => {
        const message = typeof opts === 'string' ? opts : opts.message;
        return typeof globalThis.confirm === 'function' ? globalThis.confirm(message) : true;
      },
    };
  }
  return ctx;
}
