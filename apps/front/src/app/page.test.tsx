import { describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);
import Home from './page.js';

describe('Home page', () => {
  it('renders the bootstrap heading', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Hismia MVP bootstrap/i);
  });

  it('offers direct signup and returning login', () => {
    render(<Home />);
    expect(screen.getByRole('link', { name: /crear cuenta/i })).toHaveAttribute(
      'href',
      '/signup',
    );
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
  });
});
