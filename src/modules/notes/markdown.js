/**
 * Pasting into a note. Chat apps (Claude, ChatGPT…) copy their answers as
 * Markdown — `**bold**`, `- item`, `| a | b |` — and a phone's text selection
 * copies plain text only, so without this a pasted answer lands as raw
 * symbols or one cell per line. Pure string work (no DOM) so it is testable
 * in node; the result still goes through the editor's sanitize().
 */

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Inline Markdown on one line of text → HTML (escaped first). */
export function inline(text) {
  const codes = [];
  let s = esc(text).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_, t, url) => (t === url ? t : `${t} (${url})`))
    .replace(/\*\*\*(?=\S)(.+?)(?<=\S)\*\*\*/g, '<b><i>$1</i></b>')
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^\w])__(?=\S)(.+?)(?<=\S)__(?!\w)/g, '$1<b>$2</b>')
    .replace(/(^|[^*\w])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?!\*)/g, '$1<i>$2</i>')
    .replace(/(^|[^\w])_(?=\S)(.+?)(?<=\S)_(?!\w)/g, '$1<i>$2</i>')
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '$1');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

/** Does this plain text look like Markdown worth converting? */
export function looksLikeMarkdown(text) {
  if (!text || !/\n|\*\*|`/.test(text)) return false;
  const lines = text.split(/\r?\n/);
  return lines.some((l, i) =>
    HEADING.test(l)
    || LIST.test(l)
    || /^\s*>/.test(l)
    || /^\s*```/.test(l)
    || (l.includes('|') && TABLE_SEP.test(lines[i + 1] || '')))
    || /\*\*\S.*?\S\*\*|\*\*\S\*\*/.test(text);
}

/** Markdown → the note's HTML: a <div> per line, real lists, tables, headings. */
export function markdownToHtml(md) {
  const lines = md.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  const out = [];
  // A blank line becomes an empty line only between two plain lines; lists,
  // tables, headings and the like have their own spacing.
  let blank = false;
  let lastBlock = true;
  const push = (html, block = true) => {
    if (blank && !lastBlock && !block) out.push('<div><br></div>');
    blank = false;
    lastBlock = block;
    out.push(html);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { blank = true; continue; }

    if (/^\s*```/.test(line)) {
      const code = [];
      while (++i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i]);
      push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }

    const h = HEADING.exec(line);
    if (h) {
      const tag = h[1].length <= 2 ? 'h2' : 'h3';
      push(`<${tag}>${inline(h[2])}</${tag}>`);
      continue;
    }

    if (RULE.test(line)) { push('<hr>'); continue; }

    if (line.includes('|') && TABLE_SEP.test(lines[i + 1] || '')) {
      const head = cells(line);
      const rows = [];
      i += 1;
      while (i + 1 < lines.length && lines[i + 1].includes('|') && lines[i + 1].trim()) rows.push(cells(lines[++i]));
      const width = head.length;
      const tr = (cs, tag) => `<tr>${Array.from({ length: width }, (_, k) => `<${tag}>${inline(cs[k] ?? '')}</${tag}>`).join('')}</tr>`;
      push(`<table><thead>${tr(head, 'th')}</thead><tbody>${rows.map((r) => tr(r, 'td')).join('')}</tbody></table>`);
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) quote.push(lines[i].replace(/^\s*>\s?/, ''));
      i -= 1;
      push(`<blockquote>${quote.map((q) => `<div>${q.trim() ? inline(q) : '<br>'}</div>`).join('')}</blockquote>`);
      continue;
    }

    if (LIST.test(line)) {
      // Nested lists by indent: a stack of open lists, each with its indent.
      let html = '';
      const stack = [];
      for (; i < lines.length; i++) {
        const m = LIST.exec(lines[i]);
        if (!m) {
          // A wrapped continuation line belongs to the item above it.
          if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && stack.length) { html = html.replace(/<\/li>$/, ` ${inline(lines[i].trim())}</li>`); continue; }
          // A blank line between items keeps the list going.
          if (!lines[i].trim() && LIST.test(lines[i + 1] || '')) continue;
          break;
        }
        const indent = m[1].length;
        const ordered = /\d/.test(m[2]);
        const tag = ordered ? 'ol' : 'ul';
        while (stack.length > 1 && indent < stack[stack.length - 1].indent) {
          const s = stack.pop();
          html += `</${s.tag}>${s.nested ? '</li>' : ''}`;
        }
        const top = stack[stack.length - 1];
        if (!top || indent > top.indent) {
          if (top) html = html.replace(/<\/li>$/, '');
          const start = ordered && Number(m[2].slice(0, -1)) !== 1 ? ` start="${Number(m[2].slice(0, -1))}"` : '';
          html += `<${tag}${start}>`;
          stack.push({ tag, indent, nested: !!top });
        } else if (top.tag !== tag) {
          html += `</${stack.pop().tag}><${tag}>`;
          stack.push({ tag, indent, nested: top.nested });
        }
        html += `<li>${inline(m[3])}</li>`;
      }
      i -= 1;
      while (stack.length) {
        const s = stack.pop();
        html += `</${s.tag}>${s.nested ? '</li>' : ''}`;
      }
      push(html);
      continue;
    }

    push(`<div>${inline(line.trim())}</div>`, false);
  }
  return out.join('');
}

/** Plain text (no Markdown) → one <div> per line, so line breaks survive. */
export function textToHtml(text) {
  return text.replace(/\r\n?/g, '\n').split('\n').map((l) => `<div>${l ? esc(l) : '<br>'}</div>`).join('');
}

/** Clipboard HTML that carries no real formatting (just text in wrappers). */
export function isBareHtml(html) {
  return !/<(b|strong|i|em|u|ul|ol|li|table|h[1-6]|pre|code|blockquote)\b/i.test(html)
    && !/font-weight\s*:\s*(bold|[6-9]00)/i.test(html);
}
