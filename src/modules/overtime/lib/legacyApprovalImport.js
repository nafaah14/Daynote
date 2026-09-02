/**
 * Parses HRMS's "My Overtimes" page (hrms.stelco.com.mv/my/overtimes),
 * saved as a browser .mhtml snapshot for one person's full period — the
 * real, manually-authorized daily OT the old (pre-Aug-2026) system actually
 * paid against, not an estimate from card time. Pure — no repo writes; the
 * caller (useLegacyApprovalImporter) matches the employee and persists.
 *
 * A day's real "Approved" figure can't be derived from card punches at all
 * (confirmed against a real HRMS export — the daily cap this page calls
 * "Daily OT Limit" varies day to day with no formula, and multiple claims
 * on one day split it), so this page is the only source of truth for it.
 */

/** Undoes the MIME multipart wrapper + quoted-printable encoding a saved
 *  .mhtml carries, down to the first text/html part's real HTML. QP source
 *  lines are 7-bit-safe ASCII by construction, so decoding byte-by-byte then
 *  interpreting as UTF-8 recovers the original text exactly. */
export function decodeMhtml(raw) {
  const htmlStart = raw.indexOf('<!DOCTYPE html>');
  if (htmlStart < 0) throw new Error('Not an .mhtml page snapshot — no HTML content found.');
  const boundaryMatch = raw.slice(0, 500).match(/boundary="([^"]+)"/);
  let htmlEnd = raw.length;
  if (boundaryMatch) {
    const idx = raw.indexOf('--' + boundaryMatch[1], htmlStart);
    if (idx !== -1) htmlEnd = idx;
  }
  const qp = raw.slice(htmlStart, htmlEnd).replace(/=\r?\n/g, '');
  const bytes = [];
  for (let i = 0; i < qp.length; i++) {
    if (qp[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(qp.substr(i + 1, 2))) {
      bytes.push(parseInt(qp.substr(i + 1, 2), 16));
      i += 2;
    } else {
      bytes.push(qp.charCodeAt(i) & 0xff);
    }
  }
  // TextDecoder, not Buffer — this runs in the browser (a file picker's
  // File.text()), not just in tests.
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
}

function stripTags(html) {
  return html.replace(/<[^>]*>/g, '|').split('|').map((s) => s.trim()).filter(Boolean);
}

function durMin(s) {
  const m = /(\d+)\s*hrs?\s*(\d+)\s*mins?/i.exec(s || '');
  return m ? (+m[1]) * 60 + (+m[2]) : null;
}

/** "Jul 16, 2026, Thursday" -> "2026-07-16" */
const MON = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
function toDateKey(s) {
  const m = /([A-Za-z]{3})\w*\s+(\d{1,2}),\s+(\d{4})/.exec(s || '');
  if (!m) return null;
  const mo = MON[m[1]];
  if (!mo) return null;
  return `${m[3]}-${String(mo).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}`;
}

/** "05:34:18" -> 20058 (seconds since midnight) */
function toSec(s) {
  const m = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(s || '');
  if (!m) return null;
  return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
}

export function parseMyOvertimesMhtml(text) {
  const html = decodeMhtml(text);

  const empMatch = html.match(/placeholder="Select Employee"[\s\S]{0,800}?mat-select-min-line[^>]*>([^<(]+)\((\d+)\)/);
  if (!empMatch) throw new Error('Could not find the selected employee on this page — is this the "My Overtimes" view?');
  const employeeName = empMatch[1].trim();
  const employeeSid = empMatch[2].trim();

  const claims = [];
  const rowRe = /<app-overtime-update-row\b[^>]*>([\s\S]*?)<\/app-overtime-update-row>/g;
  let m;
  while ((m = rowRe.exec(html))) {
    const rowHtml = m[0];
    // The Angular component id in this attribute (e.g. "gps-c417",
    // "ixq-c786") is generated per browser session, not per HRMS install —
    // a file saved from a different session uses a different id, so this
    // must not be hardcoded.
    const cells = rowHtml
      .split(/<div _ngcontent-[a-z0-9]+-c\d+="" fxflex="[^"]*"[^>]*class="mat-cell[^>]*>/)
      .slice(1)
      .map((c) => stripTags(c));
    const [dateCell = [], startCell = [], endCell = [], durationCell = [], , reasonCell = []] = cells;

    const date = toDateKey(dateCell[0]);
    const start = startCell[0] || null;
    const end = endCell[0] || null;
    const durationMin = durMin(durationCell[0]);

    // The row background is the authority on whether these hours are PAID —
    // verified exactly against Ahmed Faizan's real period (see
    // legacyReconciliation): summing `approved-bg` rows reproduces HRMS's
    // published "All"/"Approved" totals, and summing `incomplete-hours-bg`
    // rows reproduces its "Incomplete Working Hours" figure, to the minute.
    //
    // Crucially, an `incomplete-hours-bg` row can still carry an authorised
    // amount ("2 hrs 0 mins authorised", even a "Used Daily Limit") — those
    // hours went towards the weekly required hours, so HRMS authorises them
    // yet does NOT pay them. Treating any authorisation marker as "approved"
    // therefore overstates pay; only the background settles it.
    const bgClass = (rowHtml.match(/class="p-1 ([a-z-]+)/) || [])[1] || null;
    // What was authorised, whether or not it is payable.
    const authorisedMin = durMin((rowHtml.match(/mattooltip="Used Daily Limit"[^>]*>([^<]+)</) || [])[1])
      ?? durMin((rowHtml.match(/([\d]+\s*hrs?\s*[\d]+\s*mins?)\s*authoris/i) || [])[1]);
    // A request raised and still awaiting sign-off: a lone `color-primary`
    // span with a nested plain <small>Pending approval</small>.
    const pendingMin = durMin((rowHtml.match(/class="color-primary[^"]*">([^<]+)<small/) || [])[1]);

    const status = bgClass === 'approved-bg' ? 'approved' : pendingMin != null ? 'pending' : 'incomplete';
    const approvedMin = status === 'approved' ? authorisedMin : null;

    let durationCheckOk = null;
    const sSec = toSec(start), eSec = toSec(end);
    if (sSec != null && eSec != null && durationMin != null) {
      let diffMin = Math.round(((eSec >= sSec ? eSec - sSec : eSec + 86400 - sSec)) / 60);
      durationCheckOk = Math.abs(diffMin - durationMin) <= 1;
    }

    if (!date) continue;
    claims.push({
      date, start, end, durationMin, status, approvedMin, pendingMin, authorisedMin,
      reason: reasonCell.join(' / '), durationCheckOk,
    });
  }

  return { employeeName, employeeSid, claims };
}
