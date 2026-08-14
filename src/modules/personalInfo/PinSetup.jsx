import { useState, useEffect } from 'react';
import { ShieldCheck, Fingerprint } from 'lucide-react';
import { Card, Field, Input, Button, SectionLabel } from '../../core/ui/components';
import { loadConfig } from '../../core/db/config';
import {
  generateSalt, makePinVerifier, deriveAesKey, wrapAesKeyWithPrf, KDF_ITERATIONS,
} from '../../core/crypto/personalInfo';
import { platformAuthenticatorAvailable, registerBiometric } from '../../core/crypto/webauthn';
import { saveBiometricRecord } from '../../core/db/biometricStore';
import { usePersonalInfoSession } from './session';

const digitsOnly = (s) => s.replace(/\D/g, '').slice(0, 6);

export default function PinSetup({ uid, onDone }) {
  const session = usePersonalInfoSession();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState('pin'); // 'pin' | 'biometric'
  const [savedSecurity, setSavedSecurity] = useState(null);
  const [bioSupported, setBioSupported] = useState(false);
  const [bioError, setBioError] = useState('');

  useEffect(() => { platformAuthenticatorAvailable().then(setBioSupported); }, []);

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
      const security = { pinSalt: salt, pinVerifier: verifier, kdfIterations: KDF_ITERATIONS, biometricEnabled: false };
      const { setSecurityDoc } = await import('../../core/db/security');
      await setSecurityDoc(cfg, uid, security);
      session.unlockWithKey(key);
      setSavedSecurity(security);
      setStep(bioSupported ? 'biometric' : 'done');
      if (!bioSupported) onDone?.(security);
    } catch (e) {
      setError(e?.message || 'Could not set up the PIN.');
    } finally {
      setBusy(false);
    }
  };

  const enableBiometric = async () => {
    setBusy(true);
    setBioError('');
    try {
      const reg = await registerBiometric(uid);
      if (!reg) { setBioError("Couldn't enable fingerprint unlock on this device."); return; }
      const wrapped = await wrapAesKeyWithPrf(session.key, reg.prfSecret);
      await saveBiometricRecord(uid, { credentialId: reg.credentialId, encrypted: wrapped.encrypted, iv: wrapped.iv });
      const nextSecurity = { ...savedSecurity, biometricEnabled: true };
      const { setSecurityDoc } = await import('../../core/db/security');
      await setSecurityDoc(loadConfig(), uid, nextSecurity);
      onDone?.(nextSecurity);
    } catch (e) {
      setBioError(e?.message || "Couldn't enable fingerprint unlock.");
    } finally {
      setBusy(false);
    }
  };

  if (step === 'biometric') {
    return (
      <Card>
        <div className="pin-form">
          <SectionLabel>Also enable fingerprint unlock?</SectionLabel>
          <p className="field-hint">
            Skip retyping your PIN on this device next time. Your PIN still always works — this is a
            convenience, not a replacement, and it's this device only.
          </p>
          {bioError && <p className="field-hint pin-error">{bioError}</p>}
          <Button variant="primary" onClick={enableBiometric} disabled={busy}>
            <Fingerprint size={15} /> {busy ? 'Setting up…' : 'Enable fingerprint unlock'}
          </Button>
          <Button variant="quiet" onClick={() => onDone?.(savedSecurity)} disabled={busy}>Not now</Button>
        </div>
      </Card>
    );
  }

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
