/**
 * Export a note as PDF or Word, then share it (the phone's share sheet:
 * WhatsApp, Viber, email, Drive…) or download it. PDF code (jsPDF) loads
 * only when a PDF is asked for.
 */
import { fileName, noteBlocks } from './blocks';

export const FORMATS = {
  pdf: { label: 'PDF', ext: 'pdf', type: 'application/pdf' },
  docx: { label: 'Word', ext: 'docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
};

/** Can this device share files (phones, Edge / Chrome on Windows)? */
export function canShareFiles() {
  try {
    return !!navigator.canShare?.({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] });
  } catch { return false; }
}

export async function noteFile(title, html, format) {
  const f = FORMATS[format];
  const blocks = noteBlocks(html);
  let blob;
  if (format === 'pdf') {
    const { notePdf } = await import('./pdf');
    blob = notePdf(title, blocks);
  } else {
    const { noteDocx } = await import('./docx');
    blob = new Blob([noteDocx(title, blocks)], { type: f.type });
  }
  return new File([blob], fileName(title, f.ext), { type: f.type });
}

function download(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** 'share' falls back to download where sharing files isn't possible. Returns false if cancelled. */
export async function exportNote({ title, html }, format, how) {
  const file = await noteFile(title, html, format);
  if (how === 'share' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: title || 'Note' });
      return true;
    } catch (e) {
      if (e?.name === 'AbortError') return false;
      // Some browsers refuse a share started after an await: download instead.
    }
  }
  download(file);
  return true;
}
