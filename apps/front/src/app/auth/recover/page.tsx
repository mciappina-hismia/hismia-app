'use client';

import { useRef, useState, type FormEvent } from 'react';
import { browserAuth, RECOVERY_PATH } from '../../../lib/auth/browser';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Recover(): React.ReactElement {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting.current) return;
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setMessage('Revisa tu email.');
      return;
    }
    const auth = browserAuth();
    if (!auth) {
      setMessage('Configuración requerida. Contacta al administrador del sistema.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    setMessage('');
    try {
      const redirectTo = `${window.location.origin}${RECOVERY_PATH}`;
      // Neutral messaging on purpose: the same response is returned whether
      // or not the email matches an account. Prevents email enumeration.
      await auth.auth.resetPasswordForEmail(trimmed, { redirectTo });
      setMessage(
        'Si este email puede ser recuperado, un enlace de recuperación llegará en los próximos minutos. Revisa tu carpeta de spam.',
      );
    } catch {
      setMessage(
        'Si este email puede ser recuperado, un enlace de recuperación llegará en los próximos minutos. Revisa tu carpeta de spam.',
      );
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
        <form onSubmit={submit} noValidate className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium text-fg">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
              className="min-h-touch w-full rounded-xl border border-input-border bg-input px-4 py-3 text-base text-fg transition-colors focus:border-primary-strong disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
          {message && (
            <p role="status" aria-live="polite" className="text-sm text-muted">
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
          Recuerdas tu contraseña?{' '}
          <a href="/login" className="text-primary-strong underline">
            Iniciar sesión
          </a>
          .
        </p>
      </div>
    </main>
  );
}
