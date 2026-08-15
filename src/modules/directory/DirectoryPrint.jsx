import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Download } from 'lucide-react';
import { useBackClose, Toggle } from '../../core/ui/components';

const loadPdfGen = () => import('../orgstructure/pdfGen');

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
    return <div className="org-pdf-loading">Rendering pages…</div>;
  }
  if (status === 'error') {
    return <div className="org-pdf-loading">Could not render preview.</div>;
  }

  return (
    <div className="org-pdf-pages">
      {pages.map((pg, i) => (
        <img key={i} src={pg.dataUrl} className="org-pdf-page-img" style={{ maxWidth: pg.width }} alt={`Page ${i + 1}`} />
      ))}
    </div>
  );
}

export function DirectoryPrintPreview({ people: allFiltered, filters, filterLabel, searchTerm, onClose }) {
  useBackClose(onClose);
  const [pdfBlob, setPdfBlob] = useState(null);

  // Same default as the CSV/table export preview: personal contacts are
  // left out of a PDF meant to read as the org's staff list, unless the
  // screen's own filter already narrowed to personal-only.
  const [includePersonal, setIncludePersonal] = useState(filters?.kind === 'personal');
  const personalCount = useMemo(() => allFiltered.filter((p) => p.data.personal).length, [allFiltered]);
  const people = useMemo(
    () => (includePersonal ? allFiltered : allFiltered.filter((p) => !p.data.personal)),
    [allFiltered, includePersonal]
  );

  useEffect(() => {
    const timer = setTimeout(async () => {
      const { generateDirectoryPdf } = await loadPdfGen();
      const blob = generateDirectoryPdf(people, { filters, filterLabel, searchTerm });
      setPdfBlob(blob);
    }, 50);
    return () => clearTimeout(timer);
  }, [people, filters, filterLabel, searchTerm]);

  const date = new Date().toISOString().slice(0, 10);

  const handleDownload = () => {
    if (!pdfBlob) return;
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Directory_${date}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="org-pdf-scrim">
      <div className="org-pdf-top">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Back"><ArrowLeft size={19} /></button>
        <h2 className="org-pdf-title">Directory</h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={handleDownload} disabled={!pdfBlob}>
          <Download size={14} /> Download
        </button>
      </div>
      {personalCount > 0 && (
        <label className="dir-export-personal-toggle">
          <Toggle checked={includePersonal} onChange={setIncludePersonal} label="Include personal contacts" />
          Include {personalCount} personal contact{personalCount === 1 ? '' : 's'}
        </label>
      )}
      <div className="org-pdf-body">
        {pdfBlob ? <PdfPageRenderer pdfBlob={pdfBlob} /> : <div className="org-pdf-loading">Generating PDF…</div>}
      </div>
    </div>
  );
}
