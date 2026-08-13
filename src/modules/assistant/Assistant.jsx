import { useState, useRef, useEffect } from 'react';
import { Sparkles, Mic, Send, X, Loader2 } from 'lucide-react';
import { useRepo } from '../../core/db/repo';
import { useBackClose } from '../../core/ui/components';
import { buildContext } from './context';
import { runToolCall, describeToolResult } from './actions';
import './assistant.css';

// Not every browser ships the Web Speech API (notably Firefox and desktop
// Safari) — the mic button simply doesn't render there rather than showing
// a control that would fail on tap.
const SpeechRecognitionCtor = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

let _lineSeq = 0;
const nextLineId = () => `assistant-line-${++_lineSeq}`;

const PROMPTS = [
  'remind me to renew my passport next Tuesday',
  'add milk to Shopping',
  "what's due this week?",
];

function AssistantOverlay({ onClose }) {
  const repo = useRepo();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [log, setLog] = useState([]);
  const recognitionRef = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Plain overlay + useBackClose, not <Sheet> — Sheet's own history timing
  // races against a second nested push here and intermittently eats the
  // back-button close. Same reasoning as the note editor and search overlay.
  useBackClose(onClose);

  useEffect(() => {
    inputRef.current?.focus();
    return () => { try { recognitionRef.current?.stop(); } catch { /* already stopped */ } };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log, busy]);

  const appendLine = (role, body) => setLog((l) => [...l, { id: nextLineId(), role, body }]);

  const toggleListening = () => {
    if (!SpeechRecognitionCtor) return;
    if (listening) { recognitionRef.current?.stop(); return; }
    const rec = new SpeechRecognitionCtor();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    // Fills the field only — never submits on its own, so a mis-transcription
    // can be corrected before it's sent.
    rec.onresult = (e) => {
      let transcript = '';
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      setText(transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };

  const submit = async (e) => {
    e.preventDefault();
    const message = text.trim();
    if (!message || busy) return;
    if (listening) recognitionRef.current?.stop();

    appendLine('user', message);
    setText('');
    setBusy(true);
    try {
      const res = await fetch('/.netlify/functions/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, context: buildContext(repo) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'The assistant is unavailable right now.');

      const blocks = data?.content || [];
      if (!blocks.length) appendLine('assistant', "I didn't get anything back for that.");

      // Each tool call writes immediately — no confirm step, matching how
      // every other module in the app saves (reminders, notes, list items
      // all commit on the spot). A failed write shows as its own error line
      // rather than losing the rest of a multi-block reply.
      for (const block of blocks) {
        if (block.type === 'tool_use') {
          try {
            const record = runToolCall(repo, block);
            appendLine('assistant', describeToolResult(repo, block, record));
          } catch (err) {
            appendLine('error', err.message || "Couldn't complete that.");
          }
        } else if (block.type === 'text' && block.text) {
          appendLine('assistant', block.text);
        }
      }
    } catch (err) {
      appendLine('error', err.message || 'Something went wrong reaching the assistant.');
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="assistant-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="assistant-panel" role="dialog" aria-modal="true" aria-label="Ask Daybook">
        <div className="sheet-head">
          <h2 className="sheet-title serif">Ask Daybook</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="assistant-log" ref={scrollRef}>
          {log.length === 0 && (
            <div className="assistant-empty">
              <p>Type or speak a command — a reminder, a note, something for a list — or ask what's coming up.</p>
              <ul className="assistant-prompts">
                {PROMPTS.map((p) => (
                  <li key={p}>
                    <button type="button" onClick={() => setText(p)}>“{p}”</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {log.map((line) => (
            <p key={line.id} className={`assistant-line assistant-line-${line.role}`}>{line.body}</p>
          ))}
          {busy && (
            <p className="assistant-line assistant-line-assistant assistant-line-busy">
              <Loader2 size={14} className="spin" /> Thinking…
            </p>
          )}
        </div>

        <form className="assistant-input-row" onSubmit={submit}>
          <input
            ref={inputRef}
            className="input assistant-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask or tell Daybook something…"
            aria-label="Message"
            autoComplete="off"
          />
          {SpeechRecognitionCtor && (
            <button
              type="button"
              className={`icon-btn assistant-mic ${listening ? 'is-listening' : ''}`}
              onClick={toggleListening}
              aria-label={listening ? 'Stop voice input' : 'Start voice input'}
              aria-pressed={listening}
            >
              <Mic size={18} />
            </button>
          )}
          <button
            type="submit"
            className="icon-btn assistant-send"
            disabled={!text.trim() || busy}
            aria-label="Send"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * The flagship entry point: a raised button proud of the centre of the
 * bottom nav. It lives outside AppShell on purpose — core/shell never
 * imports from modules (see registry.js's rule), and this needs actions.js's
 * module-specific knowledge to do anything useful. App.jsx renders it as a
 * sibling of AppShell instead; being fixed-positioned, it doesn't need to be
 * a DOM child of the tab bar to visually sit on top of it.
 */
export default function AssistantLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="assistant-launcher">
        <button
          type="button"
          className="assistant-launcher-btn"
          onClick={() => setOpen(true)}
          aria-label="Ask Daybook"
          title="Ask Daybook"
        >
          <Sparkles size={24} strokeWidth={2} />
        </button>
      </div>
      {open && <AssistantOverlay onClose={() => setOpen(false)} />}
    </>
  );
}
