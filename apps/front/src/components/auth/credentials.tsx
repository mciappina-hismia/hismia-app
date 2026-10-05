'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { browserAuth, confirmedUser, CONFIRM_PATH, ONBOARDING_PATH } from '../../lib/auth/browser';
import { ACCOUNT_TYPES, isAccountType, rememberPreference } from '../../lib/auth/preference';

type Mode = 'signup' | 'login';

const accountTypeLabels = {
  patient: 'Paciente',
  professional: 'Profesional',
  institution: 'Institución',
};

const fieldClassName =
  'min-h-touch w-full rounded-xl border border-input-border bg-input px-4 py-3 text-base text-fg transition-colors focus:border-primary-strong disabled:cursor-not-allowed disabled:opacity-60';

export function Credentials({ mode }: { mode: Mode }): React.ReactElement {
  const router = useRouter();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const email = String(values.get('email') ?? '').trim();
    const accountType = String(values.get('accountType') ?? '');
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      password.length < 6 ||
      (mode === 'signup' && !isAccountType(accountType))
    ) {
      setMessage('Check your email, password and account type.');
      return;
    }
    const auth = browserAuth();
    if (!auth) {
      setMessage('Setup required. Contact the site administrator.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    setMessage('');
    let unexpectedSession = false;
    try {
      if (mode === 'signup') {
        // Do not send the preference as user_metadata or grant authority from it.
        const result = await auth.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}${CONFIRM_PATH}` },
        });
        if (result.data.session) {
          unexpectedSession = true;
          // A session here means confirmation is not enforced by the provider.
          // Clear only this browser's session; do not revoke other devices.
          await auth.auth.signOut({ scope: 'local' });
          setMessage('Registration unavailable. Contact the site administrator.');
        } else {
          if (!result.error && isAccountType(accountType)) rememberPreference(accountType);
          setMessage('If this address can register, check your email for a confirmation link.');
        }
      } else {
        const result = await auth.auth.signInWithPassword({ email, password });
        if (result.error || !(await confirmedUser(auth))) {
          setMessage('Sign-in unavailable. Check your details and confirm your email.');
        } else {
          router.replace(ONBOARDING_PATH);
        }
      }
    } catch {
      setMessage(
        mode === 'signup'
          ? unexpectedSession
            ? 'Registration unavailable. Contact the site administrator.'
            : 'If this address can register, check your email for a confirmation link.'
          : 'Sign-in unavailable. Check your details and confirm your email.',
      );
    } finally {
      setPassword('');
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4 py-8 sm:px-8 sm:py-12">
      <div className="grid w-full max-w-5xl rounded-3xl border border-border bg-card shadow-xl shadow-primary-soft/40 lg:grid-cols-2">
        <aside
          className="hidden flex-col justify-between rounded-l-3xl bg-secondary p-12 lg:flex"
          aria-label="Acerca de Hismia"
        >
          <p className="text-3xl font-bold tracking-tight" aria-label="Hismia">
            <span className="text-brand-his">His</span>
            <span className="text-brand-me">mia</span>
          </p>
          <div className="py-16">
            <div
              className="mb-8 flex size-20 items-center justify-center rounded-3xl border border-primary/30 bg-primary-soft text-4xl font-semibold text-primary-strong"
              aria-hidden="true"
            >
              H
            </div>
            <h2 className="text-4xl leading-tight font-semibold tracking-tight text-heading">
              Tu cuenta.
              <br />
              Tu perfil.
            </h2>
            <p className="mt-6 max-w-sm text-lg leading-relaxed text-secondary-text">
              Crea tu cuenta o inicia sesión para continuar con tu perfil en Hismia.
            </p>
          </div>
          <p className="text-sm leading-relaxed text-secondary-text">
            Primero confirma tu correo electrónico. Tu preferencia de cuenta ayuda a orientar el
            registro de tu perfil.
          </p>
        </aside>

        <section className="min-w-0 px-6 py-8 sm:px-10 sm:py-12 lg:px-12" aria-labelledby="auth-title">
          <p className="mb-10 text-2xl font-bold tracking-tight text-brand-his lg:hidden">Hismia</p>
          <header className="mb-8">
            <p className="mb-3 text-xs font-semibold tracking-widest text-primary-strong uppercase">
              {mode === 'signup' ? 'Comenzar' : 'Tu cuenta de Hismia'}
            </p>
            <h1
              id="auth-title"
              className="text-3xl font-semibold tracking-tight text-heading sm:text-4xl"
            >
              {mode === 'signup' ? 'Crear Cuenta' : 'Iniciar Sesión'}
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted">
              {mode === 'signup'
                ? 'Regístrate con tu correo electrónico. Te enviaremos un enlace de confirmación antes de continuar.'
                : 'Inicia sesión con tu correo electrónico confirmado para continuar a tu perfil.'}
            </p>
          </header>

          <form onSubmit={submit} noValidate aria-busy={busy} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-fg">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled={busy}
                className={fieldClassName}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-fg">
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
                className={fieldClassName}
              />
            </div>
            {mode === 'signup' && (
              <div className="space-y-2">
                <label htmlFor="accountType" className="block text-sm font-medium text-fg">
                  Tipo de cuenta
                </label>
                <select
                  id="accountType"
                  name="accountType"
                  defaultValue=""
                  required
                  disabled={busy}
                  aria-describedby="account-type-help"
                  className={fieldClassName}
                >
                  <option value="">Elegir tipo de cuenta</option>
                  {ACCOUNT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {accountTypeLabels[type]}
                    </option>
                  ))}
                </select>
                <p id="account-type-help" className="text-sm leading-relaxed text-muted">
                  Esta es una preferencia de onboarding, no un permiso o rol verificado.
                </p>
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="min-h-touch w-full rounded-xl bg-primary-strong px-4 py-3 text-base font-semibold text-primary-text transition-colors hover:bg-secondary-text disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? 'Por favor, espere…' : mode === 'signup' ? 'Crear Cuenta' : 'Iniciar Sesión'}
            </button>
          </form>
          <p
            role="status"
            aria-live="polite"
            className="mt-4 min-h-6 text-sm leading-relaxed text-secondary-text"
          >
            {message}
          </p>
          <p className="mt-6 border-t border-border pt-6 text-center text-sm text-muted">
            {mode === 'signup' ? '¿Ya tienes una cuenta?' : '¿Nuevo en Hismia?'}{' '}
            <a
              href={mode === 'signup' ? '/login' : '/signup'}
              className="inline-flex min-h-touch items-center rounded-md px-2 font-semibold text-primary-strong underline underline-offset-4 hover:text-secondary-text"
            >
              {mode === 'signup' ? 'Iniciar Sesión' : 'Crear Cuenta'}
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
