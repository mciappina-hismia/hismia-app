import { describe, expect, it } from 'vitest';
import { accountProfileSchema, isAdultOn } from './index.js';

const patient = {
  accountType: 'patient',
  displayName: 'Alex',
  birthDate: '2000-02-29',
  gender: 'no binario',
  residenceLocality: 'Rosario',
};
const professional = {
  accountType: 'professional',
  displayName: 'Sam',
  specialty: 'Cardiología',
  practiceLocality: 'Córdoba',
};
const institution = {
  accountType: 'institution',
  name: 'Centro',
  type: 'Hospital',
  location: 'Mendoza',
};
const asOf = '2026-03-01';

describe('account profiles', () => {
  it.each([patient, professional, institution])(
    'accepts the documented shape for $accountType',
    (profile) => {
      expect(accountProfileSchema(asOf).safeParse(profile).success).toBe(true);
    },
  );
  it.each(['mujer', 'varón', 'no binario', 'otra identidad', 'prefiero no informar'])(
    'accepts documented gender %s',
    (gender) => {
      expect(accountProfileSchema(asOf).safeParse({ ...patient, gender }).success).toBe(true);
    },
  );
  it('accepts a patient without gender', () => {
    const { gender: _gender, ...withoutGender } = patient;
    expect(accountProfileSchema(asOf).safeParse(withoutGender).success).toBe(true);
  });
  it.each(['admin', 'verified', 'other'])('rejects unapproved type %s', (accountType) => {
    expect(accountProfileSchema(asOf).safeParse({ ...patient, accountType }).success).toBe(false);
  });
  it.each([
    'admin',
    'verified',
    'role',
    'ownerId',
    'authSubjectId',
    'team',
    'membership',
    'invitation',
  ])('rejects authority field %s', (field) => {
    expect(accountProfileSchema(asOf).safeParse({ ...institution, [field]: true }).success).toBe(
      false,
    );
  });
  it.each([
    { ...patient, displayName: '  ' },
    { ...patient, residenceLocality: '' },
    { ...professional, specialty: ' ' },
    { ...professional, practiceLocality: '' },
    { ...institution, name: '' },
    { ...institution, type: '  ' },
    { ...institution, location: '' },
  ])('rejects blank profile strings', (profile) => {
    expect(accountProfileSchema(asOf).safeParse(profile).success).toBe(false);
  });
});

describe('adult age by calendar day', () => {
  it('accepts the exact eighteenth birthday but not the preceding day', () => {
    const birthDate = '2008-03-01';
    expect(isAdultOn(birthDate, '2026-02-28')).toBe(false);
    expect(accountProfileSchema('2026-02-28').safeParse({ ...patient, birthDate }).success).toBe(
      false,
    );
    expect(isAdultOn(birthDate, '2026-03-01')).toBe(true);
    expect(accountProfileSchema('2026-03-01').safeParse({ ...patient, birthDate }).success).toBe(
      true,
    );
  });
  it('uses March 1 for leap-day birthdays in non-leap eighteenth anniversary years', () => {
    const birthDate = '2008-02-29';
    expect(isAdultOn(birthDate, '2026-02-28')).toBe(false);
    expect(accountProfileSchema('2026-02-28').safeParse({ ...patient, birthDate }).success).toBe(
      false,
    );
    expect(isAdultOn(birthDate, '2026-03-01')).toBe(true);
    expect(accountProfileSchema('2026-03-01').safeParse({ ...patient, birthDate }).success).toBe(
      true,
    );
  });
  it.each([
    '2001-02-29',
    '2024-04-31',
    '2024-13-01',
    '2024-00-01',
    '2024-1-01',
    'not-a-date',
    '2026-03-02',
  ])('rejects invalid or future birth date %s', (birthDate) => {
    expect(isAdultOn(birthDate, asOf)).toBe(false);
    expect(accountProfileSchema(asOf).safeParse({ ...patient, birthDate }).success).toBe(false);
  });
  it.each(['2025-02-29', '2026-04-31', '2026-1-01', 'nope'])(
    'rejects invalid reference date %s safely',
    (date) => {
      expect(isAdultOn('2000-01-01', date)).toBe(false);
      for (const profile of [patient, professional, institution]) {
        expect(accountProfileSchema(date).safeParse(profile).success).toBe(false);
      }
    },
  );
});
