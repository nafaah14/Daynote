import { useState, useEffect, useMemo } from 'react';
import { Toggle } from '../../core/ui/components';
import { PdfPreviewScreen } from '../../core/ui/PdfPreview';

const loadPdfGen = () => import('../orgstructure/pdfGen');

export function DirectoryPrintPreview({ people: allFiltered, filters, filterLabel, searchTerm, onClose }) {
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

  return (
    <PdfPreviewScreen
      title="Directory" blob={pdfBlob} onClose={onClose} fileName={`Directory_${date}.pdf`}
      subHeader={personalCount > 0 && (
        <label className="dir-export-personal-toggle">
          <Toggle checked={includePersonal} onChange={setIncludePersonal} label="Include personal contacts" />
          Include {personalCount} personal contact{personalCount === 1 ? '' : 's'}
        </label>
      )}
    />
  );
}
