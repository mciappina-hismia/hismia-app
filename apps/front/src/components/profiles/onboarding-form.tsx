'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { accountProfileSchema } from '@hismia/validation';
import type { AccountProfileInput, PersistedProfile } from '@hismia/types';
import { ACCOUNT_TYPES, type AccountType } from '../../lib/auth/preference';
import { createProfile } from '../../lib/profiles/client';

type FormFields = {
  accountType: AccountType;
  displayName?: string;
  birthDate?: string;
  gender?: string;
  residenceLocality?: string;
  specialty?: string;
  practiceLocality?: string;
  name?: string;
  type?: string;
  location?: string;
};

export type SubmitAccess = () => Promise<
  { kind: 'ready'; token: string } | { kind: 'signin' | 'unavailable' }
>;

type Props = {
  authorize: SubmitAccess;
  isCurrent: () => boolean;
  initialType: AccountType | null;
  onSignin: () => void;
  now?: () => Date;
};

const labels: Record<AccountType, string> = {
  patient: 'Paciente',
  professional: 'Profesional',
  institution: 'Institución',
};
// Presentation copy only: the shared schema remains the validation authority.
const fieldMessages: Record<keyof FormFields, string> = {
  accountType: 'Elige un tipo de cuenta válido.',
  displayName: 'Ingresa un nombre visible; no puede estar vacío.',
  birthDate: 'Ingresa una fecha de nacimiento válida; debes tener al menos 18 años.',
  gender: 'Elige una de las opciones de género disponibles o no informes este dato.',
  residenceLocality: 'Ingresa una localidad de residencia; no puede estar vacía.',
  specialty: 'Ingresa una especialidad; no puede estar vacía.',
  practiceLocality: 'Ingresa una localidad de ejercicio; no puede estar vacía.',
  name: 'Ingresa un nombre de institución; no puede estar vacío.',
  type: 'Ingresa un tipo de institución; no puede estar vacío.',
  location: 'Ingresa una ubicación; no puede estar vacía.',
};
const genders = ['mujer', 'varón', 'no binario', 'otra identidad', 'prefiero no informar'] as const;

