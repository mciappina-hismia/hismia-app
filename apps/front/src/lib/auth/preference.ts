export const PREFERENCE_KEY = 'hismia.onboarding.accountType';
export const ACCOUNT_TYPES = ['patient', 'professional', 'institution'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export function isAccountType(value: string): value is AccountType {
  return ACCOUNT_TYPES.some((type) => type === value);
}

// This is a short-lived UI hint, not a role, an identity binding or an authorization claim.
export function rememberPreference(value: AccountType): void {
  try {
    window.sessionStorage.setItem(PREFERENCE_KEY, value);
  } catch {
    // Storage can be disabled. Onboarding must still work without a preference.
  }
}

export function readPreference(): AccountType | null {
  try {
    const value = window.sessionStorage.getItem(PREFERENCE_KEY);
    return value && isAccountType(value) ? value : null;
  } catch {
    return null;
  }
}
