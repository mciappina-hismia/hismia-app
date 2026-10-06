import { expect, it } from 'vitest';
import RootLayout, { metadata } from './layout';

it('declares Spanish for the Spanish presentation and metadata', () => {
  expect(RootLayout({ children: null }).props.lang).toBe('es');
  expect(metadata.description).toBe(
    'Historia clínica personal con permisos profesionales revocables.',
  );
});
