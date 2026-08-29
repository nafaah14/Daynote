import { useState, useEffect } from 'react';
import { Input } from '../../../core/ui/components';
import { fromHHMM, toHHMM } from '../lib/overtimeEngine';

/**
 * An h:mm minutes editor for approval entries.
 *
 * A naive version binds the input's `value` straight to
 * `toHHMM(minutesFor(it))` and re-parses on every keystroke — but
 * `fromHHMM` treats a bare number as literal minutes, so mid-type states
 * like "2" round-trip through toHHMM as "0:02" and the input rewrites
 * itself out from under the user's cursor. This keeps its own text while
 * focused and only parses/commits on blur (or Enter), so typing "2:15"
 * lands as 2:15 instead of getting mangled into "0:00" along the way.
 */
export function HHMMField({ minutes, onCommit, ...rest }) {
  const [text, setText] = useState(() => toHHMM(minutes));
  useEffect(() => { setText(toHHMM(minutes)); }, [minutes]);

  const commit = () => {
    const parsed = fromHHMM(text);
    onCommit(parsed);
    setText(toHHMM(parsed));
  };

  return (
    <Input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      {...rest}
    />
  );
}
