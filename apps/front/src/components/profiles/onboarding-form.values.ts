import { accountProfileSchema } from '@hismia/validation';
import type { AccountType } from '@hismia/types';
import type { FormValues } from './onboarding-form.types';

export function normalizeFormValues(values: FormValues): FormValues {
  const normalized = { ...values };
  if (normalized.accountType === 'patient' && !normalized.gender) delete normalized.gender;
  return normalized;
}

// A type change starts a fresh variant: no hidden values survive the reset.
export function emptyFormValues(accountType: AccountType): FormValues {
  switch (accountType) {
    case 'patient':
      return { accountType, displayName: '', birthDate: '', residenceLocality: '', gender: '' };
    case 'professional':
      return { accountType, displayName: '', specialty: '', practiceLocality: '' };
    case 'institution':
      return { accountType, name: '', type: '', location: '' };
  }
}

export function parseFormValues(values: FormValues, asOf: string) {
  return accountProfileSchema(asOf).safeParse(normalizeFormValues(values));
}
