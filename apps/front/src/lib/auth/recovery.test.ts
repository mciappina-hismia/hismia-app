import { describe, expect, it, vi } from 'vitest';
import {
  createRecovery,
  consumeRecoveryCallback,
  hasRecoveryRedirect,
  type RecoveryPort,
} from './recovery';
import { RECOVERY_PATH, RESET_PASSWORD_PATH } from './browser';

function port(): RecoveryPort {
  return {
    exchange: vi.fn().mockResolvedValue('synthetic-subject'),
    currentSubject: vi.fn().mockResolvedValue('synthetic-subject'),
    updatePassword: vi.fn().mockResolvedValue(true),
    signOut: vi.fn().mockResolvedValue(true),
  };
}

describe('recovery application', () => {
  it.each([
    [undefined, false],
    [null, false],
    ['recovery', false],
    [{}, false],
    [{ redirectType: null }, false],
    [{ redirectType: 1 }, false],
    [{ redirectType: 'signup' }, false],
    [{ redirectType: 'recovery' }, true],
  ])('refines runtime SDK metadata %j without assuming the public type', (data, expected) => {
    expect(hasRecoveryRedirect(data)).toBe(expected);
  });
  it('keeps request and destination routes distinct', () => {
    expect(RECOVERY_PATH).toBe('/auth/recover');
    expect(RESET_PASSWORD_PATH).toBe('/auth/reset-password');
  });
  it('captures flow id before clearing all callback data and preserves history state', () => {
    window.history.replaceState(
      { synthetic: true },
      '',
      `${RESET_PASSWORD_PATH}?code=one&sb_flow_id=flow&next=https://elsewhere.test`,
    );
    expect(consumeRecoveryCallback()).toEqual({ code: 'one', flowId: 'flow', invalid: false });
    expect(window.location.href).toBe(`${window.location.origin}${RESET_PASSWORD_PATH}`);
    expect(window.history.state).toEqual({ synthetic: true });
  });
  it.each([
    '?error=denied&code=one',
    '?error_code=denied&code=one',
    '?code=one#access_token=synthetic',
    '?code=one&code=two',
  ])('rejects unsafe callback %s and still cleans it', (suffix) => {
    window.history.replaceState(null, '', `${RESET_PASSWORD_PATH}${suffix}`);
    expect(consumeRecoveryCallback().invalid).toBe(true);
    expect(window.location.search + window.location.hash).toBe('');
  });
  it('shares one pending exchange within the visit', async () => {
    const p = port();
    const recovery = createRecovery(p);
    const first = recovery.open({ code: 'one', flowId: 'flow', invalid: false });
    expect(recovery.open({ code: null, flowId: null, invalid: false })).toBe(first);
    expect(await first).toBe(true);
    expect(p.exchange).toHaveBeenCalledOnce();
    expect(p.exchange).toHaveBeenCalledWith('one', 'flow');
  });
  it('never updates without recovery provenance, including direct submit', async () => {
    const p = port();
    const recovery = createRecovery(p);
    expect(await recovery.changePassword('new-password')).toBe('no-recovery');
    expect(await recovery.open({ code: null, flowId: null, invalid: false })).toBe(false);
    expect(p.exchange).not.toHaveBeenCalled();
    expect(p.updatePassword).not.toHaveBeenCalled();
  });
  it.each([null, 'another-subject'])('denies a lost/changed session %s', async (subject) => {
    const p = port();
    const recovery = createRecovery(p);
    await recovery.open({ code: 'one', flowId: null, invalid: false });
    vi.mocked(p.currentSubject).mockResolvedValue(subject);
    expect(await recovery.changePassword('new-password')).toBe('no-recovery');
    expect(p.updatePassword).not.toHaveBeenCalled();
  });
  it('permits retry after an update failure and blocks concurrent writes', async () => {
    const p = port();
    const recovery = createRecovery(p);
    await recovery.open({ code: 'one', flowId: null, invalid: false });
    vi.mocked(p.updatePassword).mockResolvedValueOnce(false);
    expect(await recovery.changePassword('new-password')).toBe('update-failed');
    let finish!: (saved: boolean) => void;
    vi.mocked(p.updatePassword).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = recovery.changePassword('new-password');
    await Promise.resolve();
    expect(await recovery.changePassword('new-password')).toBe('busy');
    finish(true);
    expect(await pending).toBe('saved');
  });
  it('validates length and never resubmits after a successful update with failed logout', async () => {
    const p = port();
    const recovery = createRecovery(p);
    await recovery.open({ code: 'one', flowId: null, invalid: false });
    expect(await recovery.changePassword('short')).toBe('invalid-password');
    vi.mocked(p.signOut).mockResolvedValue(false);
    expect(await recovery.changePassword('new-password')).toBe('signout-failed');
    expect(await recovery.changePassword('new-password')).toBe('no-recovery');
    expect(p.updatePassword).toHaveBeenCalledOnce();
  });
});
