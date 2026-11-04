/**
 * PDF import for the staff directory.
 *
 * Parses the "SID 2.0" staff-directory export — a browser-printed PDF table:
 *   Action | Name | StaffID | Job | Dept | Unit | DIDNo | EXTNo | Mobile
 * Unlike the CSV importer, there's no delimiter to split on. Rows are
 * reconstructed from each word's absolute position on the page instead; that
 * logic and the export's quirks live in pdfRows.js.
 *
 * Column boundaries are read from the header row's x-position on whichever
 * page carries it (every page did in the export this was built against),
 * then reused for any page that doesn't repeat it. If the header is never
 * found at all, extraction fails loudly rather than guessing blind — a
 * silent wrong guess would shuffle Names into Departments with nothing to
 * notice it by.
 *
 * Mobile is deliberately never read here — this export doesn't carry it,
 * and even if a future one did, mobile numbers collected by hand are the
 * one field an import must never overwrite.
 */

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { buildBounds, detectHeader, pageGraphics, pageItems, rowsFromPage } from './pdfRows';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * @param {File} file
 * @returns {Promise<{ rows: Array<{sid,name,designation,dept,unit,ext,isUnitHead}>, pageCount: number }>}
 */
export async function extractSidPdf(file) {
  const buf = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;

  let bounds = null;
  let headerBottom = -Infinity;
  let headerFoundOnce = false;
  const rows = [];
  const indexBySid = new Map();

  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const page = await pdfDoc.getPage(p);
    const content = await page.getTextContent();
    const vp = page.getViewport({ scale: 1 });
    const items = pageItems(content, vp.height);

    const hdr = detectHeader(items);
    if (hdr) {
      bounds = buildBounds(hdr.found);
      headerBottom = hdr.headerBottom;
      headerFoundOnce = true;
    }
    if (!bounds) continue; // no header seen yet — nothing to anchor rows to

    const graphics = pageGraphics(await page.getOperatorList(), pdfjsLib.OPS, vp.height);
    rowsFromPage(items, graphics, bounds, headerBottom).forEach((row) => {
      // a repeated staff ID within the file (shouldn't happen, but the
      // export is hand-maintained) — last occurrence wins
      if (indexBySid.has(row.sid)) rows[indexBySid.get(row.sid)] = row;
      else { indexBySid.set(row.sid, rows.length); rows.push(row); }
    });
  }

  if (!headerFoundOnce) {
    throw new Error(
      "This doesn't look like a SID 2.0 staff-directory export — the column headers " +
      '(Name, StaffID, Job, Dept, Unit…) were never found.'
    );
  }

  return { rows, pageCount: pdfDoc.numPages };
}
