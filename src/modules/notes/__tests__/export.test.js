import { describe, expect, it } from 'vitest';
import { crc32, docxDocument, noteDocx } from '../export/docx';
import { latin } from '../export/pdf';
import { fileName } from '../export/blocks';

const run = (text, over = {}) => ({ text, b: false, i: false, u: false, code: false, color: null, size: 1, ...over });

const blocks = [
  { type: 'h', level: 2, runs: [run('Stack')] },
  { type: 'p', runs: [run('Built with '), run('TypeScript', { b: true }), run(' & <React>', { color: 'D9534F' })] },
  { type: 'li', ordered: true, depth: 0, runs: [run('One')], start: true },
  { type: 'li', ordered: true, depth: 0, runs: [run('Two')] },
  { type: 'p', runs: [] },
  { type: 'li', ordered: true, depth: 0, runs: [run('Again')], start: true },
  { type: 'table', rows: [[{ runs: [run('Part')], head: true }, { runs: [run('What')], head: true }], [{ runs: [run('D1')] }]] },
];

describe('note export', () => {
  it('writes a zip Word can open', () => {
    expect(crc32(new TextEncoder().encode('hello'))).toBe(0x3610a686);
    const bytes = noteDocx('My note', blocks);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK');
    const text = new TextDecoder().decode(bytes);
    for (const part of ['[Content_Types].xml', 'word/document.xml', 'word/styles.xml', 'word/numbering.xml']) expect(text).toContain(part);
  });

  it('keeps formatting, escapes text, restarts numbered lists', () => {
    const { doc, numbering } = docxDocument('My note', blocks);
    expect(doc).toContain('<w:pStyle w:val="Title"/>');
    expect(doc).toContain('<w:pStyle w:val="Heading1"/>');
    expect(doc).toContain('<w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">TypeScript');
    expect(doc).toContain('<w:color w:val="D9534F"/></w:rPr><w:t xml:space="preserve"> &amp; &lt;React&gt;');
    expect(doc.match(/<w:numId w:val="(\d+)"\/>/g)).toEqual(['<w:numId w:val="1"/>', '<w:numId w:val="1"/>', '<w:numId w:val="2"/>']);
    expect(numbering).toContain('<w:num w:numId="2">');
    expect(doc).toContain('<w:tbl>');
    expect(doc).toContain('<w:tblHeader/>');
  });

  it('names files from the title and keeps PDF text in Latin-1', () => {
    expect(fileName('Plan: A/B "test"', 'pdf')).toBe('Plan A B test .pdf'.replace(' .', '.'));
    expect(fileName('', 'docx')).toBe('Note.docx');
    expect(latin('“Hi” — ok → 5 ✓ 🎉')).toBe('"Hi"  -  ok -> 5 v ');
  });
});
