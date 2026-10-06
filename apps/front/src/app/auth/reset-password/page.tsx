'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { browserAuth, RECOVERY_PATH } from '../../../lib/auth/browser';

import {
  consumeRecoveryCallback,
  createRecovery,
  supabaseRecovery,
  MIN_PASSWORD_LENGTH,
} from '../../../lib/auth/recovery';

type Status =
  | { kind: 'pending' }
  | { kind: 'no-recovery' }
  | { kind: 'ready' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string }
  | { kind: 'saved' }
  | { kind: 'unavailable'; message: string };

export default function ResetPassword(): React.ReactElement {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'pending' });
  const submitting = useRef(false);
  const passwordControl = useRef<HTMLInputElement>(null);
  const [invalid, setInvalid] = useState(false);
  const recovery = useRef<ReturnType<typeof createRecovery> | null>(null);

  useEffect(() => {
    let active = true;
    // Capture before cleanup; the application instance shares the promise on effect replay.
    const callback = consumeRecoveryCallback();
    const auth = browserAuth();
    if (!auth) {
      setStatus({
        kind: 'unavailable',
        message: 'Configuración requerida. Contactá al administrador del sitio.',
      });
      return;
    }
    recovery.current ??= createRecovery(supabaseRecovery(auth));
    void recovery.current.open(callback).then((valid) => {
      if (active) setStatus({ kind: valid ? 'ready' : 'no-recovery' });
    });
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting.current) return;
    setInvalid(false);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setInvalid(true);
      passwordControl.current?.focus();
      setStatus({
        kind: 'error',
        message: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      });
      return;
    }
    if (!recovery.current || (status.kind !== 'ready' && status.kind !== 'error')) return;
    submitting.current = true;
    setStatus({ kind: 'submitting' });
    try {
      const result = await recovery.current.changePassword(password);
      if (result === 'saved') {
        setPassword('');
        setStatus({ kind: 'saved' });
        router.replace('/login');
      } else if (result === 'signout-failed') {
        setPassword('');
        setStatus({
          kind: 'unavailable',
          message:
            'Tu contraseña cambió, pero no se pudo cerrar la sesión local. Cerrá la sesión antes de volver a ingresar.',
        });
      } else if (result === 'no-recovery') {
        setPassword('');
        setStatus({ kind: 'no-recovery' });
      } else {
        setStatus({
          kind: 'error',
          message: 'No se pudo actualizar la contraseña. Solicitá un nuevo enlace de recuperación.',
        });
      }
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

  if (status.kind === 'unavailable' || status.kind === 'saved') {
    return (
      <main>
        <p role={status.kind === 'saved' ? 'status' : 'alert'}>
          {status.kind === 'saved' ? 'Contraseña actualizada.' : status.message}
        </p>
        <a href="/login">Iniciá sesión</a>
      </main>
    );
  }

  if (status.kind === 'no-recovery') {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-bg px-4 py-8 sm:px-8 sm:py-12">
        <div className="grid w-full max-w-md gap-6 rounded-3xl border border-border bg-card p-8 shadow-xl shadow-primary-soft/40 sm:p-12">
          <header role="alert" className="space-y-3">
            <h1 className="text-4xl leading-tight font-semibold tracking-tight text-heading">
              Necesitás un enlace de recuperación
            </h1>
            <p className="text-base leading-relaxed text-muted">
              Abrí el enlace de recuperación que te llegó por email para establecer una nueva
              contraseña.
            </p>
          </header>
          <a
            href={RECOVERY_PATH}
            className="min-h-touch w-full rounded-xl bg-primary-strong px-4 py-3 text-base font-semibold text-primary-text transition-colors hover:bg-secondary-text text-center"
          >
            Solicitar un nuevo enlace
          </a>
        </div>
      </main>
    );
  }

  const errorMessage =
    status.kind === 'error'
      ? status.message
      : status.kind === 'submitting'
        ? 'Actualizando tu contraseña…'
        : null;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4 py-8 sm:px-8 sm:py-12">
      <div className="grid w-full max-w-md gap-6 rounded-3xl border-border bg-card p-8 shadow-xl shadow-primary-soft/40 sm:p-12">
        <header className="space-y-3">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight text-heading">
            Establecer nueva contraseña
          </h1>
          <p className="text-base leading-relaxed text-muted">
            Elegí una nueva contraseña para tu cuenta de Hismia.
          </p>
        </header>
        <form
          onSubmit={submit}
          noValidate
          aria-busy={status.kind === 'submitting'}
          className="space-y-5"
        >
          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-medium text-fg">
              Nueva contraseña
            </label>
            <input
              id="password"
              ref={passwordControl}
              aria-invalid={invalid}
              aria-describedby={invalid ? 'password-error' : undefined}
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
            <p
              id={invalid ? 'password-error' : undefined}
              role={status.kind === 'error' ? 'alert' : 'status'}
              aria-live={status.kind === 'error' ? 'assertive' : 'polite'}
              className={status.kind === 'error' ? 'text-sm text-danger' : 'text-sm text-muted'}
            >
              {errorMessage}
            </p>
          )}
          <button
            type="submit"
            disabled={status.kind === 'submitting'}
            className="min-h-touch w-full rounded-xl bg-primary-strong px-4 py-3 text-base font-semibold text-primary-text transition-colors hover:bg-secondary-text disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status.kind === 'submitting' ? 'Actualizando…' : 'Actualizar contraseña'}
          </button>
        </form>
        <p className="text-sm leading-relaxed text-muted">
          ¿Querés mantener tu contraseña actual?{' '}
          <a href="/login" className="text-primary-strong underline">
            Iniciá sesión
          </a>{' '}
          con tu contraseña actual.
        </p>
      </div>
    </main>
  );
}
