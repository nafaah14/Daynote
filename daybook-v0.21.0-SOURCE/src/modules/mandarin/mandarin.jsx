import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Languages, ArrowLeft, Volume2, Mic, Square, Check, RotateCcw,
  AlertCircle, ChevronRight,
} from 'lucide-react';
import { useRepo } from '../../core/db/repo';
import {
  Card, Row, SectionLabel, EmptyState, Button, Chip,
} from '../../core/ui/components';
import { SCENARIOS } from './scenarios';
import {
  listen, speak, stopSpeaking, recognitionSupported, secureEnough,
  speechSupported, errorMessage, strip,
} from './speech';
import './mandarin.css';

export const TYPE = 'mandarin.progress';

const scenarioById = (id) => SCENARIOS.find((s) => s.id === id);

/* ------------------------------ progress -------------------------------
   One record per scenario, so progress syncs with everything else. Its shape
   is entirely the module's business — the envelope's loose `data` blob was
   built for exactly this, which is why a spaced-repetition-ish app can live
   in here without bending the record format.
------------------------------------------------------------------------ */

function useProgress() {
  const repo = useRepo();
  const rows = repo.query({ type: TYPE });

  const recordFor = (sid) => rows.find((r) => r.data.scenario === sid) || null;

  const doneSet = (sid, stage) => {
    const rec = recordFor(sid);
    return new Set(rec?.data?.[stage] || []);
  };

  const markDone = (sid, stage, index) => {
    const rec = recordFor(sid);
    if (rec) {
      const done = new Set(rec.data[stage] || []);
      done.add(index);
      repo.update(rec.id, { data: { ...rec.data, [stage]: [...done] } });
    } else {
      repo.create(TYPE, {
        title: `Mandarin — ${scenarioById(sid)?.name || sid}`,
        home: 'hidden',
        data: { scenario: sid, words: [], lines: [], [stage]: [index] },
      });
    }
  };

  const reset = (sid) => {
    const rec = recordFor(sid);
    if (rec) repo.update(rec.id, { data: { ...rec.data, words: [], lines: [] } });
  };

  return { doneSet, markDone, reset };
}

const pct = (done, total) => (total ? Math.round((done / total) * 100) : 0);

/* -------------------------------- home ---------------------------------- */

