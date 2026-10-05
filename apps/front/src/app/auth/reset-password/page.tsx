'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { browserAuth, RECOVERY_PATH } from '../../../lib/auth/browser';

const MIN_PASSWORD_LENGTH = 6;

type Status =
  | { kind: 'pending' }
  | { kind: 'no-recovery' }
  | { kind: 'ready' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string }
  | { kind: 'saved' };

export default function ResetPassword(): React.ReactElement {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'pending' });
  const submitting = useRef(false);

  useEffect(() => {
    let active = true;
    const auth = browserAuth();
    if (!auth) {
      setStatus({ kind: 'error', message: 'Setup required. Contact the site administrator.' });
      return;
    }
    void auth.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data.session) {
          setStatus({ kind: 'no-recovery' });
          return;
        }
        setStatus({ kind: 'ready' });
      })
      .catch(() => {
        if (active) setStatus({ kind: 'no-recovery' });
      });
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting.current) return;
    if (password.length < MIN_PASSWORD_LENGTH) {
      setStatus({
        kind: 'error',
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      });
      return;
    }
    const auth = browserAuth();
    if (!auth) {
      setStatus({ kind: 'error', message: 'Setup required. Contact the site administrator.' });
      return;
    }
    submitting.current = true;
    setStatus({ kind: 'submitting' });
    try {
      const { error } = await auth.auth.updateUser({ password });
      if (error) {
        setStatus({
          kind: 'error',
          message: 'Password update unavailable. Try requesting a new recovery link.',
        });
        return;
      }
      setStatus({ kind: 'saved' });
      // The recovery session is invalidated by Supabase once the password
      // changes. Send the user to sign in with the new password.
      await auth.auth.signOut({ scope: 'local' });
      router.replace('/login');
    } catch {
      setStatus({
        kind: 'error',
        message: 'Password update unavailable. Try requesting a new recovery link.',
      });
    } finally {
      submitting.current = false;
    }
  }

  if (status.kind === 'pending') {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-bg px-4 py-8 sm:px-8 sm:py-12">
        <div className="grid w-full max-w-md gap-6 rounded-3xl border border-border bg-card p-8 shadow-xl shadow-primary-soft/40 sm:p-12">
          <p role="status" aria-live="polite" className="text-base leading-relaxed text-muted">
            Verificando tu sesión de recuperación…
          </p>
        </div>
      </main>
    );
  }

  if (status.kind === 'no-recovery') {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-bg px-4 py-8 sm:px-8 sm:py-12">
        <div className="grid w-full max-w-md gap-6 rounded-3xl border border-border bg-card p-8 shadow-xl shadow-primary-soft/40 sm:p-12">
          <header className="space-y-3">
            <h1 className="text-4xl leading-tight font-semibold tracking-tight text-heading">
              Recovery link required
            </h1>
            <p className="text-base leading-relaxed text-muted">
              Open the recovery link from your email to set a new password.
            </p>
          </header>
          <a
            href={RECOVERY_PATH}
            className="min-h-touch w-full rounded-xl bg-primary-strong px-4 py-3 text-base font-semibold text-primary-text transition-colors hover:bg-secondary-text text-center"
          >
            Request a new link
          </a>
        </div>
      </main>
    );
  }

  const errorMessage =
    status.kind === 'error'
      ? status.message
      : status.kind === 'submitting'
        ? 'Updating your password…'
        : null;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4 py-8 sm:px-8 sm:py-12">
      <div className="grid w-full max-w-md gap-6 rounded-3xl border-border bg-card p-8 shadow-xl shadow-primary-soft/40 sm:p-12">
        <header className="space-y-3">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight text-heading">
            Set new password
          </h1>
          <p className="text-base leading-relaxed text-muted">
            Choose a new password for your Hismia account.
          </p>
        </header>
        <form onSubmit={submit} noValidate className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-medium text-fg">
              New password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={status.kind === 'submitting'}
              className="min-h-touch w-full rounded-xl border border-input-border bg-input px-4 py-3 text-base text-fg transition-colors focus:border-primary-strong disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
          {errorMessage && (
            <p role="status" aria-live="polite" className="text-sm text-muted">
              {errorMessage}
            </p>
          )}
          <button
            type="submit"
            disabled={status.kind === 'submitting'}
            className="min-h-touch w-full rounded-xl bg-primary-strong px-4 py-3 text-base font-semibold text-primary-text transition-colors hover:bg-secondary-text disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status.kind === 'submitting' ? 'Updating…' : 'Update password'}
          </button>
        </form>
        <p className="text-sm leading-relaxed text-muted">
          Want to keep your old password?{' '}
          <a href="/login" className="text-primary-strong underline">
            Sign in
          </a>{' '}
          with your current credentials.
        </p>
      </div>
    </main>
  );
}
