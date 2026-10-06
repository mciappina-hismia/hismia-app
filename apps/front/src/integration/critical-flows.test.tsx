import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { AccountProfileInput } from '@hismia/types';
import Onboarding from '../app/onboarding/page';
import { PREFERENCE_KEY } from '../lib/auth/preference';

// Only the provider boundary is substituted. The page, form, checkedAccount,
// createProfile, normalization and shared Zod validation run unchanged.
const provider = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
}));
vi.mock('../lib/auth/browser', () => ({ browserAuth: () => ({ auth: provider }) }));

type RecordedRequest = { path: string; method: string; headers: Headers; body: unknown };
type Listener = (event: AuthChangeEvent, session: Session | null) => void;
const subject = 'synthetic-account-a';
const token = 'synthetic-bearer-a';
const timestamp = '2026-01-01T00:00:00Z';
const profiles: AccountProfileInput[] = [
  {
    accountType: 'patient',
    displayName: 'Paciente sintético',
    birthDate: '1990-01-01',
    residenceLocality: 'Localidad sintética',
  },
  {
    accountType: 'professional',
    displayName: 'Profesional sintético',
    specialty: 'Especialidad sintética',
    practiceLocality: 'Localidad sintética',
  },
  {
    accountType: 'institution',
    name: 'Institución sintética',
    type: 'Tipo sintético',
    location: 'Ubicación sintética',
  },
];
let requests: RecordedRequest[];
let listener: Listener;
let unsubscribe: ReturnType<typeof vi.fn>;
let gateResponse: () => Promise<Response>;
let saveResponse: (body: unknown) => Promise<Response>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function gate(): Response {
  return json({ sub: subject, email: 'synthetic@example.test', role: 'authenticated' });
}
function saved(body: unknown): Response {
  if (typeof body !== 'object' || body === null) throw new Error('Expected synthetic profile');
  return json({ ...body, createdAt: timestamp, updatedAt: timestamp }, 201);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}
function writes() {
  return requests.filter((request) => request.method === 'POST');
}
function gates() {
  return requests.filter((request) => request.path.endsWith('/auth/me'));
}
async function open(type: AccountProfileInput['accountType'] = 'patient') {
  window.sessionStorage.setItem(PREFERENCE_KEY, type);
  const view = render(<Onboarding />);
  await screen.findByRole('button', { name: 'Guardar perfil' });
  return view;
}
function fill(profile: AccountProfileInput) {
  const values =
    profile.accountType === 'patient'
      ? {
          'Nombre visible': profile.displayName,
          'Fecha de nacimiento': profile.birthDate,
          'Localidad de residencia': profile.residenceLocality,
        }
      : profile.accountType === 'professional'
        ? {
            'Nombre visible': profile.displayName,
            Especialidad: profile.specialty,
            'Localidad de ejercicio': profile.practiceLocality,
          }
        : {
            'Nombre de la institución': profile.name,
            'Tipo de institución': profile.type,
            Ubicación: profile.location,
          };
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
}
function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Guardar perfil' }));
}
function emit(event: AuthChangeEvent, id: string | null) {
  // Event listeners only inspect user.id; no synthetic SDK session is persisted.
  const session = id === null ? null : { user: { id } };
  act(() => listener(event, session as Session | null));
}
async function signin() {
  expect(await screen.findByRole('link', { name: /inicia sesión/i })).toHaveAttribute(
    'href',
    '/login',
  );
  expect(screen.queryByRole('button', { name: 'Guardar perfil' })).not.toBeInTheDocument();
}

