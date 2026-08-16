import { useEffect, useRef, useState } from 'react';
import { X, ScanLine } from 'lucide-react';
import { useBackClose, Field, Input, Button } from '../../core/ui/components';

/**
 * Full-screen barcode capture. Feature-detects the native BarcodeDetector API
 * (Chrome/Edge on Android and recent desktop Chrome) and falls back to manual
 * code entry everywhere else, or if the camera can't be reached (permission
 * denied, no camera, insecure context) — never a dead end.
 *
 * getUserMedia needs a secure context: works on localhost and the deployed
 * https:// site, but not over a plain http:// LAN address.
 */
export function BarcodeScanner({ onDetect, onClose }) {
  useBackClose(onClose);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const [manual, setManual] = useState('');
  const [error, setError] = useState(null);
  const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  useEffect(() => {
    if (!supported) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const detector = new window.BarcodeDetector();
        const scan = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) { onDetect(codes[0].rawValue); return; }
          } catch { /* transient decode failure, keep scanning */ }
          rafRef.current = requestAnimationFrame(scan);
        };
        rafRef.current = requestAnimationFrame(scan);
      } catch (e) {
        if (!cancelled) setError(e.name === 'NotAllowedError' ? 'Camera permission denied.' : "Couldn't reach the camera.");
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [supported, onDetect]);

  const submitManual = () => {
    const code = manual.trim();
    if (code) onDetect(code);
  };

  return (
    <div className="stock-scan-scrim">
      <div className="stock-scan-top">
        <span className="stock-scan-title"><ScanLine size={16} /> Scan barcode</span>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>

      {supported && !error ? (
        <div className="stock-scan-video-wrap">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} className="stock-scan-video" playsInline muted />
          <div className="stock-scan-frame" />
        </div>
      ) : (
        <div className="stock-scan-fallback">
          <p className="stock-scan-fallback-body">
            {error || "Barcode scanning isn't supported in this browser."} Enter the code by hand instead.
          </p>
          <Field label="Barcode">
            <Input value={manual} onChange={(e) => setManual(e.target.value)}
              placeholder="e.g. 8901030123456" autoFocus
              onKeyDown={(e) => e.key === 'Enter' && submitManual()} />
          </Field>
          <Button variant="primary" onClick={submitManual} disabled={!manual.trim()}>Use this code</Button>
        </div>
      )}
    </div>
  );
}
