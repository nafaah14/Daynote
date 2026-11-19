import { describe, expect, it } from 'vitest';
import { inline, isBareHtml, looksLikeMarkdown, markdownToHtml, textToHtml } from '../markdown';

describe('pasting Markdown into a note', () => {
  it('formats bold, italic, code and links, escaping the rest', () => {
    expect(inline('**TypeScript** and *React* use `npm run dev` <x>')).toBe(
      '<b>TypeScript</b> and <i>React</i> use <code>npm run dev</code> &lt;x&gt;',
    );
    expect(inline('see [the docs](https://a.b/c) or https://a.b')).toBe('see the docs (https://a.b/c) or https://a.b');
    expect(inline('snake_case_name and 2 * 3 * 4')).toBe('snake_case_name and 2 * 3 * 4');
  });

  it('turns a table into a real table', () => {
    const md = '| Part | What it is |\n|---|---|\n| **TypeScript** | The language |\n| React | Screens |';
    expect(markdownToHtml(md)).toBe(
      '<table><thead><tr><th>Part</th><th>What it is</th></tr></thead>'
      + '<tbody><tr><td><b>TypeScript</b></td><td>The language</td></tr><tr><td>React</td><td>Screens</td></tr></tbody></table>',
    );
  });

  it('builds lists (nested too), headings and paragraphs', () => {
    const md = '## Stack\n\nIt runs on:\n- Cloudflare\n  - Workers\n  - D1\n- React\n\n1. One\n2. Two';
    expect(markdownToHtml(md)).toBe(
      '<h2>Stack</h2><div>It runs on:</div>'
      + '<ul><li>Cloudflare<ul><li>Workers</li><li>D1</li></ul></li><li>React</li></ul>'
      + '<ol><li>One</li><li>Two</li></ol>',
    );
  });

  it('keeps code blocks and quotes as they are', () => {
    expect(markdownToHtml('```\nnpm run <b>\n```')).toBe('<pre><code>npm run &lt;b&gt;</code></pre>');
    expect(markdownToHtml('> a note')).toBe('<blockquote><div>a note</div></blockquote>');
    expect(markdownToHtml('One.\n\nTwo.')).toBe('<div>One.</div><div><br></div><div>Two.</div>');
  });

  it('only converts text that looks like Markdown', () => {
    expect(looksLikeMarkdown('Hello there')).toBe(false);
    expect(looksLikeMarkdown('Say **this** to them')).toBe(true);
    expect(looksLikeMarkdown('Things:\n- one\n- two')).toBe(true);
    expect(looksLikeMarkdown('a | b\n--|--\n1 | 2')).toBe(true);
    expect(textToHtml('a\n\nb')).toBe('<div>a</div><div><br></div><div>b</div>');
  });

  it('tells formatted clipboard HTML from bare wrappers', () => {
    expect(isBareHtml('<meta charset="utf-8"><span style="color: red">plain</span>')).toBe(true);
    expect(isBareHtml('<p><strong>Bold</strong></p>')).toBe(false);
    expect(isBareHtml('<span style="font-weight: 700">Bold</span>')).toBe(false);
  });
});
