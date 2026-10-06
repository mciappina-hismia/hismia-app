import type { AccountProfileInput } from '@hismia/types';

export type PatientInput = Extract<AccountProfileInput, { accountType: 'patient' }>;
export type ProfessionalInput = Extract<AccountProfileInput, { accountType: 'professional' }>;
export type InstitutionInput = Extract<AccountProfileInput, { accountType: 'institution' }>;

export type FormFieldName = keyof PatientInput | keyof ProfessionalInput | keyof InstitutionInput;

// Reject mixed variants even when assigned from a non-literal object.
type Exclusive<T> = T & Partial<Record<Exclude<FormFieldName, keyof T>, never>>;

// Only the select's empty option differs from the shared contract.
export type PatientFormValues = Exclusive<
  Omit<PatientInput, 'gender'> & { gender?: PatientInput['gender'] | '' }
>;
export type ProfessionalFormValues = Exclusive<ProfessionalInput>;
export type InstitutionFormValues = Exclusive<InstitutionInput>;
export type FormValues = PatientFormValues | ProfessionalFormValues | InstitutionFormValues;
