export type HealthStatus = 'ok' | 'degraded' | 'down';

export interface HealthResponse {
  status: HealthStatus;
  apiVersion: ApiVersion;
  uptimeSeconds: number;
}

export type ApiVersion = `v${number}`;

/** Requested account category, never an authorization role. */
export type AccountType = 'patient' | 'professional' | 'institution';
export type PatientGender =
  'mujer' | 'varón' | 'no binario' | 'otra identidad' | 'prefiero no informar';

export interface PatientProfileInput {
  accountType: 'patient';
  displayName: string;
  /** YYYY-MM-DD; validated against an explicit reference calendar date. */
  birthDate: string;
  gender?: PatientGender;
  residenceLocality: string;
}

export interface ProfessionalProfileInput {
  accountType: 'professional';
  displayName: string;
  specialty: string;
  practiceLocality: string;
}

export interface InstitutionProfileInput {
  accountType: 'institution';
  name: string;
  type: string;
  location: string;
}

/** Untrusted profile fields only; trusted identity is supplied separately by the server. */
export type AccountProfileInput =
  PatientProfileInput | ProfessionalProfileInput | InstitutionProfileInput;

/** Own persisted profile only; no identity context or account privileges. */
export type PersistedProfile = AccountProfileInput & {
  createdAt: string;
  updatedAt: string;
};
