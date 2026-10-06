import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { readFile } from 'node:fs/promises';
import { Credentials } from './credentials';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('../../lib/auth/browser', () => ({
  browserAuth: vi.fn(() => null),
  confirmedUser: vi.fn(),
  CONFIRM_PATH: '/auth/confirm',
  ONBOARDING_PATH: '/onboarding',
  RECOVERY_PATH: '/auth/recover',
}));
afterEach(cleanup);

describe('credentials wordmark semantics', () => {
  it('ships only the local literal glyphs and approved fills in a bounded static graphic', async () => {
    const source = await readFile('public/brand/hismia-wordmark.svg', 'utf8');
    const svg = new DOMParser().parseFromString(source, 'image/svg+xml');
    expect(svg.querySelector('parsererror')).toBeNull();
    expect(source.length).toBeLessThan(2000);
    expect(svg.documentElement.getAttribute('viewBox')).toBe('0 0 144 44');
    expect(svg.documentElement.getAttribute('width')).toBe('144');
    expect(svg.documentElement.getAttribute('height')).toBe('44');
    const text = svg.querySelector('text')!;
    expect(text.textContent).toBe('Hismia');
    expect(text.getAttribute('font-size')).toBe('30');
    expect(text.getAttribute('font-weight')).toBe('700');
    expect(text.getAttribute('font-family')).toBe(
      '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif',
    );
    expect([...svg.querySelectorAll('[fill]')].map((node) => node.getAttribute('fill'))).toEqual([
      '#09396a',
      '#32c0b4',
    ]);
    expect(
      [...svg.querySelectorAll('*')].every((node) =>
        ['svg', 'text', 'tspan'].includes(node.localName),
      ),
    ).toBe(true);
    expect(
      [...svg.querySelectorAll('*')]
        .flatMap((node) => [...node.attributes])
        .some((attr) => /href|^on|style/i.test(attr.name)),
    ).toBe(false);
    expect(source.replace('http://www.w3.org/2000/svg', '')).not.toMatch(
      /script|url\(|@import|DOCTYPE|ENTITY|https?:\/\//i,
    );
  });
  it.each(['signup', 'login'] as const)(
    'exposes the genuine %s wordmark as one named image without replacing functional text',
    (mode) => {
      const { container } = render(<Credentials mode={mode} />);
      const images = screen.getAllByRole('img', { name: 'Hismia' });
      expect(images).toHaveLength(1);
      const logo = images[0]!;
      expect(logo).toHaveAccessibleName('Hismia');
      expect(logo).not.toHaveAttribute('aria-hidden');
      expect(logo.tagName).toBe('IMG');
      expect(logo).toHaveAttribute('alt', 'Hismia');
      expect(logo).toHaveAttribute('src', '/brand/hismia-wordmark.svg');
      expect(Number(logo.getAttribute('width'))).toBeGreaterThan(0);
      expect(Number(logo.getAttribute('height'))).toBeGreaterThan(0);
      expect(logo.closest('[aria-hidden="true"], [hidden]')).toBeNull();
      expect(container.querySelector('p[class~="lg:hidden"]')).toHaveTextContent('Hismia');
      expect(container.querySelector('p[aria-label="Hismia"]')).toBeNull();
      expect(within(logo).queryByRole('heading')).not.toBeInTheDocument();
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: mode === 'signup' ? 'Crear Cuenta' : 'Iniciar Sesión',
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { level: 2, name: 'Tu cuenta. Tu perfil.' }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
      expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
    },
  );
});
