import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OnboardingForm as ProfileForm, type SubmitAccess } from './onboarding-form';
import type { ComponentProps } from 'react';
function OnboardingForm(props: Omit<ComponentProps<typeof ProfileForm>, 'isCurrent'>) {
  return <ProfileForm {...props} isCurrent={() => true} />;
}

const { createProfile } = vi.hoisted(() => ({ createProfile: vi.fn() }));
vi.mock('../../lib/profiles/client', () => ({ createProfile }));
const today = () => new Date('2026-03-01T12:00:00Z');
const authorize = vi.fn<SubmitAccess>();
beforeEach(() => {
  authorize.mockReset().mockResolvedValue({ kind: 'ready', token: 'synthetic-token' });
  createProfile.mockReset().mockResolvedValue({
    kind: 'saved',
    profile: {
      accountType: 'professional',
      displayName: 'Old name',
      specialty: 'General',
      practiceLocality: 'City',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  });
});
afterEach(cleanup);
function submit() {
  fireEvent.click(screen.getByRole('button', { name: /guardar perfil/i }));
}
function fillProfessional() {
  fireEvent.change(screen.getByLabelText('Nombre visible'), { target: { value: 'Doctor Test' } });
  fireEvent.change(screen.getByLabelText('Especialidad'), { target: { value: 'General' } });
  fireEvent.change(screen.getByLabelText('Localidad de ejercicio'), { target: { value: 'City' } });
}

describe('create-only profile form', () => {
  it('passes trimmed validated values to transport, not raw UI input', async () => {
    render(
      <OnboardingForm
        authorize={authorize}
        initialType="professional"
        now={today}
        onSignin={vi.fn()}
      />,
    );
    fillProfessional();
    fireEvent.change(screen.getByLabelText('Nombre visible'), {
      target: { value: ' Doctor Test ' },
    });
    submit();
    await waitFor(() =>
      expect(createProfile).toHaveBeenCalledWith(
        'synthetic-token',
        {
          accountType: 'professional',
          displayName: 'Doctor Test',
          specialty: 'General',
          practiceLocality: 'City',
        },
        '2026-03-01',
      ),
    );
  });
  it('clears hidden patient fields and errors through a round-trip type change', async () => {
    render(
      <OnboardingForm authorize={authorize} initialType="patient" now={today} onSignin={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Nombre visible'), { target: { value: 'Synthetic' } });
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), {
      target: { value: '2008-02-29' },
    });
    fireEvent.change(screen.getByLabelText('Género (opcional)'), { target: { value: 'mujer' } });
    submit();
    await screen.findByText('Ingresa una localidad de residencia; no puede estar vacía.');
    fireEvent.change(screen.getByLabelText('Tipo de cuenta'), { target: { value: 'institution' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tipo de cuenta'), { target: { value: 'patient' } });
    expect(screen.getByLabelText('Nombre visible')).toHaveValue('');
    expect(screen.getByLabelText('Fecha de nacimiento')).toHaveValue('');
    expect(screen.getByLabelText('Género (opcional)')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Tipo de cuenta'), {
      target: { value: 'professional' },
    });
    fillProfessional();
    submit();
    await waitFor(() =>
      expect(createProfile).toHaveBeenCalledWith(
        'synthetic-token',
        {
          accountType: 'professional',
          displayName: 'Doctor Test',
          specialty: 'General',
          practiceLocality: 'City',
        },
        '2026-03-01',
      ),
    );
  });
  it('never posts if identity becomes stale during async authorization', async () => {
    let current = true;
    authorize.mockImplementationOnce(async () => {
      current = false;
      return { kind: 'ready', token: 'synthetic-token' };
    });
    render(
      <ProfileForm
        authorize={authorize}
        isCurrent={() => current}
        initialType="professional"
        now={today}
        onSignin={vi.fn()}
      />,
    );
    fillProfessional();
    submit();
    await waitFor(() => expect(authorize).toHaveBeenCalledOnce());
    expect(createProfile).not.toHaveBeenCalled();
  });
  it.each([
    ['patient', ['Nombre visible', 'Fecha de nacimiento', 'Localidad de residencia']],
    ['professional', ['Nombre visible', 'Especialidad', 'Localidad de ejercicio']],
    ['institution', ['Nombre de la institución', 'Tipo de institución', 'Ubicación']],
  ] as const)('describes every invalid %s field and focuses the first', async (type, labels) => {
    render(
      <OnboardingForm authorize={authorize} initialType={type} now={today} onSignin={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Guardar perfil' }));
    await waitFor(() => expect(screen.getByLabelText(labels[0])).toHaveFocus());
    for (const label of labels) {
      const control = screen.getByLabelText(label);
      expect(control).toHaveAttribute('aria-invalid', 'true');
      expect(control).toHaveAccessibleDescription();
      const description = document.getElementById(control.getAttribute('aria-describedby')!);
      expect(description).toHaveTextContent(/Ingresa/);
    }
    expect(screen.getByRole('alert')).toHaveTextContent('Revisa los campos indicados.');
    expect(authorize).not.toHaveBeenCalled();
  });
  it('announces saving politely and clears validation descriptions after correction', async () => {
    createProfile.mockImplementation(() => new Promise(() => {}));
    render(
      <OnboardingForm
        authorize={authorize}
        initialType="professional"
        now={today}
        onSignin={vi.fn()}
      />,
    );
    submit();
    await waitFor(() =>
      expect(screen.getByLabelText('Nombre visible')).toHaveAttribute('aria-invalid', 'true'),
    );
    fillProfessional();
    submit();
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Guardando tu perfil…'),
    );
    expect(screen.getByLabelText('Nombre visible')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText('Nombre visible')).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('validates March 1 leap boundary, omits absent gender and sends selected gender', async () => {
    render(
      <OnboardingForm authorize={authorize} initialType="patient" now={today} onSignin={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Nombre visible'), {
      target: { value: 'Patient Test' },
    });
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), {
      target: { value: '2008-02-29' },
    });
    fireEvent.change(screen.getByLabelText('Localidad de residencia'), {
      target: { value: 'City' },
    });
    submit();
    await waitFor(() =>
      expect(createProfile).toHaveBeenCalledWith(
        'synthetic-token',
        {
          accountType: 'patient',
          displayName: 'Patient Test',
          birthDate: '2008-02-29',
          residenceLocality: 'City',
        },
        '2026-03-01',
      ),
    );
    expect(screen.getByRole('status')).toHaveTextContent(/perfil guardado o ya existente/i);
    expect(screen.getByRole('status')).toHaveClass('text-secondary-text');
    cleanup();
    render(
      <OnboardingForm authorize={authorize} initialType="patient" now={today} onSignin={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Nombre visible'), {
      target: { value: 'Patient Test' },
    });
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), {
      target: { value: '2008-02-29' },
    });
    fireEvent.change(screen.getByLabelText('Localidad de residencia'), {
      target: { value: 'City' },
    });
    fireEvent.change(screen.getByLabelText('Género (opcional)'), {
      target: { value: 'no binario' },
    });
    submit();
    await waitFor(() =>
      expect(createProfile).toHaveBeenLastCalledWith(
        'synthetic-token',
        {
          accountType: 'patient',
          displayName: 'Patient Test',
          birthDate: '2008-02-29',
          residenceLocality: 'City',
          gender: 'no binario',
        },
        '2026-03-01',
      ),
    );
  });
  it('uses exact institutional fields and clears professional fields on type change', async () => {
    render(
      <OnboardingForm
        authorize={authorize}
        initialType="professional"
        now={today}
        onSignin={vi.fn()}
      />,
    );
    fillProfessional();
    fireEvent.change(screen.getByLabelText('Tipo de cuenta'), { target: { value: 'institution' } });
    fireEvent.change(screen.getByLabelText('Nombre de la institución'), {
      target: { value: 'Test Center' },
    });
    fireEvent.change(screen.getByLabelText('Tipo de institución'), { target: { value: 'Clinic' } });
    fireEvent.change(screen.getByLabelText('Ubicación'), { target: { value: 'City' } });
    submit();
    await waitFor(() =>
      expect(createProfile).toHaveBeenCalledWith(
        'synthetic-token',
        { accountType: 'institution', name: 'Test Center', type: 'Clinic', location: 'City' },
        '2026-03-01',
      ),
    );
  });
  it('blocks underage on February 28 and preserves fields', async () => {
    render(
      <OnboardingForm
        authorize={authorize}
        initialType="patient"
        now={() => new Date('2026-02-28T23:00:00Z')}
        onSignin={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Nombre visible'), {
      target: { value: 'Patient Test' },
    });
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), {
      target: { value: '2008-02-29' },
    });
    fireEvent.change(screen.getByLabelText('Localidad de residencia'), {
      target: { value: 'City' },
    });
    submit();
    await screen.findByText(/al menos 18 años/i);
    expect(authorize).not.toHaveBeenCalled();
    expect(createProfile).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nombre visible')).toHaveValue('Patient Test');
  });
  it('uses the current UTC day after async identity refresh at midnight', async () => {
    let current = new Date('2026-02-28T23:59:59Z');
    authorize.mockImplementationOnce(async () => {
      current = new Date('2026-03-01T00:00:01Z');
      return { kind: 'ready', token: 'synthetic-token' };
    });
    render(
      <OnboardingForm
        authorize={authorize}
        initialType="professional"
        now={() => current}
        onSignin={vi.fn()}
      />,
    );
    fillProfessional();
    submit();
    await waitFor(() =>
      expect(createProfile).toHaveBeenCalledWith(
        'synthetic-token',
        {
          accountType: 'professional',
          displayName: 'Doctor Test',
          specialty: 'General',
          practiceLocality: 'City',
        },
        '2026-03-01',
      ),
    );
  });
  it('refreshes access before saving and never posts when account identity changes', async () => {
    authorize.mockResolvedValueOnce({ kind: 'signin' });
    const onSignin = vi.fn();
    render(
      <OnboardingForm
        authorize={authorize}
        initialType="professional"
        now={today}
        onSignin={onSignin}
      />,
    );
    fillProfessional();
    submit();
    await waitFor(() => expect(onSignin).toHaveBeenCalledOnce());
    expect(createProfile).not.toHaveBeenCalled();
  });
  it('prevents overlapping submits and preserves values on unavailable service', async () => {
    createProfile.mockResolvedValue({ kind: 'unavailable' });
    render(
      <OnboardingForm
        authorize={authorize}
        initialType="professional"
        now={today}
        onSignin={vi.fn()}
      />,
    );
    fillProfessional();
    submit();
    fireEvent.submit(screen.getByRole('button', { name: /guardar perfil/i }).closest('form')!);
    await waitFor(() => expect(createProfile).toHaveBeenCalledOnce());
    expect(authorize).toHaveBeenCalledOnce();
    expect(await screen.findByRole('alert')).toHaveTextContent(/no está disponible/i);
    expect(screen.getByLabelText('Nombre visible')).toHaveValue('Doctor Test');
  });
  it('ignores an already-sent save result after account invalidation', async () => {
    let current = true;
    createProfile.mockImplementationOnce(async () => {
      current = false;
      return { kind: 'saved', profile: { accountType: 'professional' } };
    });
    render(
      <ProfileForm
        authorize={authorize}
        isCurrent={() => current}
        initialType="professional"
        now={today}
        onSignin={vi.fn()}
      />,
    );
    fillProfessional();
    submit();
    await waitFor(() => expect(createProfile).toHaveBeenCalledOnce());
    expect(screen.queryByText(/perfil guardado o ya existente/i)).not.toBeInTheDocument();
  });
  it('shows safe conflict and sign-in messages without retrying automatically', async () => {
    const onSignin = vi.fn();
    createProfile.mockResolvedValueOnce({ kind: 'conflict' });
    render(
      <OnboardingForm
        authorize={authorize}
        initialType="professional"
        now={today}
        onSignin={onSignin}
      />,
    );
    fillProfessional();
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(/tipo de cuenta diferente/i);
    createProfile.mockResolvedValueOnce({ kind: 'signin' });
    submit();
    await waitFor(() => expect(onSignin).toHaveBeenCalledOnce());
  });
});
