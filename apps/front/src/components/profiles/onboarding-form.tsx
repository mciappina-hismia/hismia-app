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
  patient: 'Patient',
  professional: 'Professional',
  institution: 'Institution',
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
          setMessage(
            'Account verification unavailable. Your entered values are preserved; try again.',
          );
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
            ? 'Check your profile fields and try again.'
            : result.kind === 'conflict'
              ? 'An existing profile has a different account type. Contact support.'
              : 'Profile service unavailable. Your entered values are preserved; try again.',
        );
    } catch {
      if (mounted.current && isCurrent())
        setMessage('Profile service unavailable. Your entered values are preserved; try again.');
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  if (saved)
    return (
      <p role="status" className="text-base leading-relaxed text-success">
        Profile saved or already existed ({labels[saved.accountType]}). No existing profile was
        updated.
      </p>
    );
  const fieldClass =
    'min-h-touch w-full rounded-xl border border-input-border bg-input px-4 py-3 text-base text-fg transition-colors focus:border-primary-strong disabled:cursor-not-allowed disabled:opacity-60';
  const labelClass = 'block text-sm font-medium text-fg';
  return (
    <form
      onSubmit={form.handleSubmit(submit, () =>
        setMessage('Check required fields and adult birth date.'),
      )}
      noValidate
      className="space-y-5"
    >
      <div className="space-y-2">
        <label htmlFor="accountType" className={labelClass}>
          Account type
        </label>
        <select
          id="accountType"
          {...typeRegistration}
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
      </div>
      {accountType === 'institution' ? (
        <div className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="name" className={labelClass}>
              Institution name
            </label>
            <input id="name" {...form.register('name')} className={fieldClass} />
          </div>
          <div className="space-y-2">
            <label htmlFor="type" className={labelClass}>
              Institution type
            </label>
            <input id="type" {...form.register('type')} className={fieldClass} />
          </div>
          <div className="space-y-2">
            <label htmlFor="location" className={labelClass}>
              Location
            </label>
            <input id="location" {...form.register('location')} className={fieldClass} />
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="displayName" className={labelClass}>
              Display name
            </label>
            <input id="displayName" {...form.register('displayName')} className={fieldClass} />
          </div>
          {accountType === 'patient' ? (
            <>
              <div className="space-y-2">
                <label htmlFor="birthDate" className={labelClass}>
                  Birth date
                </label>
                <input
                  id="birthDate"
                  type="date"
                  {...form.register('birthDate')}
                  className={fieldClass}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="gender" className={labelClass}>
                  Gender (optional)
                </label>
                <select id="gender" {...form.register('gender')} className={fieldClass}>
                  <option value="">Not provided</option>
                  {genders.map((gender) => (
                    <option key={gender} value={gender}>
                      {gender}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="residenceLocality" className={labelClass}>
                  Residence locality
                </label>
                <input
                  id="residenceLocality"
                  {...form.register('residenceLocality')}
                  className={fieldClass}
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <label htmlFor="specialty" className={labelClass}>
                  Specialty
                </label>
                <input id="specialty" {...form.register('specialty')} className={fieldClass} />
              </div>
              <div className="space-y-2">
                <label htmlFor="practiceLocality" className={labelClass}>
                  Practice locality
                </label>
                <input
                  id="practiceLocality"
                  {...form.register('practiceLocality')}
                  className={fieldClass}
                />
              </div>
            </>
          )}
        </div>
      )}
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
        {busy ? 'Saving…' : 'Save profile'}
      </button>
    </form>
  );
}
