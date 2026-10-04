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
  const [message, setMessage] = useState('Checking confirmation…');
  useEffect(() => {
    let active = true;
    const callback = new URL(window.location.href);
    const providerError = callback.searchParams.has('error') || Boolean(callback.hash);
    const code = cleanCallbackUrl();
    const auth = browserAuth();
    if (!auth) {
      setMessage('Setup required. Contact the site administrator.');
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
      else setMessage('Confirmation unavailable. Sign in after confirming your email.');
    });
    return () => {
      active = false;
    };
  }, [router]);
  return (
    <main>
      <h1>Confirm email</h1>
      <p role="status" aria-live="polite">
        {message}
      </p>
      <a href="/login">Sign in</a>
    </main>
  );
}
