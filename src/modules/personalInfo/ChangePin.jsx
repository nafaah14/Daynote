import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Sheet, Field, Input, Button } from '../../core/ui/components';
import { loadConfig } from '../../core/db/config';
import {
  verifyPin, deriveAesKey, generateSalt, makePinVerifier, encryptField, decryptField, KDF_ITERATIONS,
} from '../../core/crypto/personalInfo';
import { clearBiometricRecord } from '../../core/db/biometricStore';
import { ENTRY_TYPE } from './types';

const digitsOnly = (s) => s.replace(/\D/g, '').slice(0, 6);

/**
 * Sensitive records are encrypted under the OLD key, so changing the PIN
 * means decrypting every sensitive entry and re-encrypting it under the new
 * one. Requires the old PIN again (not just today's already-unlocked
 * session) so an unattended unlocked device can't have its PIN silently
 * swapped by whoever is standing at it.
 */
export default function ChangePin({ open, onClose, uid, security, repo, onChanged }) {
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const valid = /^\d{6}$/.test(newPin);

  const submit = async () => {
    if (!/^\d{6}$/.test(oldPin)) { setError('Enter your current 6-digit PIN.'); return; }
    if (!valid) { setError('New PIN must be exactly 6 digits.'); return; }
    if (newPin !== confirm) { setError("New PINs don't match."); return; }
    setBusy(true);
    setError('');
    try {
      const ok = await verifyPin(oldPin, security.pinSalt, security.kdfIterations, security.pinVerifier);
      if (!ok) { setError('Current PIN is wrong.'); return; }

      const oldKey = await deriveAesKey(oldPin, security.pinSalt, security.kdfIterations);
      const sensitive = repo.query({ type: ENTRY_TYPE }).filter((r) => r.data.category === 'sensitive');
      const plaintexts = await Promise.all(
        sensitive.map((r) => decryptField(r.data.encrypted, r.data.iv, oldKey))
      );

      const newSalt = generateSalt();
      const [newVerifier, newKey] = await Promise.all([
        makePinVerifier(newPin, newSalt, KDF_ITERATIONS),
        deriveAesKey(newPin, newSalt, KDF_ITERATIONS),
      ]);

      const reEncrypted = await Promise.all(plaintexts.map((pt) => encryptField(pt, newKey)));
      const updated = sensitive.map((r, i) => ({
        ...r,
        updatedAt: new Date().toISOString(),
        data: { ...r.data, encrypted: reEncrypted[i].encrypted, iv: reEncrypted[i].iv },
      }));
      if (updated.length) await repo.bulkWrite(updated);

      // Any device-local wrapped key was wrapping the OLD key — stale now,
      // and biometricEnabled resets to match (re-enrolling is one tap away).
      await clearBiometricRecord(uid).catch(() => { /* nothing to clear */ });

      const { setSecurityDoc } = await import('../../core/db/security');
      const cfg = loadConfig();
      await setSecurityDoc(cfg, uid, {
        pinSalt: newSalt, pinVerifier: newVerifier, kdfIterations: KDF_ITERATIONS, biometricEnabled: false,
      });

      onChanged({ pinSalt: newSalt, pinVerifier: newVerifier, kdfIterations: KDF_ITERATIONS, biometricEnabled: false }, newKey);
      onClose();
    } catch (e) {
      setError(e?.message || 'Could not change the PIN.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open onClose={onClose}
      title="Change PIN"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            <KeyRound size={14} /> {busy ? 'Re-encrypting…' : 'Change PIN'}
          </Button>
        </>
      }
    >
      <Field label="Current PIN">
        <Input type="password" inputMode="numeric" pattern="\d*" maxLength={6} autoFocus
          value={oldPin} onChange={(e) => setOldPin(digitsOnly(e.target.value))} />
      </Field>
      <Field label="New PIN">
        <Input type="password" inputMode="numeric" pattern="\d*" maxLength={6}
          value={newPin} onChange={(e) => setNewPin(digitsOnly(e.target.value))} />
      </Field>
      <Field label="Confirm new PIN" hint="Every sensitive entry is re-encrypted under the new PIN — this can take a moment.">
        <Input type="password" inputMode="numeric" pattern="\d*" maxLength={6}
          value={confirm} onChange={(e) => setConfirm(digitsOnly(e.target.value))} />
      </Field>
      {error && <p className="field-hint pin-error">{error}</p>}
    </Sheet>
  );
}
