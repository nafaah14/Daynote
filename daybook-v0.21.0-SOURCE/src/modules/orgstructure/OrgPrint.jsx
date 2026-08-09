import { useState, useEffect } from 'react';
import { ArrowLeft, Download } from 'lucide-react';
import { useBackClose } from '../../core/ui/components';

const loadPdfGen = () => import('./pdfGen');

/**
 * Render PDF pages as images via pdfjs-dist. Stores rendered page data
 * URLs in React state so React owns the DOM — no raw innerHTML manipulation
 * that would conflict with React's virtual DOM tracking.
 */
function PdfPageRenderer({ pdfBlob }) {
  const [pages, setPages] = useState([]);    // array of { dataUrl, width, height }
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
          const scale = 2; // 2x for crisp display
          const viewport = page.getViewport({ scale });

          // Render to an offscreen canvas, extract as data URL
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          await page.render({ canvasContext: ctx, viewport }).promise;

          rendered.push({
            dataUrl: canvas.toDataURL('image/png'),
            width: viewport.width / scale,
            height: viewport.height / scale,
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
    return <div className="org-pdf-loading">Rendering pages…</div>;
  }
  if (status === 'error') {
    return <div className="org-pdf-loading">Could not render preview.</div>;
  }

  return (
    <div className="org-pdf-pages">
      {pages.map((pg, i) => (
        <img
          key={i}
          src={pg.dataUrl}
          className="org-pdf-page-img"
          style={{ maxWidth: pg.width }}
          alt={`Page ${i + 1}`}
        />
      ))}
    </div>
  );
}

function PdfPreview({ title, pdfBlob, fileName, onClose }) {
  useBackClose(onClose);

  const handleDownload = () => {
    if (!pdfBlob) return;
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="org-pdf-scrim">
      <div className="org-pdf-top">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Back"><ArrowLeft size={19} /></button>
        <h2 className="org-pdf-title">{title}</h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={handleDownload} disabled={!pdfBlob}>
          <Download size={14} /> Download
        </button>
      </div>
      <div className="org-pdf-body">
        {pdfBlob ? (
          <PdfPageRenderer pdfBlob={pdfBlob} />
        ) : (
          <div className="org-pdf-loading">Generating PDF…</div>
        )}
      </div>
    </div>
  );
}

export function OrgPrintPreview({ units, meta, deptPeople, onClose }) {
  const [pdfBlob, setPdfBlob] = useState(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const { generateOrgPdf } = await loadPdfGen();
      const blob = generateOrgPdf(units, meta);
      setPdfBlob(blob);
    }, 50);
    return () => clearTimeout(timer);
  }, [units, meta, deptPeople]);

  const date = new Date().toISOString().slice(0, 10);
  return (
    <PdfPreview
      title="Org Structure"
      pdfBlob={pdfBlob}
      fileName={`Org_Structure_${date}.pdf`}
      onClose={onClose}
    />
  );
}

export function StaffPrintPreview({ units, deptPeople, meta, filterUnit, onClose }) {
  const [pdfBlob, setPdfBlob] = useState(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const { generateStaffPdf } = await loadPdfGen();
      const blob = generateStaffPdf(units, deptPeople, meta, filterUnit);
      setPdfBlob(blob);
    }, 50);
    return () => clearTimeout(timer);
  }, [units, deptPeople, meta, filterUnit]);

  const date = new Date().toISOString().slice(0, 10);
  const label = filterUnit || 'All_Units';
  return (
    <PdfPreview
      title={filterUnit ? `Staff — ${filterUnit}` : 'Staff List'}
      pdfBlob={pdfBlob}
      fileName={`Staff_${label.replace(/\s+/g, '_')}_${date}.pdf`}
      onClose={onClose}
    />
  );
}
