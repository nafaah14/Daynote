import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Copy, Check, RefreshCw, Plus, X, Zap } from 'lucide-react';
import { Card, Chip, Field, Input, Select, Button, SectionLabel } from '../../core/ui/components';
import { CATEGORIES, categoryById, convert } from './lib/units';
import { formatNumber, parseInput } from './lib/format';
import {
  QUICK_CURRENCIES, loadCachedRates, saveCachedRates, fetchRates, isStale, convertCurrency, currencyName,
} from './lib/currency';
import {
  ampsToKva, ampsToKw, ampsToOutputKw, kwToAmps, kvaToAmps, powerTriangle, voltageDrop, RESISTIVITY, ahToWh, whToAh,
} from './lib/electrical';
import './converter.css';

const PREFS_KEY = 'daybook.converter.prefs';
const TABS = [
  { id: 'currency', label: 'Currency' },
  ...CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
  { id: 'electrical', label: 'Electrical' },
];

const readPrefs = () => {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch { return {}; }
};
const writePrefs = (p) => {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* not persisted */ }
};

/** Preferences live in one small localStorage blob; this hook keeps it in state and writes through. */
function usePrefs() {
  const [prefs, setPrefs] = useState(readPrefs);
  const set = (patch) => setPrefs((p) => {
    const next = { ...p, ...patch };
    writePrefs(next);
    return next;
  });
  return [prefs, set];
}

