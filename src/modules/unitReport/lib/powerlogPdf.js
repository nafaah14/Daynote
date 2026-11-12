/** Reads a Powerlog Task Report PDF in the browser; parsing is in powerlog.js. */
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { parsePowerlog } from './powerlog';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export async function pagesOf(pdfjs, data) {
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const h = page.getViewport({ scale: 1 }).height;
    const content = await page.getTextContent();
    pages.push({ items: content.items.map((i) => ({ x: i.transform[4], y: h - i.transform[5], str: i.str })) });
  }
  return pages;
}

export async function readPowerlog(file) {
  const result = parsePowerlog(await pagesOf(pdfjsLib, new Uint8Array(await file.arrayBuffer())));
  if (!result.tasks.length) {
    throw new Error("No tasks found — this doesn't look like a Powerlog Task Report PDF.");
  }
  return result;
}
