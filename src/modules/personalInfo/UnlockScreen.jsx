import { useState, useEffect, useCallback } from 'react';
import { Lock, Fingerprint, ArrowLeft } from 'lucide-react';
import { Card, Field, Input, Button, SectionLabel } from '../../core/ui/components';
import { verifyPin, deriveAesKey, unwrapAesKeyWithPrf } from '../../core/crypto/personalInfo';
import { platformAuthenticatorAvailable, assertBiometric } from '../../core/crypto/webauthn';
import { loadBiometricRecord } from '../../core/db/biometricStore';
import { usePersonalInfoSession } from './session';

const digitsOnly = (s) => s.replace(/\D/g, '').slice(0, 6);

/**
 * Locked screen: you pick how to unlock, nothing fires on its own.
 *
 * This used to trigger the OS fingerprint prompt the instant the module
 * opened, which meant simply navigating here threw a system dialog over the
 * app before you'd asked for anything. Now both routes are offered as
 * buttons and neither runs until tapped — fingerprint is greyed out (with
 * the reason) when the device or this account can't use it, so the PIN
 * route is always available and always obvious.
 */
export default function UnlockScreen({ security, uid, onDone }) {
  const session = usePersonalInfoSession();
  const [mode, setMode] = useState(null); // null = choosing | 'pin'
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [bioRecord, setBioRecord] = useState(null);
  const [bioChecked, setBioChecked] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);

  // Look up whether fingerprint is even possible, but never act on it — this
  // only decides whether the button is enabled.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!security.biometricEnabled) { if (alive) setBioChecked(true); return; }
      const supported = await platformAuthenticatorAvailable().catch(() => false);
      const rec = supported ? await loadBiometricRecord(uid).catch(() => null) : null;
      if (!alive) return;
      setBioRecord(rec);
      setBioChecked(true);
    })();
    return () => { alive = false; };
  }, [security.biometricEnabled, uid]);

  const unlockWithFingerprint = useCallback(async () => {
    if (!bioRecord) return;
    setBioBusy(true);
    setError('');
    try {
      const secret = await assertBiometric(bioRecord.credentialId);
      if (!secret) { setError('Fingerprint cancelled.'); return; }
      const key = await unwrapAesKeyWithPrf(bioRecord.encrypted, bioRecord.iv, secret);
      session.unlockWithKey(key);
      onDone?.();
    } catch {
      setError("Fingerprint didn't work. Try again, or use your PIN.");
    } finally {
      setBioBusy(false);
    }
  }, [bioRecord, session, onDone]);

  const submit = async () => {
    if (pin.length !== 6) return;
    setBusy(true);
    setError('');
    try {
      const ok = await verifyPin(pin, security.pinSalt, security.kdfIterations, security.pinVerifier);
      if (!ok) { setError('Wrong PIN.'); setPin(''); return; }
      const key = await deriveAesKey(pin, security.pinSalt, security.kdfIterations);
      session.unlockWithKey(key);
      onDone?.();
    } catch {
      setError('Could not unlock. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const bioHint = !security.biometricEnabled
    ? 'Fingerprint unlock is off for this account — turn it on from inside Personal Info.'
    : !bioChecked ? 'Checking for fingerprint…'
      : !bioRecord ? 'No fingerprint is set up on this device.'
        : null;

  return (
    <Card>
      <div className="pin-form">
        <SectionLabel>Personal Info is locked</SectionLabel>

        {mode === 'pin' ? (
          <>
            <Field label="PIN">
              <Input
                type="password" inputMode="numeric" pattern="\d*" maxLength={6} autoFocus
                value={pin} onChange={(e) => setPin(digitsOnly(e.target.value))}
                onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              />
            </Field>
            {error && <p className="field-hint pin-error">{error}</p>}
            <Button variant="primary" onClick={submit} disabled={busy || pin.length !== 6}>
              <Lock size={15} /> {busy ? 'Unlocking…' : 'Unlock'}
            </Button>
            <Button onClick={() => { setMode(null); setPin(''); setError(''); }}>
              <ArrowLeft size={15} /> Back
            </Button>
          </>
        ) : (
          <>
            <p className="field-hint" style={{ margin: 0 }}>Choose how to unlock.</p>
            {error && <p className="field-hint pin-error">{error}</p>}
            <div className="pi-unlock-choices">
              <Button
                variant="primary"
                onClick={unlockWithFingerprint}
                disabled={!bioRecord || bioBusy}
                title={bioHint || 'Unlock with fingerprint'}
              >
                <Fingerprint size={15} /> {bioBusy ? 'Waiting…' : 'Fingerprint'}
              </Button>
              <Button variant="outline" onClick={() => { setMode('pin'); setError(''); }}>
                <Lock size={15} /> PIN
              </Button>
            </div>
            {bioHint && <p className="field-hint" style={{ margin: 0 }}>{bioHint}</p>}
          </>
        )}
      </div>
    </Card>
  );
}