export function OnboardingForm({
  authorize,
  isCurrent,
  initialType,
  onSignin,
  now = () => new Date(),
}: Props): React.ReactElement {
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState<PersistedProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>(initialType ?? 'patient');
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const resolver: Resolver<FormFields> = useCallback(
    async (values, context, options) => {
      const normalized: FormFields = { ...values };
      if (normalized.accountType === 'patient' && !normalized.gender) delete normalized.gender;
      return zodResolver(accountProfileSchema(now().toISOString().slice(0, 10)))(
        normalized,
        context,
        options,
      ) as ReturnType<Resolver<FormFields>>;
    },
    [now],
  );
  const form = useForm<FormFields>({
    defaultValues: { accountType: initialType ?? 'patient' },
    resolver,
  });
  const typeRegistration = form.register('accountType');

  async function submit(input: FormFields): Promise<void> {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage('');
    try {
      const access = await authorize();
      if (!mounted.current || !isCurrent()) return;
      if (access.kind !== 'ready') {
        if (access.kind === 'signin') onSignin();
        else
          setMessage('No se pudo verificar tu cuenta. Tus datos se conservan; intenta nuevamente.');
        return;
      }
      const asOf = now().toISOString().slice(0, 10);
      const result = await createProfile(access.token, input as AccountProfileInput, asOf);
      if (!mounted.current || !isCurrent()) return;
      if (result.kind === 'saved') setSaved(result.profile);
      else if (result.kind === 'signin') onSignin();
      else
        setMessage(
          result.kind === 'invalid'
            ? 'Revisa los campos del perfil e intenta nuevamente.'
            : result.kind === 'conflict'
              ? 'El perfil existente tiene un tipo de cuenta diferente. Contacta a soporte.'
              : 'El servicio de perfiles no está disponible. Tus datos se conservan; intenta nuevamente.',
        );
    } catch {
      if (mounted.current && isCurrent())
        setMessage(
          'El servicio de perfiles no está disponible. Tus datos se conservan; intenta nuevamente.',
        );
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  if (saved)
    return (
      <p role="status" aria-live="polite" className="text-base leading-relaxed text-secondary-text">
        Perfil guardado o ya existente ({labels[saved.accountType]}). No se modificó ningún perfil
        existente.
      </p>
    );
  const fieldClass =
    'min-h-touch w-full rounded-xl border border-input-border bg-input px-4 py-3 text-base text-fg transition-colors focus:border-primary-strong disabled:cursor-not-allowed disabled:opacity-60';
  const labelClass = 'block text-sm font-medium text-fg';
  function errorAttributes(name: keyof FormFields) {
    const invalid = Boolean(form.formState.errors[name]);
    return { 'aria-invalid': invalid, 'aria-describedby': invalid ? `${name}-error` : undefined };
  }
  function fieldError(name: keyof FormFields) {
    return form.formState.errors[name] ? (
      <p id={`${name}-error`} className="text-sm text-danger">
        {fieldMessages[name]}
      </p>
    ) : null;
  }
  return (
    <form
      onSubmit={form.handleSubmit(submit, () => setMessage('Revisa los campos indicados.'))}
      noValidate
      aria-busy={busy}
      className="space-y-5"
    >
      <div className="space-y-2">
        <label htmlFor="accountType" className={labelClass}>
          Tipo de cuenta
        </label>
        <select
          id="accountType"
          {...typeRegistration}
          {...errorAttributes('accountType')}
          disabled={busy}
          onChange={(event) => {
            const type = event.target.value as AccountType;
            setAccountType(type);
            form.reset({ accountType: type });
            setMessage('');
          }}
          className={fieldClass}
        >
          {ACCOUNT_TYPES.map((type) => (
            <option key={type} value={type}>
              {labels[type]}
            </option>
          ))}
        </select>
        {fieldError('accountType')}
      </div>
      {accountType === 'institution' ? (
        <div className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="name" className={labelClass}>
              Nombre de la institución
            </label>
            <input
              id="name"
              {...form.register('name')}
              {...errorAttributes('name')}
              className={fieldClass}
            />
            {fieldError('name')}
          </div>
          <div className="space-y-2">
            <label htmlFor="type" className={labelClass}>
              Tipo de institución
            </label>
            <input
              id="type"
              {...form.register('type')}
              {...errorAttributes('type')}
              className={fieldClass}
            />
            {fieldError('type')}
          </div>
          <div className="space-y-2">
            <label htmlFor="location" className={labelClass}>
              Ubicación
            </label>
            <input
              id="location"
              {...form.register('location')}
              {...errorAttributes('location')}
              className={fieldClass}
            />
            {fieldError('location')}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="displayName" className={labelClass}>
              Nombre visible
            </label>
            <input
              id="displayName"
              {...form.register('displayName')}
              {...errorAttributes('displayName')}
              className={fieldClass}
            />
            {fieldError('displayName')}
          </div>
          {accountType === 'patient' ? (
            <>
              <div className="space-y-2">
                <label htmlFor="birthDate" className={labelClass}>
                  Fecha de nacimiento
                </label>
                <input
                  id="birthDate"
                  type="date"
                  {...form.register('birthDate')}
                  {...errorAttributes('birthDate')}
                  className={fieldClass}
                />
                {fieldError('birthDate')}
              </div>
              <div className="space-y-2">
                <label htmlFor="gender" className={labelClass}>
                  Género (opcional)
                </label>
                <select
                  id="gender"
                  {...form.register('gender')}
                  {...errorAttributes('gender')}
                  className={fieldClass}
                >
                  <option value="">Sin informar</option>
                  {genders.map((gender) => (
                    <option key={gender} value={gender}>
                      {gender}
                    </option>
                  ))}
                </select>
                {fieldError('gender')}
              </div>
              <div className="space-y-2">
                <label htmlFor="residenceLocality" className={labelClass}>
                  Localidad de residencia
                </label>
                <input
                  id="residenceLocality"
                  {...form.register('residenceLocality')}
                  {...errorAttributes('residenceLocality')}
                  className={fieldClass}
                />
                {fieldError('residenceLocality')}
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <label htmlFor="specialty" className={labelClass}>
                  Especialidad
                </label>
                <input
                  id="specialty"
                  {...form.register('specialty')}
                  {...errorAttributes('specialty')}
                  className={fieldClass}
                />
                {fieldError('specialty')}
              </div>
              <div className="space-y-2">
                <label htmlFor="practiceLocality" className={labelClass}>
                  Localidad de ejercicio
                </label>
                <input
                  id="practiceLocality"
                  {...form.register('practiceLocality')}
                  {...errorAttributes('practiceLocality')}
                  className={fieldClass}
                />
                {fieldError('practiceLocality')}
              </div>
            </>
          )}
        </div>
      )}
      <p role="status" aria-live="polite" className="text-sm text-muted">
        {busy ? 'Guardando tu perfil…' : ''}
      </p>
      {message && (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="min-h-touch w-full rounded-xl bg-primary-strong px-4 py-3 text-base font-semibold text-primary-text transition-colors hover:bg-secondary-text disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? 'Guardando…' : 'Guardar perfil'}
      </button>
    </form>
  );
}
