import { act, render, renderHook, screen } from '@testing-library/react';
import { ToastProvider, useToast } from '../../src/ui/toast.js';

function wrapper({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe('toast', () => {
  it('shows an info toast and renders its message', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    render(
      <ToastProvider>
        <button onClick={() => result.current.info('hi there')}>x</button>
      </ToastProvider>,
    );
  });

  it('confirm() resolves true on Confirm click', async () => {
    function Harness() {
      const toast = useToast();
      return <button onClick={async () => ((Harness.result = await toast.confirm('go?')))}>fire</button>;
    }
    Harness.result = undefined as undefined | boolean;

    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );

    await act(async () => {
      screen.getByText('fire').click();
    });
    expect(screen.getByText('go?')).toBeInTheDocument();

    await act(async () => {
      screen.getByText('Confirm').click();
    });
    expect(Harness.result).toBe(true);
  });

  it('confirm() resolves false on Cancel click', async () => {
    function Harness() {
      const toast = useToast();
      return (
        <button onClick={async () => ((Harness.result = await toast.confirm('really?')))}>
          fire
        </button>
      );
    }
    Harness.result = undefined as undefined | boolean;

    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );

    await act(async () => {
      screen.getByText('fire').click();
    });
    await act(async () => {
      screen.getByText('Cancel').click();
    });
    expect(Harness.result).toBe(false);
  });

  it('useToast falls back to native window.confirm when no provider', async () => {
    const original = globalThis.confirm;
    globalThis.confirm = () => true;
    try {
      const { result } = renderHook(() => useToast());
      const ok = await result.current.confirm('ok?');
      expect(ok).toBe(true);
    } finally {
      globalThis.confirm = original;
    }
  });
});
