import { useState } from 'react';
import { Lock } from 'lucide-react';
import { Card, Field, Input, Button, SectionLabel } from '../../core/ui/components';
import { verifyPin, deriveAesKey } from '../../core/crypto/personalInfo';
import { usePersonalInfoSession } from './session';

const digitsOnly = (s) => s.replace(/\D/g, '').slice(0, 6);

/**
 * PIN-only for now. Biometric convenience unlock (WebAuthn PRF) is a
 * follow-up phase — this screen is where its button will sit above the PIN
 * field, with "Use PIN instead" always visible below it, never biometric-only.
 */
export default function UnlockScreen({ security, onDone }) {
  const session = usePersonalInfoSession();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
      </div>
    </Card>
  );
}