export function MandarinHome() {
  const nav = useNavigate();
  const { doneSet } = useProgress();

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title serif">Mandarin</h1>
          <p className="page-sub">Say it out loud until it comes without thinking.</p>
        </div>
      </div>

      {!recognitionSupported() && (
        <Card>
          <div className="mand-warn">
            <AlertCircle size={16} />
            <span>Speaking practice needs Chrome or Edge. You can still read and listen here.</span>
          </div>
        </Card>
      )}
      {recognitionSupported() && !secureEnough() && (
        <Card>
          <div className="mand-warn">
            <AlertCircle size={16} />
            <span>The microphone needs HTTPS. It'll work on your deployed site.</span>
          </div>
        </Card>
      )}

      <SectionLabel>Scenarios</SectionLabel>
      <Card>
        <div className="ruled">
          {SCENARIOS.map((s) => {
            const words = doneSet(s.id, 'words').size;
            const lines = doneSet(s.id, 'lines').size;
            const total = s.convo.vocab.length + s.convo.lines.length;
            const done = words + lines;
            return (
              <Row
                key={s.id}
                lead={<span className="mand-icon">{s.icon}</span>}
                title={s.name}
                meta={
                  <>
                    <span className="mand-zh">{s.zh}</span>
                    <span className="mono" style={{ color: 'var(--muted)' }}>
                      {done}/{total}
                    </span>
                  </>
                }
                right={
                  done === total && total > 0
                    ? <Check size={16} style={{ color: 'var(--in)' }} />
                    : <ChevronRight size={15} />
                }
                onClick={() => nav(`/mandarin/${s.id}`)}
              >
                <span className="mand-bar" aria-hidden>
                  <span className="mand-bar-fill" style={{ width: `${pct(done, total)}%` }} />
                </span>
              </Row>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------ overview -------------------------------- */

export function ScenarioScreen() {
  const { sid } = useParams();
  const nav = useNavigate();
  const { doneSet, reset } = useProgress();
  const s = scenarioById(sid);

  useEffect(() => () => stopSpeaking(), []);

  if (!s) {
    return (
      <div className="page">
        <Card><EmptyState icon={Languages} title="Scenario not found" /></Card>
      </div>
    );
  }

  const wordsDone = doneSet(sid, 'words');
  const linesDone = doneSet(sid, 'lines');

  return (
    <div className="page">
      <button className="back" onClick={() => nav('/mandarin')}><ArrowLeft size={15} /> Mandarin</button>
      <div className="page-head">
        <div>
          <h1 className="page-title serif">{s.icon} {s.name}</h1>
          <p className="page-sub">{s.convo.title} · {s.convo.sub}</p>
        </div>
      </div>

      <SectionLabel right={<span className="mono count">{wordsDone.size}/{s.convo.vocab.length}</span>}>
        Words
      </SectionLabel>
      <Card>
        <div className="ruled">
          {s.convo.vocab.map((v, i) => (
            <div key={i} className="mand-item">
              <button className="mand-play" onClick={() => speak(v.w)} aria-label={`Play ${v.w}`}>
                <Volume2 size={15} />
              </button>
              <div className="mand-item-body" onClick={() => nav(`/mandarin/${sid}/words/${i}`)}>
                <span className="han">{v.w}</span>
                <span className="mand-pin">{v.p}</span>
                <span className="mand-en">{v.e}</span>
              </div>
              {wordsDone.has(i) && <Check size={15} className="mand-tick" />}
            </div>
          ))}
        </div>
      </Card>
      <Button variant="outline" size="sm" onClick={() => nav(`/mandarin/${sid}/words/0`)}>
        <Mic size={14} /> Practise words
      </Button>

      <SectionLabel right={<span className="mono count">{linesDone.size}/{s.convo.lines.length}</span>}>
        Conversation
      </SectionLabel>
      <Card>
        <div className="ruled">
          {s.convo.lines.map((l, i) => (
            <div key={i} className={`mand-item ${l.you ? 'is-you' : ''}`}>
              <button className="mand-play" onClick={() => speak(l.w)} aria-label={`Play line ${i + 1}`}>
                <Volume2 size={15} />
              </button>
              <div className="mand-item-body" onClick={() => l.you && nav(`/mandarin/${sid}/lines/${i}`)}>
                <span className="mand-who">{l.who}</span>
                <span className="han">{l.w}</span>
                <span className="mand-pin">{l.p}</span>
                <span className="mand-en">{l.e}</span>
              </div>
              {linesDone.has(i) && <Check size={15} className="mand-tick" />}
            </div>
          ))}
        </div>
      </Card>
      <div className="mand-actions">
        <Button variant="outline" size="sm" onClick={() => nav(`/mandarin/${sid}/lines/0`)}>
          <Mic size={14} /> Practise your lines
        </Button>
        <Button size="sm" variant="quiet" onClick={() => reset(sid)}>
          <RotateCcw size={13} /> Reset progress
        </Button>
      </div>
      <p className="settings-note">
        Only the lines marked <em>You</em> are drilled — the other half is your partner's.
      </p>
    </div>
  );
}

/* -------------------------------- drill --------------------------------- */

export function DrillScreen() {
  const { sid, stage, idx } = useParams();
  const nav = useNavigate();
  const { markDone } = useProgress();
  const s = scenarioById(sid);
  const stopRef = useRef(null);

  const [state, setState] = useState('idle');   // idle | listening
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const items = stage === 'words'
    ? s?.convo.vocab || []
    : (s?.convo.lines || []).map((l, i) => ({ ...l, _i: i })).filter((l) => l.you);

  const position = Number(idx) || 0;
  const item = items[position];

  const goTo = useCallback((n) => {
    setResult(null); setError(null);
    nav(`/mandarin/${sid}/${stage}/${n}`, { replace: true });
  }, [nav, sid, stage]);

  // Say the target when it appears — hearing it first is the point.
  useEffect(() => {
    if (!item) return;
    const t = setTimeout(() => speak(item.w), 300);
    return () => { clearTimeout(t); stopSpeaking(); };
  }, [item?.w]);

  useEffect(() => () => stopRef.current?.(), []);

  if (!s || !item) {
    return (
      <div className="page">
        <button className="back" onClick={() => nav(`/mandarin/${sid}`)}><ArrowLeft size={15} /> Back</button>
        <Card><EmptyState icon={Languages} title="Nothing to practise here" /></Card>
      </div>
    );
  }

  const record = () => {
    if (state === 'listening') { stopRef.current?.(); setState('idle'); return; }
    setResult(null); setError(null);
    stopRef.current = listen(item.w, {
      onStateChange: setState,
      onResult: (res) => {
        if (res.error) { setError(errorMessage(res.error)); setResult(null); return; }
        setResult(res);
        if (res.pass) {
          const realIndex = stage === 'words' ? position : item._i;
          markDone(sid, stage, realIndex);
          setTimeout(() => {
            if (position === items.length - 1) nav(`/mandarin/${sid}`);
            else goTo(position + 1);
          }, 1100);
        }
      },
    });
  };

  const chars = strip(item.w).split('');

  return (
    <div className="page">
      <button className="back" onClick={() => nav(`/mandarin/${sid}`)}>
        <ArrowLeft size={15} /> {s.name}
      </button>

      <div className="drill-progress">
        {items.map((_, i) => (
          <span key={i} className={`drill-dot ${i === position ? 'is-now' : ''} ${i < position ? 'is-past' : ''}`} />
        ))}
      </div>

      <Card className="drill-card">
        <span className="eyebrow">{stage === 'words' ? 'Say this word' : 'Say your line'}</span>

        <div className="drill-han">
          {chars.map((c, i) => (
            <span
              key={i}
              className={
                result ? (result.flags[i] ? 'char ok' : 'char miss') : 'char'
              }
            >
              {c}
            </span>
          ))}
        </div>

        <div className="drill-pin">{item.p}</div>
        <div className="drill-en">{item.e}</div>

        <div className="drill-controls">
          <Button variant="outline" onClick={() => speak(item.w)} disabled={!speechSupported()}>
            <Volume2 size={16} /> Listen
          </Button>
          <button
            className={`mic-btn ${state === 'listening' ? 'is-live' : ''}`}
            onClick={record}
            aria-label={state === 'listening' ? 'Stop listening' : 'Start speaking'}
          >
            {state === 'listening' ? <Square size={20} /> : <Mic size={22} />}
          </button>
          <Button variant="outline" onClick={() => speak(item.w, { rate: 0.6 })} disabled={!speechSupported()}>
            Slow
          </Button>
        </div>

        {state === 'listening' && <p className="drill-hint">Listening — say it now.</p>}

        {error && <p className="drill-msg bad"><AlertCircle size={14} /> {error}</p>}

        {result && !error && (
          <div className={`drill-msg ${result.pass ? 'good' : 'bad'}`}>
            {result.pass
              ? (position === items.length - 1 ? 'Correct — scenario complete.' : 'Correct. Next one.')
              : result.ratio >= 0.5
                ? 'Close. Listen again and match the marked characters.'
                : 'Not matched. Play it once more, then say it slowly.'}
            {result.heard && <span className="drill-heard">heard: {result.heard}</span>}
          </div>
        )}
      </Card>

      <div className="mand-actions">
        <Button size="sm" onClick={() => goTo(Math.max(0, position - 1))} disabled={position === 0}>
          Previous
        </Button>
        <Button size="sm" onClick={() => goTo(Math.min(items.length - 1, position + 1))}
          disabled={position === items.length - 1}>
          Skip
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------- manifest ------------------------------- */

export default {
  id: 'mandarin',
  title: 'Mandarin',
  icon: Languages,
  accent: 'var(--accent-mandarin)',
  tier: 'integrated',
  routes: [
    { path: '/mandarin', element: <MandarinHome /> },
    { path: '/mandarin/:sid', element: <ScenarioScreen /> },
    { path: '/mandarin/:sid/:stage/:idx', element: <DrillScreen /> },
  ],

  // Practice is something you choose to do, not something that falls due.
  today: () => [],

  renderRef: (record) => <span className="ref-chip">{record.title}</span>,

  search: (_ctx, q) =>
    SCENARIOS
      .filter((s) =>
        s.name.toLowerCase().includes(q)
        || s.zh.includes(q)
        || s.convo.vocab.some((v) => v.w.includes(q) || v.p.toLowerCase().includes(q) || v.e.toLowerCase().includes(q))
      )
      .map((s) => ({ id: `mand-${s.id}`, title: `${s.icon} ${s.name}`, sub: 'Mandarin', to: `/mandarin/${s.id}` })),

  quickActions: [{ id: 'practise', label: 'Practise Mandarin', icon: Languages, to: '/mandarin' }],
};
