import { ArrowLeft } from 'lucide-react';
import { useBackClose } from '../../core/ui/components';
import { fmtPrice } from './stock';

/**
 * Printable view of the stock list, in two shapes:
 *
 *   'shopping' — what to buy: name, what's on hand, and where/what price.
 *                No restock threshold; when you're standing in a shop the
 *                trigger point is noise.
 *   'all'      — the full inventory, which DOES carry the threshold, since
 *                that's the number you'd be reviewing when you tune it.
 *
 * Neither shows barcodes or notes — those are for the app, not for paper.
 *
 * Printing follows the same trick payments' report uses: the report is an
 * overlay on top of the live app, so a naive print would put the whole app
 * on the page too. While it's open <body> is tagged, and print hides
 * everything then un-hides just this subtree (see stock.css).
 */

const fmtDate = (d) => d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

/** Shops as "City Mart — MVR 35.50" lines; an unpriced shop still lists. */
function shopLines(item) {
  const shops = item.data.shops || [];
  if (!shops.length) return [];
  return shops.map((s) => (s.price != null ? `${s.shop} — ${fmtPrice(s.price)}` : s.shop));
}

/** Cheapest known price, used for the shopping list's estimated total. */
export function cheapestPrice(item) {
  const priced = (item.data.shops || []).filter((s) => s.price != null);
  return priced.length ? Math.min(...priced.map((s) => s.price)) : null;
}

/** Group into [{ cat, items }], uncategorised last — matches the app's order. */
function groupByCategory(items) {
  const groups = {};
  const none = [];
  items.forEach((i) => {
    const cat = i.data.category || '';
    if (!cat) { none.push(i); return; }
    (groups[cat] ||= []).push(i);
  });
  const out = Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cat, list]) => ({ cat, items: list }));
  if (none.length) out.push({ cat: null, items: none });
  return out;
}

export function StockReport({ mode, items, onClose }) {
  useBackClose(onClose);
  const isShopping = mode === 'shopping';
  const title = isShopping ? 'Shopping list' : 'Stock on hand';
  const printedOn = new Date();
  const fileTitle = `${title} — ${printedOn.toLocaleDateString('en-CA')}`;
  const groups = groupByCategory(items);

  const priced = items.map(cheapestPrice).filter((p) => p != null);
  const estTotal = priced.length ? priced.reduce((a, b) => a + b, 0) : null;

  const handlePrint = () => {
    const prev = document.title;
    document.title = fileTitle;
    document.body.classList.add('printing-stock-report');
    const cleanup = () => {
      document.body.classList.remove('printing-stock-report');
      document.title = prev;
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
    setTimeout(cleanup, 1000); // some browsers never fire afterprint
  };

  return (
    <div className="stock-report-scrim">
      <div className="stock-report-top no-print">
        <div className="stock-report-heading">
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Back"><ArrowLeft size={19} /></button>
          <h2 className="stock-report-toptitle">Preview</h2>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={handlePrint}>Print / Save PDF</button>
      </div>

      <div className="stock-report-scroll">
        <div className="stock-report-content">
          <div className="stock-report-head">
            <h1 className="stock-report-h1">{title}</h1>
            <p className="stock-report-generated">{fmtDate(printedOn)}</p>
          </div>

          <p className="stock-report-sub">
            {items.length} {items.length === 1 ? 'item' : 'items'}
            {isShopping && estTotal != null && ` · estimated ${fmtPrice(estTotal)}`}
          </p>

          {items.length === 0 ? (
            <p className="stock-report-empty">
              {isShopping ? "Nothing to buy — everything's stocked." : 'Nothing tracked yet.'}
            </p>
          ) : (
            groups.map(({ cat, items: rows }) => (
              <section className="stock-report-group" key={cat || '__none__'}>
                {groups.length > 1 && <h2 className="stock-report-h2">{cat || 'Uncategorised'}</h2>}
                <table className="stock-report-table">
                  {/* Each category is its own table, so without fixed widths
                      every group sizes its columns to its own content and
                      the headings stop lining up down the page. */}
                  <colgroup>
                    <col style={{ width: isShopping ? '46%' : '36%' }} />
                    <col style={{ width: isShopping ? '16%' : '14%' }} />
                    {!isShopping && <col style={{ width: '14%' }} />}
                    <col />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="stock-report-num">On hand</th>
                      {!isShopping && <th className="stock-report-num">Min qty</th>}
                      <th>Where to buy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((i) => {
                      const lines = shopLines(i);
                      return (
                        <tr key={i.id}>
                          <td className="stock-report-name">{i.title}</td>
                          <td className="mono stock-report-num">{i.data.qty ?? 0}</td>
                          {!isShopping && (
                            <td className="mono stock-report-num">
                              {i.data.noRestock ? '—' : (i.data.lowStockAt ?? 0)}
                            </td>
                          )}
                          <td className="stock-report-shops">
                            {lines.length === 0
                              ? <span className="stock-report-dash">—</span>
                              : lines.map((l) => <span className="stock-report-shopline" key={l}>{l}</span>)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The shopping list as plain text for pasting into a chat. Deliberately
 * name + count only — a WhatsApp message wants to be skimmable, and shop and
 * price are for whoever's holding the printout, not the person being asked
 * to pick something up.
 */
export function shoppingListText(items) {
  const header = `Shopping list — ${fmtDate(new Date())}`;
  if (!items.length) return `${header}\nNothing to buy.`;
  const lines = items.map((i) => `• ${i.title} (${i.data.qty ?? 0} left)`);
  return [header, ...lines].join('\n');
}
