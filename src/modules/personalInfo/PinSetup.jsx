import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Card, Field, Input, Button, SectionLabel } from '../../core/ui/components';
import { loadConfig } from '../../core/db/config';
import { generateSalt, makePinVerifier, deriveAesKey, KDF_ITERATIONS } from '../../core/crypto/personalInfo';
import { usePersonalInfoSession } from './session';

const digitsOnly = (s) => s.replace(/\D/g, '').slice(0, 6);

export default function PinSetup({ uid, onDone }) {
  const session = usePersonalInfoSession();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const valid = /^\d{6}$/.test(pin);

  const submit = async () => {
    if (!valid) { setError('PIN must be exactly 6 digits.'); return; }
    if (pin !== confirm) { setError("PINs don't match."); return; }
    setBusy(true);
    setError('');
    try {
      const cfg = loadConfig();
      const salt = generateSalt();
      const [verifier, key] = await Promise.all([
        makePinVerifier(pin, salt, KDF_ITERATIONS),
        deriveAesKey(pin, salt, KDF_ITERATIONS),
      ]);
      const { setSecurityDoc } = await import('../../core/db/security');
      await setSecurityDoc(cfg, uid, {
        pinSalt: salt, pinVerifier: verifier, kdfIterations: KDF_ITERATIONS, biometricEnabled: false,
      });
      session.unlockWithKey(key);
      onDone?.({ pinSalt: salt, pinVerifier: verifier, kdfIterations: KDF_ITERATIONS, biometricEnabled: false });
    } catch (e) {
      setError(e?.message || 'Could not set up the PIN.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="pin-form">
        <SectionLabel>Set up your Personal Info PIN</SectionLabel>
        <p className="field-hint pin-warning">
          Sensitive fields (passwords, account numbers) are encrypted with a key derived
          from this PIN. <strong>There is no recovery.</strong> If you forget it, those
          fields can never be read back — by you, or anyone else.
        </p>
        <Field label="6-digit PIN">
          <Input
            type="password" inputMode="numeric" pattern="\d*" maxLength={6} autoFocus
            value={pin} onChange={(e) => setPin(digitsOnly(e.target.value))}
          />
        </Field>
        <Field label="Confirm PIN">
          <Input
            type="password" inputMode="numeric" pattern="\d*" maxLength={6}
            value={confirm} onChange={(e) => setConfirm(digitsOnly(e.target.value))}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
        </Field>
        {error && <p className="field-hint pin-error">{error}</p>}
        <Button variant="primary" onClick={submit} disabled={busy || !valid || pin !== confirm}>
          <ShieldCheck size={15} /> {busy ? 'Setting up…' : 'Set PIN'}
        </Button>
      </div>
    </Card>
  );
}
