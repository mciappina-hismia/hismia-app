'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { browserAuth, confirmedUser, CONFIRM_PATH, ONBOARDING_PATH } from '../../lib/auth/browser';
import { ACCOUNT_TYPES, isAccountType, rememberPreference } from '../../lib/auth/preference';

type Mode = 'signup' | 'login';

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
    <main>
      <h1>{mode === 'signup' ? 'Create account' : 'Sign in'}</h1>
      <form onSubmit={submit} noValidate>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required disabled={busy} />
        <label htmlFor="password">Password</label>
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
        />
        {mode === 'signup' && (
          <>
            <label htmlFor="accountType">Account type (onboarding preference only)</label>
            <select id="accountType" name="accountType" defaultValue="" required disabled={busy}>
              <option value="">Choose account type</option>
              {ACCOUNT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </>
        )}
        <button type="submit" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
      </form>
      <p role="status" aria-live="polite">
        {message}
      </p>
      <a href={mode === 'signup' ? '/login' : '/signup'}>
        {mode === 'signup' ? 'Sign in' : 'Create account'}
      </a>
    </main>
  );
}
