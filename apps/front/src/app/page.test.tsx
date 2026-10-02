import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Home from './page.js';

describe('Home page', () => {
  it('renders the bootstrap heading', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /Hismia MVP bootstrap/i,
    );
  });
});