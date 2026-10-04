import { afterEach, describe, expect, it, vi } from 'vitest';
import { PREFERENCE_KEY, readPreference, rememberPreference } from './preference';

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe('untrusted onboarding preference', () => {
  it.each(['patient', 'professional', 'institution'] as const)(
    'round trips %s as a UI hint only',
    (type) => {
      rememberPreference(type);
      expect(readPreference()).toBe(type);
      expect(window.sessionStorage.getItem(PREFERENCE_KEY)).toBe(type);
    },
  );
  it.each(['admin', 'verified', '', '{"accountType":"admin"}'])('rejects forged %s', (value) => {
    window.sessionStorage.setItem(PREFERENCE_KEY, value);
    expect(readPreference()).toBeNull();
  });
  it('works without storage access', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => rememberPreference('patient')).not.toThrow();
    expect(readPreference()).toBeNull();
  });
});
