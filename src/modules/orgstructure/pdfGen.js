/**
 * PDF generation for Org Structure.
 *
 * Uses jsPDF + jspdf-autotable for consistent output across mobile/desktop.
 * Returns a Blob so the preview can render pages via pdfjs-dist canvas.
 */

import { jsPDF } from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';
import { UNIT_COLORS, unitTotals, deptTotals, unitStaff } from './orgData';

applyPlugin(jsPDF);

/* ---- helpers ---- */
const hex = (c) => (UNIT_COLORS[c] || UNIT_COLORS.elec).bg;
const hexToRgb = (h) => {
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return [r, g, b];
};
function tint(rgb, amount = 0.88) {
  return rgb.map((c) => Math.round(c + (255 - c) * amount));
}

/**
 * Parse rich HTML into lines preserving list structure.
 * Returns array of strings like ["Purpose statement here", "1. First item", "2. Second item"]
 */
function htmlToLines(html) {
  if (!html) return [];
  const d = document.createElement('div');
  d.innerHTML = html;
  const lines = [];

  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        const txt = child.textContent.trim();
        if (txt) lines.push(txt);
      } else if (child.nodeType === 1) {
        const tag = child.tagName;
        if (tag === 'BR') {
          // skip, just a line break
        } else if (tag === 'OL') {
          let num = 1;
          for (const li of child.querySelectorAll(':scope > li')) {
            lines.push(`${num}. ${li.textContent.trim()}`);
            num++;
          }
        } else if (tag === 'UL') {
          for (const li of child.querySelectorAll(':scope > li')) {
            lines.push(`• ${li.textContent.trim()}`);
          }
        } else if (tag === 'LI') {
          // orphan LI not inside OL/UL
          lines.push(`• ${child.textContent.trim()}`);
        } else if (tag === 'P' || tag === 'DIV') {
          const txt = child.textContent.trim();
          if (txt) lines.push(txt);
        } else {
          walk(child);
        }
      }
    }
  };
  walk(d);

  // If we got nothing from structured walk, fall back to plain text with line splitting
  if (lines.length === 0) {
    const plain = d.textContent || '';
    return plain.split(/\n/).map((l) => l.trim()).filter(Boolean);
  }
  return lines;
}

function addFooters(doc) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const pages = doc.internal.getNumberOfPages();
  const dateStr = new Date().toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(6).setTextColor(150, 150, 150);
    doc.text(`Generated ${dateStr}  ·  Page ${i} of ${pages}`, pw / 2, ph - 5, { align: 'center' });
  }
}

/* ================================================================
   ORG STRUCTURE PDF
   ================================================================ */

