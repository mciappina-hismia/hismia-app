'use client';

import { useRef, useState, type FormEvent } from 'react';
import { browserAuth } from '../../../lib/auth/browser';
import { requestRecovery, RECOVERY_MESSAGE } from '../../../lib/auth/recovery';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Recover(): React.ReactElement {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const submitting = useRef(false);
  const emailControl = useRef<HTMLInputElement>(null);
  const [invalid, setInvalid] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting.current) return;
    const trimmed = email.trim();
    setInvalid(false);
    setFailed(false);
    if (!EMAIL_RE.test(trimmed)) {
      setInvalid(true);
      setFailed(true);
      emailControl.current?.focus();
      setMessage('Revisa tu email.');
      return;
    }
    const auth = browserAuth();
    if (!auth) {
      setFailed(true);
      setMessage('Configuración requerida. Contacta al administrador del sistema.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    setMessage('');
    try {
      await requestRecovery(auth, trimmed, window.location.origin);
      setMessage(RECOVERY_MESSAGE);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4 py-8 sm:px-8 sm:py-12">
      <div className="grid w-full max-w-md gap-6 rounded-3xl border border-border bg-card p-8 shadow-xl shadow-primary-soft/40 sm:p-12">
        <header className="space-y-3">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight text-heading">
            Recuperar contraseña
          </h1>
          <p className="text-base leading-relaxed text-muted">
            Ingresa el email de tu cuenta de Hismia y te enviaremos un enlace de recuperación si
            coincide.
          </p>
        </header>
        <form onSubmit={submit} noValidate aria-busy={busy} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium text-fg">
              Email
            </label>
            <input
              id="email"
              ref={emailControl}
              aria-invalid={invalid}
              aria-describedby={invalid ? 'email-error' : undefined}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
              className="min-h-touch w-full rounded-xl border border-input-border bg-input px-4 py-3 text-base text-fg transition-colors focus:border-primary-strong disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
          <p role="status" aria-live="polite" className="text-sm text-muted">
            {busy ? 'Enviando el enlace de recuperación…' : !failed ? message : ''}
          </p>
          {failed && message && (
            <p
              id={invalid ? 'email-error' : undefined}
              role="alert"
              className="text-sm text-danger"
            >
              {message}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="min-h-touch w-full rounded-xl bg-primary-strong px-4 py-3 text-base font-semibold text-primary-text transition-colors hover:bg-secondary-text disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Enviando…' : 'Enviar enlace de recuperación'}
          </button>
        </form>
        <p className="text-sm leading-relaxed text-muted">
          ¿Recuerdas tu contraseña?{' '}
          <a href="/login" className="text-primary-strong underline">
            Iniciar sesión
          </a>
          .
        </p>
      </div>
    </main>
  );
}
