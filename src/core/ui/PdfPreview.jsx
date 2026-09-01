import { useState, useEffect } from 'react';
import { ArrowLeft, Download } from 'lucide-react';
import { useBackClose } from './components';
import './pdfPreview.css';

/**
 * Renders a generated PDF `Blob` as page images in-app (via pdfjs-dist,
 * loaded lazily — it's ~1.2MB and most sessions never open a report), so
 * there's a real preview before committing to a download. Promoted out of
 * modules/directory/DirectoryPrint.jsx once Overtime needed the exact same
 * blob-in, pages-out preview for its own reports — modules don't import each
 * other, so this lives in core now.
 */
function PdfPageRenderer({ pdfBlob }) {
  const [pages, setPages] = useState([]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    if (!pdfBlob) return;
    let cancelled = false;

    (async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

        const arrayBuf = await pdfBlob.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuf }).promise;
        if (cancelled) return;

        const rendered = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const scale = 2;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          await page.render({ canvasContext: ctx, viewport }).promise;
          rendered.push({
            dataUrl: canvas.toDataURL('image/png'),
            width: viewport.width / scale,
          });
          if (cancelled) return;
        }
        setPages(rendered);
        setStatus('done');
      } catch (err) {
        console.error('PDF render failed:', err);
        if (!cancelled) setStatus('error');
      }
    })();

    return () => { cancelled = true; };
  }, [pdfBlob]);

  if (status === 'loading' && pages.length === 0) {
    return <div className="pdf-preview-loading">Rendering pages…</div>;
  }
  if (status === 'error') {
    return <div className="pdf-preview-loading">Could not render preview.</div>;
  }

  return (
    <div className="pdf-preview-pages">
      {pages.map((pg, i) => (
        <img key={i} src={pg.dataUrl} className="pdf-preview-page-img" style={{ maxWidth: pg.width }} alt={`Page ${i + 1}`} />
      ))}
    </div>
  );
}

/**
 * Back/title/Download top bar + the page-image body. The caller owns
 * generating its own report's blob (each module's pdfGen.js) and passes it
 * in once ready — `blob === null` shows a "Generating…" state instead of the
 * page renderer, so a report that takes a moment to build doesn't flash an
 * empty preview first.
 */
export function PdfPreviewScreen({ title, blob, onClose, fileName, extraHeader, subHeader }) {
  useBackClose(onClose);

  const handleDownload = () => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="pdf-preview-scrim">
      <div className="pdf-preview-top">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Back"><ArrowLeft size={19} /></button>
        <h2 className="pdf-preview-title">{title}</h2>
        {extraHeader}
        <button type="button" className="btn btn-primary btn-sm" onClick={handleDownload} disabled={!blob}>
          <Download size={14} /> Download
        </button>
      </div>
      {subHeader}
      <div className="pdf-preview-body">
        {blob ? <PdfPageRenderer pdfBlob={blob} /> : <div className="pdf-preview-loading">Generating PDF…</div>}
      </div>
    </div>
  );
}
