'use client';

import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { browserAuth } from '../../lib/auth/browser';
import { readPreference, type AccountType } from '../../lib/auth/preference';
import { verifyAccount } from '../../lib/profiles/client';
import { OnboardingForm, type SubmitAccess } from '../../components/profiles/onboarding-form';

async function checkedAccount(
  auth: SupabaseClient,
): Promise<{ kind: 'ready'; subject: string; token: string } | { kind: 'signin' | 'unavailable' }> {
  const { data: userData, error: userError } = await auth.auth.getUser();
  const user = userData.user;
  if (userError || !user?.id || !user.email_confirmed_at) return { kind: 'signin' };
  const { data: sessionData, error: sessionError } = await auth.auth.getSession();
  const session = sessionData.session;
  if (sessionError || !session?.access_token || session.user?.id !== user.id)
    return { kind: 'signin' };
  const gate = await verifyAccount(session.access_token);
  if (gate.kind !== 'ready') return gate;
  if (gate.subject !== user.id) return { kind: 'signin' };
  return { kind: 'ready', subject: user.id, token: session.access_token };
}

export default function Onboarding(): React.ReactElement {
  const [state, setState] = useState<'checking' | 'ready' | 'login' | 'setup' | 'unavailable'>(
    'checking',
  );
  const [preference, setPreference] = useState<AccountType | null>(null);
  const [subject, setSubject] = useState('');
  const identity = useRef('');
  const generation = useRef(0);
  const authRef = useRef<SupabaseClient | null>(null);
  useEffect(() => {
    let active = true;
    const auth = browserAuth();
    if (!auth) {
      setState('setup');
      return;
    }
    authRef.current = auth;
    // This callback is synchronous; never await Supabase SDK methods inside it.
    const {
      data: { subscription },
    } = auth.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      // Before the first gate settles, a material auth event invalidates its in-flight result.
      // Once settled, a same-account refresh keeps the draft; a switch or signout does not.
      if (identity.current && event !== 'SIGNED_OUT' && session?.user?.id === identity.current)
        return;
      generation.current++;
      identity.current = '';
      setSubject('');
      setState('login');
    });
    const initial = generation.current;
    void checkedAccount(auth)
      .then((result) => {
        if (!active || initial !== generation.current) return;
        if (result.kind === 'ready') {
          identity.current = result.subject;
          setSubject(result.subject);
          setPreference(readPreference());
          setState('ready');
        } else setState(result.kind === 'signin' ? 'login' : 'unavailable');
      })
      .catch(() => {
        if (active && initial === generation.current) setState('unavailable');
      });
    return () => {
      active = false;
      generation.current++;
      subscription.unsubscribe();
      authRef.current = null;
    };
  }, []);

  const authorize: SubmitAccess = async () => {
    const auth = authRef.current;
    const expected = identity.current;
    const version = generation.current;
    if (!auth || !expected) return { kind: 'signin' };
    try {
      const result = await checkedAccount(auth);
      if (version !== generation.current || identity.current !== expected)
        return { kind: 'signin' };
      if (result.kind !== 'ready') return result;
      if (result.subject !== expected) return { kind: 'signin' };
      return { kind: 'ready', token: result.token };
    } catch {
      return { kind: 'unavailable' };
    }
  };
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4 py-8 sm:px-8 sm:py-12">
      <div className="grid w-full max-w-2xl gap-6 rounded-3xl border border-border bg-card p-8 shadow-xl shadow-primary-soft/40 sm:p-12">
        <header className="space-y-3">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight text-heading">
            Onboarding
          </h1>
          {state === 'ready' && (
            <p className="text-base leading-relaxed text-muted">
              Choose your account type and complete your profile. A signup preference is not a role.
            </p>
          )}
        </header>
        {state === 'checking' && (
          <p role="status" className="text-base leading-relaxed text-muted">
            Checking your account…
          </p>
        )}
        {state === 'setup' && (
          <p role="status" className="text-base leading-relaxed text-muted">
            Setup required. Contact the site administrator.
          </p>
        )}
        {state === 'login' && (
          <p role="status" className="text-base leading-relaxed text-muted">
            Confirm your email and{' '}
            <a href="/login" className="text-primary-strong underline">
              sign in
            </a>{' '}
            to continue.
          </p>
        )}
        {state === 'unavailable' && (
          <p role="status" className="text-base leading-relaxed text-muted">
            Account verification unavailable. Please try again later.
          </p>
        )}
        {state === 'ready' && (
          <OnboardingForm
            key={subject}
            authorize={authorize}
            isCurrent={() => identity.current === subject}
            initialType={preference}
            onSignin={() => {
              generation.current++;
              identity.current = '';
              setSubject('');
              setState('login');
            }}
          />
        )}
      </div>
    </main>
  );
}
