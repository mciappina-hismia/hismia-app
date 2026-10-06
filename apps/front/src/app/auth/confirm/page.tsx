'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  browserAuth,
  cleanCallbackUrl,
  confirmedUser,
  ONBOARDING_PATH,
} from '../../../lib/auth/browser';

export default function Confirm(): React.ReactElement {
  const router = useRouter();
  // StrictMode replays this mounted instance's effect but preserves its ref.
  // A distinct visit gets its own ref and cannot inherit a stale exchange.
  const visit = useRef<Promise<boolean> | null>(null);
  const [message, setMessage] = useState('Verificando la confirmación…');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const callback = new URL(window.location.href);
    const providerError = callback.searchParams.has('error') || Boolean(callback.hash);
    const code = cleanCallbackUrl();
    const auth = browserAuth();
    if (!auth) {
      setFailed(true);
      setMessage('Configuración requerida. Contacta al administrador del sitio.');
      return;
    }
    if (!visit.current) {
      visit.current = providerError
        ? Promise.resolve(false)
        : code
          ? auth.auth
              .exchangeCodeForSession(code)
              .then(({ error }) => !error && confirmedUser(auth))
              .catch(() => false)
          : confirmedUser(auth).catch(() => false);
    }
    void visit.current.then((valid) => {
      if (!active) return;
      if (valid) router.replace(ONBOARDING_PATH);
      else {
        setFailed(true);
        setMessage('Confirmación no disponible. Inicia sesión después de confirmar tu email.');
      }
    });
    return () => {
      active = false;
    };
  }, [router]);
  return (
    <main>
      <h1>Confirmar email</h1>
      <p role={failed ? 'alert' : 'status'} aria-live={failed ? 'assertive' : 'polite'}>
        {message}
      </p>
      <a href="/login">Iniciar sesión</a>
    </main>
  );
}
