/**
 * PDF import for the staff directory.
 *
 * Parses the "SID 2.0" staff-directory export — a browser-printed PDF table:
 *   Action | Name | StaffID | Job | Dept | Unit | DIDNo | EXTNo | Mobile
 * Unlike the CSV importer, there's no delimiter to split on. Rows are
 * reconstructed from each word's absolute position on the page instead.
 *
 * Column boundaries are read from the header row's x-position on whichever
 * page carries it (every page did in the export this was built against),
 * then reused for any page that doesn't repeat it. If the header is never
 * found at all, extraction fails loudly rather than guessing blind — a
 * silent wrong guess would shuffle Names into Departments with nothing to
 * notice it by.
 *
 * Row reconstruction handles a real quirk in this export: a two-line job
 * title (e.g. "Administrative Service" / "Supervisor") prints one line
 * above the row's other cells and one line at/below it. Each row's vertical
 * band is the midpoint between its own StaffID position and its neighbours'
 * — wide enough to catch a wrapped line, narrow enough not to swallow the
 * next person's row.
 *
 * Mobile is deliberately never read here — this export doesn't carry it,
 * and even if a future one did, mobile numbers collected by hand are the
 * one field an import must never overwrite.
 */

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const HEADER_LABELS = ['Name', 'StaffID', 'Job', 'Dept', 'Unit', 'DIDNo', 'EXTNo', 'Mobile'];
const COLUMN_ORDER = HEADER_LABELS;

function detectHeader(items) {
  const found = {};
  let headerBottom = -Infinity;
  for (const it of items) {
    if (it.top > 100) continue; // header sits near the top of the page
    if (HEADER_LABELS.includes(it.text)) {
      found[it.text] = it.x0;
      headerBottom = Math.max(headerBottom, it.top);
    }
  }
  // require the columns that actually matter — DIDNo/Mobile are ignored
  // downstream, so their absence shouldn't block detection
  const essential = ['Name', 'StaffID', 'Job', 'Dept', 'Unit'];
  if (!essential.every((k) => found[k] != null)) return null;
  return { found, headerBottom };
}

function buildBounds(found) {
  const present = COLUMN_ORDER.filter((k) => found[k] != null);
  const bounds = {};
  present.forEach((key, i) => {
    const next = present[i + 1];
    bounds[key] = [found[key], next ? found[next] : Infinity];
  });
  return bounds;
}

function pageItems(content, viewportHeight) {
  return content.items
    .filter((it) => it.str.trim())
    .map((it) => ({
      text: it.str.trim(),
      x0: it.transform[4],
      top: viewportHeight - it.transform[5],
    }));
}

/** Strip the two-letter avatar initials this export prints before every name. */
function stripInitials(name) {
  return name.replace(/^[A-Z]{2,3}\s+(?=\S)/, '');
}

/**
 * @param {File} file
 * @returns {Promise<{ rows: Array<{sid,name,designation,dept,unit,ext}>, pageCount: number }>}
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

    const [sidL, sidR] = bounds.StaffID;
    const anchors = items
      .filter((it) => it.top > headerBottom && it.x0 >= sidL - 3 && it.x0 < sidR && /^\d+$/.test(it.text))
      .sort((a, b) => a.top - b.top);

    anchors.forEach((anchor, i) => {
      const prevTop = i > 0 ? anchors[i - 1].top : headerBottom;
      const nextTop = i < anchors.length - 1 ? anchors[i + 1].top : Infinity;
      const bandStart = (prevTop + anchor.top) / 2;
      const bandEnd = nextTop === Infinity ? Infinity : (anchor.top + nextTop) / 2;
      const band = items.filter((it) => it.top > bandStart && it.top <= bandEnd);

      const colText = (key) => {
        const b = bounds[key];
        if (!b) return '';
        const [l, r] = b;
        return band
          .filter((it) => it.x0 >= l - 3 && it.x0 < r - 3)
          .sort((a, b2) => a.top - b2.top || a.x0 - b2.x0)
          .map((it) => it.text)
          .join(' ')
          .trim();
      };

      const sid = anchor.text.trim();
      const row = {
        sid,
        name: stripInitials(colText('Name')),
        designation: colText('Job'),
        dept: colText('Dept'),
        unit: colText('Unit'),
        ext: colText('EXTNo'),
      };
      // a repeated staff ID within the file (shouldn't happen, but the
      // export is hand-maintained) — last occurrence wins
      if (indexBySid.has(sid)) rows[indexBySid.get(sid)] = row;
      else { indexBySid.set(sid, rows.length); rows.push(row); }
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