beforeEach(() => {
  requests = [];
  window.sessionStorage.clear();
  provider.getUser.mockReset().mockResolvedValue({
    data: { user: { id: subject, email_confirmed_at: timestamp } },
    error: null,
  });
  provider.getSession.mockReset().mockResolvedValue({
    data: { session: { access_token: token, user: { id: subject } } },
    error: null,
  });
  unsubscribe = vi.fn();
  provider.onAuthStateChange.mockReset().mockImplementation((callback: Listener) => {
    listener = callback;
    return { data: { subscription: { unsubscribe } } };
  });
  gateResponse = async () => gate();
  saveResponse = async (body) => saved(body);
  // Deny all other HTTP: no actual network call or provider credentials are used.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, options: RequestInit = {}) => {
      if (typeof input !== 'string') throw new Error('Unexpected synthetic request type');
      const method = options.method ?? 'GET';
      const headers = new Headers(options.headers);
      const body: unknown = options.body ? JSON.parse(String(options.body)) : undefined;
      requests.push({ path: input, method, headers, body });
      expect(headers.get('Authorization')).toBe(`Bearer ${token}`);
      if (input === '/api/hismia/auth/me' && method === 'GET') {
        expect(options.cache).toBe('no-store');
        return gateResponse();
      }
      if (input === '/api/hismia/profiles/onboarding' && method === 'POST') {
        expect(headers.get('Content-Type')).toBe('application/json');
        return saveResponse(body);
      }
      throw new Error('Unexpected HTTP destination or method');
    }),
  );
});
afterEach(() => {
  cleanup();
  expect(unsubscribe).toHaveBeenCalledOnce();
  // Assert outside the fetch boundary too: production catches transport errors.
  // A denied request must fail this test, not merely produce a safe UI message.
  for (const request of requests) {
    expect([
      ['/api/hismia/auth/me', 'GET'],
      ['/api/hismia/profiles/onboarding', 'POST'],
    ]).toContainEqual([request.path, request.method]);
    expect(request.headers.get('Authorization')).toBe(`Bearer ${token}`);
    if (request.method === 'POST')
      expect(request.headers.get('Content-Type')).toBe('application/json');
  }
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe('real onboarding integration with synthetic HTTP', () => {
  it.each(profiles)(
    'creates an allowlisted $accountType profile after rechecking identity',
    async (profile) => {
      await open(profile.accountType);
      fill(profile);
      submit();
      expect(await screen.findByText(/Perfil guardado o ya existente/)).toHaveAttribute(
        'role',
        'status',
      );
      expect(writes()).toHaveLength(1);
      expect(writes()[0]?.body).toEqual(profile);
      expect(gates()).toHaveLength(2);
      expect(provider.getUser).toHaveBeenCalledTimes(2);
      expect(provider.getSession).toHaveBeenCalledTimes(2);
      expect(requests.map(({ method }) => method)).toEqual(['GET', 'GET', 'POST']);
    },
  );

  it.each(profiles)(
    'rejects empty $accountType fields without another gate or write',
    async (profile) => {
      await open(profile.accountType);
      submit();
      expect(await screen.findByRole('alert')).toHaveTextContent('Revisa los campos indicados.');
      const first = screen.getByLabelText(
        profile.accountType === 'institution' ? 'Nombre de la institución' : 'Nombre visible',
      );
      await waitFor(() => expect(first).toHaveFocus());
      expect(first).toHaveAttribute('aria-invalid', 'true');
      expect(first).toHaveAccessibleDescription(/no puede estar vacío/);
      expect(gates()).toHaveLength(1);
      expect(writes()).toHaveLength(0);
    },
  );

  it('rejects an underage calendar date through the shared validator', async () => {
    await open();
    fill({
      accountType: 'patient',
      displayName: 'Paciente sintético',
      birthDate: '2099-01-01',
      residenceLocality: 'Localidad sintética',
    });
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Revisa los campos indicados.');
    const birth = screen.getByLabelText('Fecha de nacimiento');
    await waitFor(() => expect(birth).toHaveFocus());
    expect(birth).toHaveAccessibleDescription(/al menos 18 años/);
    expect(writes()).toHaveLength(0);
  });

  it('clears patient-only values when changing to a professional profile', async () => {
    await open();
    fill(profiles[0]!);
    fireEvent.change(screen.getByLabelText('Tipo de cuenta'), {
      target: { value: 'professional' },
    });
    expect(screen.queryByLabelText('Fecha de nacimiento')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nombre visible')).toHaveValue('');
    fill(profiles[1]!);
    submit();
    await screen.findByText(/Perfil guardado o ya existente/);
    expect(writes()[0]?.body).toEqual(profiles[1]);
  });

  it('shows a type conflict and preserves the draft for a subsequent retry', async () => {
    saveResponse = async () => json({ code: 'synthetic-conflict' }, 409);
    await open('institution');
    fill(profiles[2]!);
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(/tipo de cuenta diferente/);
    expect(screen.getByLabelText('Nombre de la institución')).toHaveValue('Institución sintética');
    expect(screen.queryByText(/Perfil guardado o ya existente/)).not.toBeInTheDocument();
    saveResponse = async (body) => saved(body);
    submit();
    await screen.findByText(/Perfil guardado o ya existente/);
    expect(writes()).toHaveLength(2);
  });

  it('deduplicates submit events while real HTTP persistence is pending', async () => {
    const pending = deferred<Response>();
    saveResponse = () => pending.promise;
    await open('professional');
    fill(profiles[1]!);
    const form = screen.getByRole('button', { name: 'Guardar perfil' }).closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    expect(form).toHaveAttribute('aria-busy', 'true');
    fireEvent.submit(form);
    await act(async () => pending.resolve(saved(profiles[1])));
    await screen.findByText(/Perfil guardado o ya existente/);
    expect(writes()).toHaveLength(1);
    expect(gates()).toHaveLength(2);
  });

  it('keeps the real draft on same-account refresh, then removes it on signout', async () => {
    await open();
    fill(profiles[0]!);
    emit('TOKEN_REFRESHED', subject);
    expect(screen.getByLabelText('Nombre visible')).toHaveValue('Paciente sintético');
    emit('SIGNED_OUT', null);
    await signin();
    expect(writes()).toHaveLength(0);
  });

  it('removes an account A draft when account B signs in', async () => {
    await open('institution');
    fill(profiles[2]!);
    emit('SIGNED_IN', 'synthetic-account-b');
    await signin();
    expect(screen.queryByDisplayValue('Institución sintética')).not.toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it('refuses a silent provider account switch during pre-submit identity recheck', async () => {
    await open();
    fill(profiles[0]!);
    provider.getUser.mockResolvedValueOnce({
      data: { user: { id: 'synthetic-account-b', email_confirmed_at: timestamp } },
      error: null,
    });
    submit();
    await signin();
    expect(writes()).toHaveLength(0);
    expect(gates()).toHaveLength(1);
  });

  it('discards a late initial HTTP gate after an account switch', async () => {
    const pending = deferred<Response>();
    gateResponse = () => pending.promise;
    render(<Onboarding />);
    await waitFor(() => expect(gates()).toHaveLength(1));
    emit('SIGNED_IN', 'synthetic-account-b');
    await act(async () => pending.resolve(gate()));
    await signin();
    expect(writes()).toHaveLength(0);
  });

  it('does not create a profile when signout races the pre-submit HTTP gate', async () => {
    await open();
    fill(profiles[0]!);
    const pending = deferred<Response>();
    gateResponse = () => pending.promise;
    submit();
    await waitFor(() => expect(gates()).toHaveLength(2));
    emit('SIGNED_OUT', null);
    await act(async () => pending.resolve(gate()));
    await signin();
    expect(writes()).toHaveLength(0);
  });

  it.each(['SIGNED_OUT', 'SIGNED_IN'] as const)(
    'ignores a stale persistence response after %s',
    async (event) => {
      const pending = deferred<Response>();
      saveResponse = () => pending.promise;
      await open();
      fill(profiles[0]!);
      submit();
      await waitFor(() => expect(writes()).toHaveLength(1));
      emit(event, event === 'SIGNED_OUT' ? null : 'synthetic-account-b');
      await act(async () => pending.resolve(saved(profiles[0])));
      await signin();
      expect(screen.queryByText(/Perfil guardado o ya existente/)).not.toBeInTheDocument();
      // UI invalidation cannot cancel or revoke a request already sent to the server.
      expect(writes()).toHaveLength(1);
    },
  );
});
