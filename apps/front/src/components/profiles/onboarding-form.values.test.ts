// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { normalizeFormValues, parseFormValues } from './onboarding-form.values';

const patient = {
  accountType: 'patient',
  displayName: ' Synthetic ',
  birthDate: '2008-02-29',
  residenceLocality: ' City ',
  gender: '',
} as const;

describe('profile form boundary', () => {
  it('omits UI empty gender without mutating values and returns trimmed validated input', () => {
    const normalized = normalizeFormValues(patient);
    expect(normalized).not.toHaveProperty('gender');
    expect(patient.gender).toBe('');
    const parsed = parseFormValues(patient, '2026-03-01');
    expect(parsed.success).toBe(true);
    if (parsed.success)
      expect(parsed.data).toEqual({
        accountType: 'patient',
        displayName: 'Synthetic',
        birthDate: '2008-02-29',
        residenceLocality: 'City',
      });
  });
  it.each(['mujer', 'varón', 'no binario', 'otra identidad', 'prefiero no informar'] as const)(
    'preserves the shared gender choice %s',
    (gender) => {
      const parsed = parseFormValues({ ...patient, gender }, '2026-03-01');
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data).toHaveProperty('gender', gender);
    },
  );
  it('keeps shared strict validation for hidden or privileged fields', () => {
    const hidden = { ...patient, specialty: 'General' };
    const privileged = { ...patient, subject: 'synthetic-subject' };
    // Untrusted runtime fields must still be rejected despite static types.
    // @ts-expect-error simulate a runtime object that violates the variant contract
    expect(parseFormValues(hidden, '2026-03-01').success).toBe(false);
    expect(parseFormValues(privileged, '2026-03-01').success).toBe(false);
  });
  it('delegates adulthood, leap days and calendar validity to shared validation', () => {
    expect(parseFormValues(patient, '2026-02-28').success).toBe(false);
    expect(parseFormValues(patient, '2026-03-01').success).toBe(true);
    expect(parseFormValues({ ...patient, birthDate: '2008-02-30' }, '2026-03-01').success).toBe(
      false,
    );
    expect(parseFormValues(patient, 'invalid').success).toBe(false);
  });
  it.each([
    {
      accountType: 'professional',
      displayName: ' Synthetic ',
      specialty: ' General ',
      practiceLocality: ' City ',
    },
    { accountType: 'institution', name: ' Synthetic ', type: ' Clinic ', location: ' City ' },
  ] as const)('validates and trims $accountType fields', (values) => {
    const parsed = parseFormValues(values, '2026-03-01');
    expect(parsed.success).toBe(true);
    if (parsed.success)
      expect(
        Object.values(parsed.data).every(
          (value) => typeof value === 'string' && value === value.trim(),
        ),
      ).toBe(true);
  });
});
