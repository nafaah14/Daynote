/**
 * Blocks → a real Word .docx (Office Open XML), which Word, Google Docs, WPS
 * and phone viewers all open. No library: the parts are short XML strings
 * and the zip is "stored" (uncompressed) — notes are small, and every docx
 * reader accepts it. Pure, so it is tested in node.
 */

const enc = new TextEncoder();

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** files: [{ name, data: string | Uint8Array }] → zip bytes (no compression). */
export function zip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, 0, true);
    local.setUint16(12, 0x21, true); // 1980-01-01
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, 0, true);
    cd.setUint16(14, 0x21, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) { out.set(p, at); at += p.length; }
  return out;
}

const x = (s) => String(s)
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const BASE_HALF_PT = 22; // 11 pt

function run(r, bold = false) {
  if (r.br) return '<w:r><w:br/></w:r>';
  // Word wants these in the schema's order: fonts, b, i, color, sz, u, shd.
  const pr = [
    r.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>' : '',
    r.b || bold ? '<w:b/><w:bCs/>' : '',
    r.i ? '<w:i/><w:iCs/>' : '',
    r.color ? `<w:color w:val="${r.color}"/>` : '',
    r.size && r.size !== 1 ? `<w:sz w:val="${Math.round(BASE_HALF_PT * r.size)}"/><w:szCs w:val="${Math.round(BASE_HALF_PT * r.size)}"/>` : '',
    r.u ? '<w:u w:val="single"/>' : '',
    r.code ? '<w:shd w:val="clear" w:color="auto" w:fill="EEEEEE"/>' : '',
  ].join('');
  return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}<w:t xml:space="preserve">${x(r.text)}</w:t></w:r>`;
}

const para = (runs, ppr = '', bold = false) =>
  `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${runs.map((r) => run(r, bold)).join('')}</w:p>`;

function table(rows) {
  const cols = Math.max(...rows.map((r) => r.length));
  const width = Math.floor(9000 / cols);
  const border = (side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>`;
  const body = rows.map((cells) => {
    const head = cells.every((c) => c.head);
    const tcs = Array.from({ length: cols }, (_, k) => {
      const c = cells[k] || { runs: [], head };
      const shade = c.head ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : '';
      return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${shade}</w:tcPr>${para(c.runs, '<w:spacing w:before="40" w:after="40"/>', c.head)}</w:tc>`;
    }).join('');
    return `<w:tr>${head ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${tcs}</w:tr>`;
  }).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders>`
    + `<w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>`
    + `<w:tblGrid>${`<w:gridCol w:w="${width}"/>`.repeat(cols)}</w:tblGrid>${body}</w:tbl><w:p/>`;
}

/** Numbering: abstract 1 = bullets, 2 = numbers; each list gets its own num so numbers restart. */
function numbering(nums) {
  const bullet = ['•', '◦', '▪', '•', '◦'];
  const fmt = ['decimal', 'lowerLetter', 'lowerRoman', 'decimal', 'lowerLetter'];
  const lvl = (i, ordered) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${ordered ? fmt[i] : 'bullet'}"/>`
    + `<w:lvlText w:val="${ordered ? `%${i + 1}.` : bullet[i]}"/><w:lvlJc w:val="left"/>`
    + `<w:pPr><w:ind w:left="${360 * (i + 2)}" w:hanging="360"/></w:pPr></w:lvl>`;
  const abs = (id, ordered) => `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>${[0, 1, 2, 3, 4].map((i) => lvl(i, ordered)).join('')}</w:abstractNum>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${abs(1, false)}${abs(2, true)}`
    + nums.map((n) => `<w:num w:numId="${n.id}"><w:abstractNumId w:val="${n.ordered ? 2 : 1}"/>`
      + `${n.ordered ? [0, 1, 2, 3, 4].map((i) => `<w:lvlOverride w:ilvl="${i}"><w:startOverride w:val="1"/></w:lvlOverride>`).join('') : ''}</w:num>`).join('')
    + `</w:numbering>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="${BASE_HALF_PT}"/><w:szCs w:val="${BASE_HALF_PT}"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="200"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="60"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="25"/><w:szCs w:val="25"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="BFBFBF"/></w:pBdr><w:ind w:left="240"/></w:pPr><w:rPr><w:color w:val="595959"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="19"/></w:rPr></w:style>
</w:styles>`;

export function docxDocument(title, blocks) {
  const body = [];
  const nums = [];
  let current = null; // the list being written: { 0: numId for depth 0 … }
  if (title) body.push(para([{ text: title }], '<w:pStyle w:val="Title"/>'));
  for (const b of blocks) {
    if (b.type !== 'li') current = null;
    if (b.type === 'p') body.push(para(b.runs, b.quote ? '<w:pStyle w:val="Quote"/>' : ''));
    else if (b.type === 'h') body.push(para(b.runs, `<w:pStyle w:val="${b.level === 2 ? 'Heading1' : 'Heading2'}"/>`));
    else if (b.type === 'hr') body.push('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BFBFBF"/></w:pBdr></w:pPr></w:p>');
    else if (b.type === 'pre') body.push(b.text.split('\n').map((l) => para(l ? [{ text: l }] : [], '<w:pStyle w:val="Code"/>')).join(''), '<w:p/>');
    else if (b.type === 'table') body.push(table(b.rows));
    else if (b.type === 'li') {
      if (!current) current = {};
      const key = `${b.depth}:${b.ordered}`;
      // A new list at this depth (its first item) restarts the numbering.
      if (b.start || !current[key]) {
        const id = nums.length + 1;
        nums.push({ id, ordered: b.ordered });
        current[key] = id;
      }
      body.push(para(b.runs, `<w:numPr><w:ilvl w:val="${Math.min(b.depth, 4)}"/><w:numId w:val="${current[key]}"/></w:numPr><w:spacing w:after="20"/>`));
    }
  }
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}`
    + `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  return { doc, numbering: numbering(nums) };
}

export function noteDocx(title, blocks) {
  const { doc, numbering: num } = docxDocument(title, blocks);
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  return zip([
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
    { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(title || '')}</dc:title><dc:creator>Daybook</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>` },
    { name: 'word/_rels/document.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>` },
    { name: 'word/document.xml', data: doc },
    { name: 'word/styles.xml', data: STYLES },
    { name: 'word/numbering.xml', data: num },
  ]);
}