export function generateOrgPdf(units, meta) {
  const dept = meta?.data?.department || "Male' Power Generation Department";
  const hod = meta?.data?.headOfDepartment || '';
  const totals = deptTotals(units);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 10;
  const usable = pw - margin * 2;
  let y = margin;

  // Header
  doc.setFontSize(8).setTextColor(130, 130, 130);
  doc.text('STELCO', margin, y + 3);
  y += 5;
  doc.setFontSize(14).setTextColor(20, 20, 20).setFont(undefined, 'bold');
  doc.text(dept, margin, y + 5);
  y += 8;
  doc.setFontSize(8).setTextColor(80, 80, 80).setFont(undefined, 'normal');
  const metaLine = [
    hod ? `Head of Department: ${hod}` : '',
    `Total: ${totals.existing} existing · ${totals.vacant} vacant · ${totals.total} headcount`,
  ].filter(Boolean).join('    ');
  doc.text(metaLine, margin, y + 3);
  y += 8;

  // Department node
  const deptBoxW = Math.min(100, usable * 0.4);
  const deptBoxX = (pw - deptBoxW) / 2;
  doc.setFillColor(28, 36, 51);
  doc.roundedRect(deptBoxX, y, deptBoxW, 8, 2, 2, 'F');
  doc.setFontSize(8).setTextColor(255, 255, 255).setFont(undefined, 'bold');
  doc.text(dept, pw / 2, y + 5.5, { align: 'center' });
  y += 12;

  // Unit cards
  const n = units.length;
  const gap = 4;
  const cardW = (usable - gap * (n - 1)) / n;
  const cardH = 14;

  units.forEach((u, i) => {
    const x = margin + i * (cardW + gap);
    const t = unitTotals(u);
    const rgb = hexToRgb(hex(u.data.color));
    doc.setFillColor(...tint(rgb));
    doc.setDrawColor(...rgb);
    doc.setLineWidth(0.6);
    doc.roundedRect(x, y, cardW, cardH, 1.5, 1.5, 'FD');
    doc.setFontSize(7).setTextColor(...rgb).setFont(undefined, 'bold');
    doc.text(u.data.name, x + cardW / 2, y + 4, { align: 'center', maxWidth: cardW - 4 });
    if (u.data.head) {
      doc.setFontSize(5.5).setTextColor(100, 100, 100).setFont(undefined, 'normal');
      doc.text(u.data.head, x + cardW / 2, y + 7.5, { align: 'center', maxWidth: cardW - 4 });
    }
    doc.setFontSize(5).setTextColor(120, 120, 120);
    doc.text(`${t.existing} existing` + (t.vacant > 0 ? ` · ${t.vacant} vacant` : ''), x + cardW / 2, y + 11, { align: 'center' });
  });
  y += cardH + 4;

  // Position tables side by side
  const tablesStartY = y;
  units.forEach((u, i) => {
    const x = margin + i * (cardW + gap);
    const rgb = hexToRgb(hex(u.data.color));
    const positions = u.data.positions || [];
    if (positions.length === 0) return;

    doc.autoTable({
      startY: tablesStartY,
      margin: { left: x, right: pw - x - cardW },
      tableWidth: cardW,
      head: [['Position', 'Ex.', 'Vac.']],
      body: positions.map((p) => [p.title, p.existing, p.vacant]),
      styles: { fontSize: 5.5, cellPadding: 1, lineWidth: 0.1, lineColor: [200, 200, 200], textColor: [40, 40, 40] },
      headStyles: { fillColor: rgb, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 5 },
      columnStyles: {
        0: { cellWidth: cardW - 18 },
        1: { cellWidth: 9, halign: 'center', fontStyle: 'bold' },
        2: { cellWidth: 9, halign: 'center' },
      },
      theme: 'grid',
    });
  });

  // ---- PAGE 2: Purpose & Services — column-wise with cards ----
  doc.addPage('a4', 'landscape');
  y = margin;
  doc.setFontSize(8).setTextColor(130, 130, 130);
  doc.text('PURPOSE & SERVICES', margin, y + 3);
  y += 5;
  doc.setFontSize(14).setTextColor(20, 20, 20).setFont(undefined, 'bold');
  doc.text(dept, margin, y + 5);
  y += 10;

  // Unit header cards (same row as structure page)
  const psCardH = 8;
  units.forEach((u, i) => {
    const x = margin + i * (cardW + gap);
    const rgb = hexToRgb(hex(u.data.color));
    doc.setFillColor(...rgb);
    doc.roundedRect(x, y, cardW, psCardH, 1.5, 1.5, 'F');
    doc.setFontSize(7).setTextColor(255, 255, 255).setFont(undefined, 'bold');
    doc.text(u.data.name, x + cardW / 2, y + 5.2, { align: 'center', maxWidth: cardW - 4 });
  });
  y += psCardH + 3;

  // Purpose rows — one autoTable per unit, side by side
  const purposeStartY = y;
  units.forEach((u, i) => {
    const x = margin + i * (cardW + gap);
    const rgb = hexToRgb(hex(u.data.color));
    const purposeLines = htmlToLines(u.data.purpose);
    const serviceLines = htmlToLines(u.data.services);

    const rows = [];
    if (purposeLines.length > 0) {
      rows.push([{ content: 'PURPOSE', styles: { fontStyle: 'bold', fontSize: 5, textColor: [130, 130, 130], cellPadding: { top: 1, bottom: 0, left: 2, right: 2 } } }]);
      purposeLines.forEach((line) => rows.push([line]));
    }
    if (serviceLines.length > 0) {
      rows.push([{ content: 'SERVICES', styles: { fontStyle: 'bold', fontSize: 5, textColor: [130, 130, 130], cellPadding: { top: 3, bottom: 0, left: 2, right: 2 } } }]);
      serviceLines.forEach((line) => rows.push([line]));
    }

    if (rows.length === 0) return;

    doc.autoTable({
      startY: purposeStartY,
      margin: { left: x, right: pw - x - cardW },
      tableWidth: cardW,
      body: rows,
      styles: { fontSize: 6, cellPadding: 1.2, lineWidth: 0, textColor: [40, 40, 40] },
      columnStyles: { 0: { cellWidth: cardW } },
      theme: 'plain',
      didDrawCell: (data) => {
        // Light left border in unit color
        if (data.section === 'body' && data.column.index === 0) {
          doc.setDrawColor(...rgb);
          doc.setLineWidth(0.4);
          doc.line(data.cell.x, data.cell.y, data.cell.x, data.cell.y + data.cell.height);
        }
      },
    });
  });

  addFooters(doc);
  return doc.output('blob');
}

