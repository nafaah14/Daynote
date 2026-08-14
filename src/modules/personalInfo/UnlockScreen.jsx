import { useState, useEffect, useCallback } from 'react';
import { Lock, Fingerprint } from 'lucide-react';
import { Card, Field, Input, Button, SectionLabel } from '../../core/ui/components';
import { verifyPin, deriveAesKey, unwrapAesKeyWithPrf } from '../../core/crypto/personalInfo';
import { platformAuthenticatorAvailable, assertBiometric } from '../../core/crypto/webauthn';
import { loadBiometricRecord } from '../../core/db/biometricStore';
import { usePersonalInfoSession } from './session';

const digitsOnly = (s) => s.replace(/\D/g, '').slice(0, 6);

/**
 * Fingerprint is offered above the PIN field, never instead of it — the PIN
 * form is always rendered below and always works, so any WebAuthn failure,
 * cancellation, or unsupported device just leaves the user looking at the
 * form that was already there. When enrolled, the OS prompt fires
 * automatically on arrival rather than waiting for a manual tap; the button
 * stays visible to retry if that prompt gets dismissed.
 */
export default function UnlockScreen({ security, uid, onDone }) {
  const session = usePersonalInfoSession();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [bioRecord, setBioRecord] = useState(null);
  const [bioBusy, setBioBusy] = useState(false);

  const unlockWithFingerprint = useCallback(async (rec) => {
    const record = rec ?? bioRecord;
    if (!record) return;
    setBioBusy(true);
    try {
      const secret = await assertBiometric(record.credentialId);
      if (!secret) return; // cancelled / failed — PIN form is right there
      const key = await unwrapAesKeyWithPrf(record.encrypted, record.iv, secret);
      session.unlockWithKey(key);
      onDone?.();
    } catch {
      /* falls back to the PIN form already on screen */
    } finally {
      setBioBusy(false);
    }
  }, [bioRecord, session, onDone]);

  useEffect(() => {
    if (!security.biometricEnabled) return;
    let alive = true;
    (async () => {
      const supported = await platformAuthenticatorAvailable();
      if (!supported || !alive) return;
      const rec = await loadBiometricRecord(uid).catch(() => null);
      if (!alive || !rec) return;
      setBioRecord(rec);
      unlockWithFingerprint(rec); // prompt right away, no manual tap needed
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [security.biometricEnabled, uid]);

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

  return (
    <Card>
      <div className="pin-form">
        <SectionLabel>Personal Info is locked</SectionLabel>

        {bioRecord && (
          <>
            <Button variant="primary" onClick={() => unlockWithFingerprint()} disabled={bioBusy}>
              <Fingerprint size={15} /> {bioBusy ? 'Waiting…' : 'Unlock with fingerprint'}
            </Button>
            <p className="field-hint" style={{ margin: 0 }}>Or use your PIN:</p>
          </>
        )}

        <Field label="PIN">
          <Input
            type="password" inputMode="numeric" pattern="\d*" maxLength={6} autoFocus={!bioRecord}
            value={pin} onChange={(e) => setPin(digitsOnly(e.target.value))}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
        </Field>
        {error && <p className="field-hint pin-error">{error}</p>}
        <Button variant="primary" onClick={submit} disabled={busy || pin.length !== 6}>
          <Lock size={15} /> {busy ? 'Unlocking…' : 'Unlock'}
        </Button>
      </div>
    </Card>
  );
}
