/**
 * Turns one page of the "SID 2.0" export into staff rows. Pure — no pdf.js
 * import — so it can be tested without a browser or a worker.
 *
 * Quirks of this export, all read from a real one:
 *
 * - Every name cell starts with grey avatar initials ("AI"), printed in a
 *   smaller font than the name. Their baseline sits a fraction above or below
 *   the first name's, so they can't be stripped by position in the joined
 *   text — "Adnan AI Ibrahim". They're recognised by that smaller font, which
 *   also keeps a real all-caps word in a name safe.
 * - A unit head's avatar has a blue ring, which the browser prints as a square
 *   image centred on the initials. There's no text for it.
 * - Names and titles wrap unpredictably: the first name can share the
 *   avatar's line or start below it, on one to three lines.
 * - Each row sits between two thin separator lines. Row heights vary a lot
 *   with long department names, so those lines are the row's bounds; the
 *   midpoint between staff IDs is only the fallback.
 * - An empty extension prints as "0".
 */

const HEADER_LABELS = ['Name', 'StaffID', 'Job', 'Dept', 'Unit', 'DIDNo', 'EXTNo', 'Mobile'];
const COLUMN_ORDER = HEADER_LABELS;

const INITIALS = /^[A-Z]{1,3}$/;

export function detectHeader(items) {
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

export function buildBounds(found) {
  const present = COLUMN_ORDER.filter((k) => found[k] != null);
  const bounds = {};
  present.forEach((key, i) => {
    const next = present[i + 1];
    bounds[key] = [found[key], next ? found[next] : Infinity];
  });
  return bounds;
}

export function pageItems(content, viewportHeight) {
  return content.items
    .filter((it) => it.str.trim())
    .map((it) => ({
      text: it.str.trim(),
      x0: it.transform[4],
      top: viewportHeight - it.transform[5],
      size: Math.abs(it.transform[3]),
      width: it.width,
    }));
}

const multiply = (m, n) => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

/** Page-space box (top measured from the page's top edge) of a local rectangle. */
function boxOf(ctm, [x0, y0, x1, y1], viewportHeight) {
  const xa = ctm[0] * x0 + ctm[4], xb = ctm[0] * x1 + ctm[4];
  const ya = ctm[3] * y0 + ctm[5], yb = ctm[3] * y1 + ctm[5];
  return {
    left: Math.min(xa, xb),
    right: Math.max(xa, xb),
    top: viewportHeight - Math.max(ya, yb),
    bottom: viewportHeight - Math.min(ya, yb),
  };
}

/**
 * Pull the two things the text layer can't give us out of a page's operator
 * list: where images are painted, and where the row separator lines are.
 */
export function pageGraphics(opList, OPS, viewportHeight) {
  const images = [];
  const tops = new Set();
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];

  opList.fnArray.forEach((fn, i) => {
    const args = opList.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() || ctm;
    else if (fn === OPS.transform) ctm = multiply(ctm, args);
    else if (fn === OPS.paintImageXObject) images.push(boxOf(ctm, [0, 0, 1, 1], viewportHeight));
    else if (fn === OPS.constructPath && args[2]) {
      const box = boxOf(ctm, [args[2][0], args[2][1], args[2][2], args[2][3]], viewportHeight);
      if (box.right - box.left > 100 && box.bottom - box.top < 2) {
        tops.add(Math.round(box.top * 10) / 10);
      }
    }
  });

  return { images, lines: [...tops].sort((a, b) => a - b) };
}

/** A square image centred on the avatar's initials is the unit head ring. */
function hasRing(initials, images) {
  const cx = initials.x0 + initials.width / 2;
  const cy = initials.top - initials.size * 0.35; // top is the text baseline
  return images.some((img) => {
    const w = img.right - img.left;
    const h = img.bottom - img.top;
    return w >= initials.width * 2
      && Math.abs(w - h) < w * 0.1
      && Math.abs((img.left + img.right) / 2 - cx) < w / 8
      && Math.abs((img.top + img.bottom) / 2 - cy) < h / 8;
  });
}

/**
 * @returns {Array<{sid,name,designation,dept,unit,ext,isUnitHead}>}
 */
export function rowsFromPage(items, { images, lines }, bounds, headerBottom) {
  const [sidL, sidR] = bounds.StaffID;
  const anchors = items
    .filter((it) => it.top > headerBottom && it.x0 >= sidL - 3 && it.x0 < sidR && /^\d+$/.test(it.text))
    .sort((a, b) => a.top - b.top);

  return anchors.map((anchor, i) => {
    const prevTop = i > 0 ? anchors[i - 1].top : headerBottom;
    const nextTop = i < anchors.length - 1 ? anchors[i + 1].top : Infinity;
    const lineAbove = lines.filter((y) => y < anchor.top).pop();
    const lineBelow = lines.find((y) => y > anchor.top);
    const bandStart = lineAbove != null && lineAbove >= prevTop ? lineAbove : (prevTop + anchor.top) / 2;
    const bandEnd = lineBelow != null && lineBelow <= nextTop
      ? lineBelow
      : nextTop === Infinity ? Infinity : (anchor.top + nextTop) / 2;
    const band = items.filter((it) => it.top > bandStart && it.top <= bandEnd);

    const cell = (key) => {
      const b = bounds[key];
      if (!b) return [];
      const [l, r] = b;
      return band
        .filter((it) => it.x0 >= l - 3 && it.x0 < r - 3)
        .sort((a, b2) => a.top - b2.top || a.x0 - b2.x0);
    };
    const textOf = (cellItems) => cellItems.map((it) => it.text).join(' ').trim();

    const nameCell = cell('Name');
    const isInitials = (it) => INITIALS.test(it.text) && it.size < anchor.size - 0.1;
    const initials = nameCell.find(isInitials);
    const ext = textOf(cell('EXTNo'));

    return {
      sid: anchor.text.trim(),
      name: textOf(nameCell.filter((it) => !isInitials(it))),
      designation: textOf(cell('Job')),
      dept: textOf(cell('Dept')),
      unit: textOf(cell('Unit')),
      ext: ext === '0' ? '' : ext,
      isUnitHead: initials ? hasRing(initials, images) : false,
    };
  });
}
