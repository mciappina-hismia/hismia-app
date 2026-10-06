import { expectTypeOf, it } from 'vitest';
import type { AccountProfileInput } from '@hismia/types';
import type { FormValues } from './onboarding-form.types';

it('requires each variant and rejects mixed fields at compile time', () => {
  const patient = {
    accountType: 'patient',
    displayName: 'Synthetic',
    birthDate: '2000-01-01',
    residenceLocality: 'City',
    gender: '',
  } as const satisfies FormValues;
  const professional = {
    accountType: 'professional',
    displayName: 'Synthetic',
    specialty: 'General',
    practiceLocality: 'City',
  } as const satisfies FormValues;
  const institution = {
    accountType: 'institution',
    name: 'Synthetic',
    type: 'Clinic',
    location: 'City',
  } as const satisfies FormValues;
  expectTypeOf(patient).toExtend<FormValues>();
  expectTypeOf(professional).toExtend<AccountProfileInput>();
  expectTypeOf(institution).toExtend<AccountProfileInput>();

  // @ts-expect-error patient requires birth date and locality
  const missingPatient: FormValues = { accountType: 'patient', displayName: 'Synthetic' };
  // @ts-expect-error professional requires specialty and practice locality
  const missingProfessional: FormValues = { accountType: 'professional', displayName: 'Synthetic' };
  // @ts-expect-error institution requires name, type and location
  const missingInstitution: FormValues = { accountType: 'institution' };
  // Non-literal assignment must reject cross-variant fields too.
  const mixed = { ...patient, specialty: 'General' };
  // @ts-expect-error patient cannot carry professional fields
  const mixedPatient: FormValues = mixed;
  // @ts-expect-error professional cannot carry patient fields
  const mixedProfessional: FormValues = { ...professional, birthDate: '2000-01-01' };
  // @ts-expect-error institution cannot carry personal fields
  const mixedInstitution: FormValues = { ...institution, displayName: 'Synthetic' };
  // @ts-expect-error gender is a finite shared choice, not arbitrary text
  const invalidGender: FormValues = { ...patient, gender: 'unexpected' };
  // @ts-expect-error UI empty gender is not a transport gender
  const transport: AccountProfileInput = patient;
  void [
    missingPatient,
    missingProfessional,
    missingInstitution,
    mixedPatient,
    mixedProfessional,
    mixedInstitution,
    invalidGender,
    transport,
  ];
});