function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  const copy = async (e) => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200); } catch { /* clipboard blocked */ }
  };
  return (
    <button type="button" className="icon-btn cv-copy" aria-label="Copy result" onClick={copy}>
      {done ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

/** One input, then the same value in every unit. Tap a row to make it the source. */
function ResultList({ rows, value, setValue, from, setFrom, onRemove }) {
  return (
    <>
      <div className="cv-input">
        <input
          className="input cv-big" inputMode="decimal" autoComplete="off" spellCheck={false}
          value={value} onChange={(e) => setValue(e.target.value)} placeholder="Type a number" aria-label="Value"
        />
        <span className="cv-from">{rows.find((r) => r.id === from)?.symbol || ''}</span>
        <button
          type="button" className="icon-btn" aria-label="Swap with the next unit" title="Swap with the next unit"
          onClick={() => {
            const i = rows.findIndex((r) => r.id === from);
            const next = rows[(i + 1) % rows.length];
            if (next) setFrom(next.id);
          }}
        >
          <ArrowLeftRight size={16} />
        </button>
      </div>
      <Card className="cv-results">
        {rows.map((r) => (
          <div
            key={r.id} role="button" tabIndex={0}
            className={`cv-row${r.id === from ? ' is-from' : ''}`}
            onClick={() => { if (r.id !== from) setFrom(r.id); }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.click(); }}
          >
            <div className="cv-row-main">
              <span className="cv-val">{r.text}</span>
              <span className="cv-sym">{r.symbol}</span>
            </div>
            <span className="cv-name">{r.name}</span>
            {r.text !== '—' && <CopyButton text={r.raw} />}
            {onRemove && r.id !== from && (
              <button type="button" className="icon-btn" aria-label={`Remove ${r.symbol}`} onClick={(e) => { e.stopPropagation(); onRemove(r.id); }}>
                <X size={14} />
              </button>
            )}
          </div>
        ))}
      </Card>
    </>
  );
}

const raw = (n) => (Number.isFinite(n) ? String(Number(n.toPrecision(12))) : '');

function UnitPanel({ cat, prefs, setPrefs }) {
  const saved = prefs.units?.[cat.id] || {};
  const from = cat.units.some((u) => u.id === saved.from) ? saved.from : cat.def[0];
  const [value, setValueRaw] = useState(saved.value ?? '1');
  const remember = (f, v) => setPrefs({ units: { ...prefs.units, [cat.id]: { from: f, value: v } } });

  const n = parseInput(value);
  const rows = cat.units.map((u) => {
    const r = convert(n, cat, from, u.id);
    return { id: u.id, name: u.name, symbol: u.symbol, text: formatNumber(r), raw: raw(r) };
  });
  return (
    <ResultList
      rows={rows} value={value} from={from}
      setValue={(v) => { setValueRaw(v); remember(from, v); }}
      setFrom={(f) => { const nv = rawValue(rows, f, value); setValueRaw(nv); remember(f, nv); }}
    />
  );
}
const rawValue = (rows, f, fallback) => rows.find((r) => r.id === f)?.raw || fallback;

function CurrencyPanel({ prefs, setPrefs }) {
  const [cache, setCache] = useState(loadCachedRates);
  const [status, setStatus] = useState('idle'); // idle | loading | error
  const saved = prefs.currency || {};
  const pinned = saved.pinned || QUICK_CURRENCIES;
  const from = pinned.includes(saved.from) ? saved.from : pinned[0];
  const [value, setValueRaw] = useState(saved.value ?? '100');
  const patch = (p) => setPrefs({ currency: { pinned, from, value, ...p } });

  const refresh = async () => {
    setStatus('loading');
    try {
      const fresh = await fetchRates();
      saveCachedRates(fresh);
      setCache(fresh);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };
  useEffect(() => { if (isStale(loadCachedRates())) refresh(); }, []);

  const rates = cache?.rates;
  const n = parseInput(value);
  const rows = pinned.map((code) => {
    const r = convertCurrency(n, from, code, rates);
    return { id: code, name: currencyName(code), symbol: code, text: formatNumber(r), raw: raw(r) };
  });
  const more = useMemo(() => (rates ? Object.keys(rates).filter((c) => !pinned.includes(c)).sort() : []), [rates, pinned]);
  const age = cache ? new Date(cache.fetchedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : null;

  return (
    <>
      <ResultList
        rows={rows} value={value} from={from}
        setValue={(v) => { setValueRaw(v); patch({ value: v }); }}
        setFrom={(f) => { const nv = rawValue(rows, f, value); setValueRaw(nv); patch({ from: f, value: nv }); }}
        onRemove={pinned.length > 2 ? (code) => patch({ pinned: pinned.filter((c) => c !== code) }) : null}
      />
      <div className="cv-meta">
        <span>
          {cache ? `Rates fetched ${age}` : status === 'loading' ? 'Fetching rates…' : 'No rates yet — connect to the internet'}
          {status === 'error' && cache ? ' · couldn’t refresh, showing the last saved rates' : ''}
          {status === 'error' && !cache ? ' · couldn’t fetch rates' : ''}
        </span>
        <Button size="sm" onClick={refresh} disabled={status === 'loading'}><RefreshCw size={13} /> Refresh</Button>
      </div>
      {more.length > 0 && (
        <Field label="Add a currency">
          <Select value="" onChange={(e) => e.target.value && patch({ pinned: [...pinned, e.target.value] })}>
            <option value="">Choose…</option>
            {more.map((c) => <option key={c} value={c}>{c} — {currencyName(c)}</option>)}
          </Select>
        </Field>
      )}
    </>
  );
}

/* ----------------------------- electrical ------------------------------ */

const VOLT_PRESETS = { 1: ['230', '240', '120'], 3: ['400', '415', '380', '690'] };

/** A labelled number box whose value is plain text, parsed only when read. */
function Num({ label, value, onChange, unit, hint }) {
  return (
    <Field label={unit ? `${label} (${unit})` : label} hint={hint}>
      <Input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" />
    </Field>
  );
}

function Out({ label, value, unit, digits }) {
  return (
    <div className="cv-out">
      <span className="cv-out-label">{label}</span>
      <span className="cv-out-val">
        {Number.isFinite(value) ? (digits != null ? value.toFixed(digits) : formatNumber(value)) : '—'}
        <small>{Number.isFinite(value) && unit ? ` ${unit}` : ''}</small>
      </span>
    </div>
  );
}

function PhasePick({ phase, setPhase, volts, setVolts }) {
  return (
    <>
      <div className="cv-seg" role="group" aria-label="Phase">
        {[1, 3].map((p) => (
          <button
            key={p} type="button" className={phase === p ? 'is-on' : ''}
            onClick={() => { setPhase(p); setVolts(VOLT_PRESETS[p][0]); }}
          >{p === 1 ? 'Single phase' : 'Three phase'}</button>
        ))}
      </div>
      <div className="cv-chips">
        {VOLT_PRESETS[phase].map((v) => (
          <Chip key={v} tone={volts === v ? 'accent' : 'neutral'} onClick={() => setVolts(v)}>{v} V</Chip>
        ))}
      </div>
    </>
  );
}

function AmpsCalc({ prefs, setPrefs }) {
  const s = prefs.elec?.amps || {};
  const [phase, setPhase] = useState(s.phase || 3);
  const [volts, setVolts] = useState(s.volts || '400');
  const [pf, setPf] = useState(s.pf || '0.8');
  const [eff, setEff] = useState(s.eff || '100');
  const [amps, setAmps] = useState('50');
  const [kw, setKw] = useState('');
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- write-through on the four settings only
  useEffect(() => { setPrefs({ elec: { ...prefs.elec, amps: { phase, volts, pf, eff } } }); }, [phase, volts, pf, eff]);

  const V = parseInput(volts); const PF = parseInput(pf); const EF = parseInput(eff) / 100;
  const I = parseInput(amps); const P = parseInput(kw);
  const fromAmps = Number.isFinite(I);
  return (
    <Card className="cv-card">
      <h3 className="cv-h">Amps ↔ kW / kVA</h3>
      <PhasePick phase={phase} setPhase={setPhase} volts={volts} setVolts={setVolts} />
      <div className="cv-grid">
        <Num label="Voltage" unit="V" value={volts} onChange={setVolts} />
        <Num label="Power factor" value={pf} onChange={setPf} />
        <Num label="Efficiency" unit="%" value={eff} onChange={setEff} hint="100 for non-motor loads" />
      </div>
      <div className="cv-grid">
        <Num label="Current" unit="A" value={amps} onChange={(v) => { setAmps(v); setKw(''); }} />
        <Num label="Output power" unit="kW" value={kw} onChange={(v) => { setKw(v); setAmps(''); }} hint="Type either box" />
      </div>
      <div className="cv-outs">
        {fromAmps ? (
          <>
            <Out label="Apparent power" value={ampsToKva({ phase, volts: V, amps: I })} unit="kVA" />
            <Out label="Input power" value={ampsToKw({ phase, volts: V, amps: I, pf: PF })} unit="kW" />
            <Out label="Output power" value={ampsToOutputKw({ phase, volts: V, amps: I, pf: PF, eff: EF })} unit="kW" />
          </>
        ) : (
          <>
            <Out label="Current" value={kwToAmps({ phase, volts: V, kw: P, pf: PF, eff: EF })} unit="A" />
            <Out label="Apparent power" value={ampsToKva({ phase, volts: V, amps: kwToAmps({ phase, volts: V, kw: P, pf: PF, eff: EF }) })} unit="kVA" />
          </>
        )}
      </div>
    </Card>
  );
}

function KvaCalc({ prefs }) {
  const s = prefs.elec?.amps || {};
  const [phase, setPhase] = useState(s.phase || 3);
  const [volts, setVolts] = useState(s.volts || '400');
  const [kva, setKva] = useState('100');
  const V = parseInput(volts);
  return (
    <Card className="cv-card">
      <h3 className="cv-h">kVA → current</h3>
      <PhasePick phase={phase} setPhase={setPhase} volts={volts} setVolts={setVolts} />
      <div className="cv-grid">
        <Num label="Voltage" unit="V" value={volts} onChange={setVolts} />
        <Num label="Rating" unit="kVA" value={kva} onChange={setKva} />
      </div>
      <div className="cv-outs"><Out label="Full-load current" value={kvaToAmps({ phase, volts: V, kva: parseInput(kva) })} unit="A" /></div>
    </Card>
  );
}

function TriangleCalc() {
  const [f, setF] = useState({ kw: '80', kva: '100', kvar: '', pf: '' });
  const [order, setOrder] = useState(['kw', 'kva']); // most recently edited last
  const set = (key) => (v) => {
    setF((x) => ({ ...x, [key]: v }));
    setOrder((o) => [...o.filter((k) => k !== key), key]);
  };
  const used = order.filter((key) => Number.isFinite(parseInput(f[key]))).slice(-2);
  const res = used.length === 2 ? powerTriangle(Object.fromEntries(used.map((key) => [key, parseInput(f[key])]))) : null;
  return (
    <Card className="cv-card">
      <h3 className="cv-h">Power triangle</h3>
      <p className="cv-note">Fill any two; the two you edited last are used.</p>
      <div className="cv-grid">
        <Num label="Real power" unit="kW" value={f.kw} onChange={set('kw')} />
        <Num label="Apparent power" unit="kVA" value={f.kva} onChange={set('kva')} />
        <Num label="Reactive power" unit="kVAR" value={f.kvar} onChange={set('kvar')} />
        <Num label="Power factor" value={f.pf} onChange={set('pf')} />
      </div>
      <div className="cv-outs">
        {res ? (
          <>
            <Out label="Real power" value={res.kw} unit="kW" />
            <Out label="Apparent power" value={res.kva} unit="kVA" />
            <Out label="Reactive power" value={res.kvar} unit="kVAR" />
            <Out label="Power factor" value={res.pf} unit="" digits={3} />
          </>
        ) : <p className="cv-note">Enter two values that fit together (kW can’t exceed kVA).</p>}
      </div>
    </Card>
  );
}

function DropCalc() {
  const [phase, setPhase] = useState(3);
  const [volts, setVolts] = useState('400');
  const [amps, setAmps] = useState('32');
  const [length, setLength] = useState('50');
  const [area, setArea] = useState('10');
  const [material, setMaterial] = useState('copper');
  const d = voltageDrop({
    phase, amps: parseInput(amps), length: parseInput(length), area: parseInput(area), material, volts: parseInput(volts),
  });
  return (
    <Card className="cv-card">
      <h3 className="cv-h">Voltage drop</h3>
      <PhasePick phase={phase} setPhase={setPhase} volts={volts} setVolts={setVolts} />
      <div className="cv-grid">
        <Num label="Voltage" unit="V" value={volts} onChange={setVolts} />
        <Num label="Current" unit="A" value={amps} onChange={setAmps} />
        <Num label="Cable length (one way)" unit="m" value={length} onChange={setLength} />
        <Num label="Conductor size" unit="mm²" value={area} onChange={setArea} />
      </div>
      <Field label="Conductor">
        <Select value={material} onChange={(e) => setMaterial(e.target.value)}>
          {Object.keys(RESISTIVITY).map((m) => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}
        </Select>
      </Field>
      <div className="cv-outs">
        <Out label="Voltage drop" value={d.volts} unit="V" digits={2} />
        <Out label="Of supply" value={d.percent} unit="%" digits={2} />
      </div>
      <p className="cv-note">Resistive only, at about 70 °C — a quick check, not a design calculation.</p>
    </Card>
  );
}

function BatteryCalc() {
  const [ah, setAh] = useState('100');
  const [volts, setVolts] = useState('12');
  const wh = ahToWh(parseInput(ah), parseInput(volts));
  return (
    <Card className="cv-card">
      <h3 className="cv-h">Battery Ah ↔ Wh</h3>
      <div className="cv-grid">
        <Num label="Capacity" unit="Ah" value={ah} onChange={setAh} />
        <Num label="Voltage" unit="V" value={volts} onChange={setVolts} />
      </div>
      <div className="cv-outs">
        <Out label="Energy" value={wh} unit="Wh" />
        <Out label="Energy" value={wh / 1000} unit="kWh" />
        <Out label="From Wh back to Ah" value={whToAh(wh, parseInput(volts))} unit="Ah" />
      </div>
    </Card>
  );
}

function ElectricalPanel({ prefs, setPrefs }) {
  return (
    <>
      <p className="cv-note cv-lead"><Zap size={13} /> Watts, kW, hp, BTU/h and kWh are under the <b>Power</b> and <b>Energy</b> tabs.</p>
      <AmpsCalc prefs={prefs} setPrefs={setPrefs} />
      <KvaCalc prefs={prefs} />
      <TriangleCalc />
      <DropCalc />
      <BatteryCalc />
    </>
  );
}

/* -------------------------------- screen -------------------------------- */

function ConverterScreen() {
  const [prefs, setPrefs] = usePrefs();
  const tab = TABS.some((t) => t.id === prefs.tab) ? prefs.tab : 'currency';
  const cat = categoryById(tab);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title serif">Converter</h1>
          <p className="page-sub">Type a number, see it in everything.</p>
        </div>
      </div>
      <div className="cv-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id} role="tab" aria-selected={tab === t.id} type="button"
            className={`cv-tab${tab === t.id ? ' is-on' : ''}`} onClick={() => setPrefs({ tab: t.id })}
          >{t.label}</button>
        ))}
      </div>
      <SectionLabel>{TABS.find((t) => t.id === tab)?.label}</SectionLabel>
      {tab === 'currency' && <CurrencyPanel prefs={prefs} setPrefs={setPrefs} />}
      {cat && <UnitPanel key={cat.id} cat={cat} prefs={prefs} setPrefs={setPrefs} />}
      {tab === 'electrical' && <ElectricalPanel prefs={prefs} setPrefs={setPrefs} />}
    </div>
  );
}

export default {
  id: 'converter',
  title: 'Converter',
  icon: ArrowLeftRight,
  accent: 'var(--accent-converter)',
  tier: 'integrated',
  routes: [{ path: '/converter', element: <ConverterScreen /> }],
  renderRef: (record) => <span className="ref-chip">{record.title}</span>,
  search: (_ctx, q) => (q.length >= 2 && ['converter', 'currency', 'units', 'electrical'].some((w) => w.startsWith(q))
    ? [{ id: 'converter', title: 'Converter', sub: 'Currency, units, electrical', to: '/converter' }]
    : []),
  quickActions: [{ id: 'open-converter', label: 'Converter', icon: ArrowLeftRight, to: '/converter' }],
};
