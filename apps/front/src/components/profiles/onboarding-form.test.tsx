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
  fireEvent.click(screen.getByRole('button', { name: /save profile/i }));
}
function fillProfessional() {
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Doctor Test' } });
  fireEvent.change(screen.getByLabelText('Specialty'), { target: { value: 'General' } });
  fireEvent.change(screen.getByLabelText('Practice locality'), { target: { value: 'City' } });
}

describe('create-only profile form', () => {
  it('validates March 1 leap boundary, omits absent gender and sends selected gender', async () => {
    render(
      <OnboardingForm authorize={authorize} initialType="patient" now={today} onSignin={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Patient Test' } });
    fireEvent.change(screen.getByLabelText('Birth date'), { target: { value: '2008-02-29' } });
    fireEvent.change(screen.getByLabelText('Residence locality'), { target: { value: 'City' } });
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
    expect(screen.getByRole('status')).toHaveTextContent(/profile saved or already existed/i);
    cleanup();
    render(
      <OnboardingForm authorize={authorize} initialType="patient" now={today} onSignin={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Patient Test' } });
    fireEvent.change(screen.getByLabelText('Birth date'), { target: { value: '2008-02-29' } });
    fireEvent.change(screen.getByLabelText('Residence locality'), { target: { value: 'City' } });
    fireEvent.change(screen.getByLabelText('Gender (optional)'), {
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
    fireEvent.change(screen.getByLabelText('Account type'), { target: { value: 'institution' } });
    fireEvent.change(screen.getByLabelText('Institution name'), {
      target: { value: 'Test Center' },
    });
    fireEvent.change(screen.getByLabelText('Institution type'), { target: { value: 'Clinic' } });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'City' } });
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
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Patient Test' } });
    fireEvent.change(screen.getByLabelText('Birth date'), { target: { value: '2008-02-29' } });
    fireEvent.change(screen.getByLabelText('Residence locality'), { target: { value: 'City' } });
    submit();
    await screen.findByText(/adult/i);
    expect(authorize).not.toHaveBeenCalled();
    expect(createProfile).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Display name')).toHaveValue('Patient Test');
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
    fireEvent.submit(screen.getByRole('button', { name: /save profile/i }).closest('form')!);
    await waitFor(() => expect(createProfile).toHaveBeenCalledOnce());
    expect(authorize).toHaveBeenCalledOnce();
    expect(await screen.findByRole('alert')).toHaveTextContent(/unavailable/i);
    expect(screen.getByLabelText('Display name')).toHaveValue('Doctor Test');
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
    expect(screen.queryByText(/profile saved or already existed/i)).not.toBeInTheDocument();
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
    expect(await screen.findByRole('alert')).toHaveTextContent(/different account type/i);
    createProfile.mockResolvedValueOnce({ kind: 'signin' });
    submit();
    await waitFor(() => expect(onSignin).toHaveBeenCalledOnce());
  });
});
