// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');
const tokens = Object.fromEntries(
  [...css.matchAll(/--color-([\w-]+):\s*(#[\da-f]{6});/gi)].map((m) => [m[1], m[2]]),
);
function luminance(hex: string): number {
  const rgb = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
}
function ratio(fg: string, bg: string): number {
  const a = luminance(tokens[fg]!);
  const b = luminance(tokens[bg]!);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
describe('normal text contrast from runtime CSS tokens', () => {
  it.each(['fg', 'muted', 'heading', 'primary-strong', 'secondary-text', 'danger'])(
    '%s on cards and page backgrounds meets AA',
    (fg) => {
      for (const bg of ['card', 'bg']) expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    },
  );
  it('protects input and primary button text', () => {
    expect(ratio('fg', 'input')).toBeGreaterThanOrEqual(4.5);
    for (const bg of ['primary-strong', 'secondary-text'])
      expect(ratio('primary-text', bg)).toBeGreaterThanOrEqual(4.5);
  });
  it('uses strong text, not the low-contrast success indicator, for saved profiles', () => {
    const form = readFileSync(
      new URL('../../components/profiles/onboarding-form.tsx', import.meta.url),
      'utf8',
    );
    expect(form).not.toContain('text-success');
    expect(form).toContain('text-secondary-text');
    expect(ratio('secondary-text', 'card')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('success', 'card')).toBeLessThan(4.5);
  });
});