/* ================================================================
   STAFF LIST PDF
   ================================================================ */

export function generateStaffPdf(units, deptPeople, meta, filterUnit) {
  const dept = meta?.data?.department || "Male' Power Generation Department";
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 12;
  const usable = pw - margin * 2;
  let y = margin;

  const showUnits = filterUnit ? units.filter((u) => u.data.name === filterUnit) : units;
  const filteredPeople = filterUnit
    ? deptPeople.filter((p) => (p.data.unit || '').trim() === filterUnit)
    : deptPeople;

  // Header
  doc.setFontSize(7).setTextColor(130, 130, 130);
  doc.text('STELCO', margin, y + 3);
  y += 5;
  doc.setFontSize(13).setTextColor(20, 20, 20).setFont(undefined, 'bold');
  doc.text(filterUnit ? `${dept} — ${filterUnit}` : `${dept} — Staff List`, margin, y + 5);
  y += 8;
  doc.setFontSize(8).setTextColor(80, 80, 80).setFont(undefined, 'normal');
  doc.text(`${filteredPeople.length} staff${filterUnit ? '' : ` across ${showUnits.length} units`}`, margin, y + 3);
  y += 8;

  showUnits.forEach((u) => {
    const rgb = hexToRgb(hex(u.data.color));
    const staff = unitStaff(deptPeople, u.data.name).sort((a, b) => a.title.localeCompare(b.title));
    if (staff.length === 0) return;
    if (y > ph - 25) { doc.addPage(); y = margin; }

    // Unit header bar
    doc.setFillColor(...rgb);
    doc.roundedRect(margin, y, usable, 7, 1, 1, 'F');
    doc.setFontSize(8).setTextColor(255, 255, 255).setFont(undefined, 'bold');
    doc.text(u.data.name, margin + 4, y + 4.8);
    doc.setFontSize(7).setFont(undefined, 'normal');
    doc.text(`${staff.length} staff`, margin + usable - 4, y + 4.8, { align: 'right' });
    y += 9;

    doc.autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [['#', 'Name', 'Staff ID', 'Designation', 'Mobile']],
      body: staff.map((p, i) => [
        i + 1,
        p.title,
        p.data.sid,
        p.data.designation,
        p.data.mobile || '',
      ]),
      styles: { fontSize: 8, cellPadding: 2.5, lineWidth: 0.1, lineColor: [210, 210, 210], textColor: [30, 30, 30] },
      headStyles: { fillColor: [240, 240, 245], textColor: [80, 80, 80], fontStyle: 'bold', fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 55 },
        2: { cellWidth: 22, halign: 'center' },
        3: { cellWidth: 'auto' },
        4: { cellWidth: 28 },
      },
      theme: 'grid',
      didParseCell: (data) => {
        // Bold the name cell for unit heads
        if (data.section === 'body' && data.column.index === 1) {
          const person = staff[data.row.index];
          if (person?.data?.isUnitHead) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.text = [person.title + '  (H)'];
          }
        }
      },
    });
    y = doc.lastAutoTable.finalY + 6;
  });

  // Unassigned
  if (!filterUnit) {
    const unitNames = new Set(units.map((u) => u.data.name));
    const unassigned = deptPeople
      .filter((p) => !(p.data.unit || '').trim() || !unitNames.has((p.data.unit || '').trim()))
      .sort((a, b) => a.title.localeCompare(b.title));

    if (unassigned.length > 0) {
      if (y > ph - 25) { doc.addPage(); y = margin; }
      doc.setFillColor(150, 150, 150);
      doc.roundedRect(margin, y, usable, 7, 1, 1, 'F');
      doc.setFontSize(8).setTextColor(255, 255, 255).setFont(undefined, 'bold');
      doc.text('Unassigned', margin + 4, y + 4.8);
      doc.setFontSize(7).setFont(undefined, 'normal');
      doc.text(`${unassigned.length} staff`, margin + usable - 4, y + 4.8, { align: 'right' });
      y += 9;

      doc.autoTable({
        startY: y,
        margin: { left: margin, right: margin },
        head: [['#', 'Name', 'Staff ID', 'Designation', 'Mobile']],
        body: unassigned.map((p, i) => [i + 1, p.title, p.data.sid, p.data.designation, p.data.mobile || '']),
        styles: { fontSize: 8, cellPadding: 2.5, lineWidth: 0.1, lineColor: [210, 210, 210], textColor: [30, 30, 30] },
        headStyles: { fillColor: [240, 240, 245], textColor: [80, 80, 80], fontStyle: 'bold', fontSize: 7 },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 55 },
          2: { cellWidth: 22, halign: 'center' },
          3: { cellWidth: 'auto' },
          4: { cellWidth: 28 },
        },
        theme: 'grid',
      });
    }
  }

  addFooters(doc);
  return doc.output('blob');
}

