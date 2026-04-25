import { render, screen } from '@testing-library/react';
import { App } from '../src/App.js';

describe('App scaffold', () => {
  it('renders the placeholder heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /coding-game dashboard/i })).toBeInTheDocument();
  });
});
