import { render, screen } from '@testing-library/react';
import { App } from '../src/App.js';

describe('App', () => {
  it('renders the dashboard heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /coding-game dashboard/i })).toBeInTheDocument();
  });

  it('shows config-missing message when VITE_* env vars are absent (test env default)', () => {
    render(<App />);
    expect(screen.getByText(/Configuration is incomplete/i)).toBeInTheDocument();
  });
});