/* ================================================================
   DIRECTORY PDF — generic staff list with filters
   ================================================================ */

export function generateDirectoryPdf(people, { filters, filterLabel, searchTerm }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 12;
  const usable = pw - margin * 2;
  let y = margin;

  // Build criteria string
  const parts = Object.entries(filters || {})
    .filter(([, v]) => v)
    .map(([k, v]) => filterLabel ? filterLabel(k, v) : v);
  if (searchTerm?.trim()) parts.push(`search "${searchTerm.trim()}"`);
  const criteria = parts.length ? parts.join(' · ') : 'All staff';
  const hasPersonal = people.some((p) => p.data.personal);

  // Header
  doc.setFontSize(7).setTextColor(130, 130, 130);
  doc.text('STELCO', margin, y + 3);
  y += 5;
  doc.setFontSize(14).setTextColor(20, 20, 20).setFont(undefined, 'bold');
  doc.text(hasPersonal ? 'Directory' : 'Staff Directory', margin, y + 5);
  y += 8;
  doc.setFontSize(8).setTextColor(80, 80, 80).setFont(undefined, 'normal');
  doc.text(`${people.length} ${hasPersonal ? 'people' : 'staff'} · ${criteria}`, margin, y + 3);
  y += 8;

  // Group by department+unit for a clean layout — a personal contact never
  // has a department (see core/people.js), so it groups by company instead,
  // under "Personal" if it doesn't have one either.
  const groups = new Map();
  people.forEach((p) => {
    const dept = p.data.personal ? (p.data.company || 'Personal') : (p.data.dept || 'Unassigned');
    const unit = p.data.personal ? '' : (p.data.unit || 'No unit');
    const key = unit ? `${dept} — ${unit}` : dept;
    if (!groups.has(key)) groups.set(key, { dept, unit, staff: [] });
    groups.get(key).staff.push(p);
  });

  // If filtering by a single department+unit, skip the section headers
  const singleGroup = groups.size === 1;

  for (const [key, group] of groups) {
    if (y > ph - 25) { doc.addPage(); y = margin; }

    if (!singleGroup) {
      // Section header
      doc.setFillColor(40, 50, 70);
      doc.roundedRect(margin, y, usable, 7, 1, 1, 'F');
      doc.setFontSize(7.5).setTextColor(255, 255, 255).setFont(undefined, 'bold');
      doc.text(key, margin + 4, y + 4.8);
      doc.setFont(undefined, 'normal');
      doc.text(`${group.staff.length}`, margin + usable - 4, y + 4.8, { align: 'right' });
      y += 9;
    }

    const sorted = group.staff.sort((a, b) => a.title.localeCompare(b.title));

    doc.autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [['#', 'Name', 'Staff ID', 'Designation', 'Mobile']],
      body: sorted.map((p, i) => [
        i + 1,
        p.title,
        p.data.sid,
        p.data.designation,
        p.data.mobile || '',
      ]),
      styles: { fontSize: 8, cellPadding: 2.5, lineWidth: 0.1, lineColor: [210, 210, 210], textColor: [30, 30, 30] },
      headStyles: { fillColor: [240, 240, 245], textColor: [80, 80, 80], fontStyle: 'bold', fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 55 },
        2: { cellWidth: 22, halign: 'center' },
        3: { cellWidth: 'auto' },
        4: { cellWidth: 28 },
      },
      theme: 'grid',
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 1) {
          const person = sorted[data.row.index];
          if (person?.data?.isUnitHead) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.text = [person.title + '  (H)'];
          }
        }
      },
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  addFooters(doc);
  return doc.output('blob');
}
