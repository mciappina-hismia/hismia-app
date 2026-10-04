'use client';

import { useEffect, useState } from 'react';
import { browserAuth, confirmedUser } from '../../lib/auth/browser';
import { readPreference, type AccountType } from '../../lib/auth/preference';

export default function Onboarding(): React.ReactElement {
  const [state, setState] = useState<'checking' | 'confirmed' | 'login' | 'setup'>('checking');
  const [preference, setPreference] = useState<AccountType | null>(null);
  useEffect(() => {
    const auth = browserAuth();
    if (!auth) {
      setState('setup');
      return;
    }
    let active = true;
    void confirmedUser(auth)
      .then((valid) => {
        if (active) {
          if (valid) setPreference(readPreference());
          setState(valid ? 'confirmed' : 'login');
        }
      })
      .catch(() => {
        if (active) setState('login');
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <main>
      <h1>Onboarding</h1>
      {state === 'checking' && <p role="status">Checking your account…</p>}
      {state === 'setup' && <p role="status">Setup required. Contact the site administrator.</p>}
      {state === 'login' && (
        <p role="status">
          Confirm your email and <a href="/login">sign in</a> to continue.
        </p>
      )}
      {state === 'confirmed' && (
        <p role="status">
          Email confirmed. {preference && `${preference} preference (not a role). `}Profile forms
          and saving your profile are not available yet.
        </p>
      )}
    </main>
  );
}
