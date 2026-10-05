import { useState } from 'react';
import { Chip, Input } from '../../../core/ui/components';

/** Type-to-create or pick-from-existing tag editor, used on the Add/Edit
 *  file sheet. Controlled: the parent owns the tag list. */
export default function TagEditor({ tags, onChange, existingTags }) {
  const [text, setText] = useState('');

  const addTag = (val) => {
    const t = val.trim();
    if (!t || tags.includes(t)) { setText(''); return; }
    onChange([...tags, t]);
    setText('');
  };
  const removeTag = (t) => onChange(tags.filter((x) => x !== t));

  const suggestions = existingTags.filter((t) => !tags.includes(t));

  return (
    <div className="fo-tag-editor">
      {tags.length > 0 && (
        <div className="fo-tag-chips">
          {tags.map((t) => (
            <span key={t} className="fo-tag-chip">
              {t}
              <button type="button" className="fo-tag-chip-x" onClick={() => removeTag(t)} aria-label={`Remove ${t}`}>×</button>
            </span>
          ))}
        </div>
      )}
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(text); }
          else if (e.key === 'Backspace' && !text && tags.length) removeTag(tags[tags.length - 1]);
        }}
        placeholder="Type a tag, press Enter"
      />
      {suggestions.length > 0 && (
        <div className="fo-tag-suggestions">
          {suggestions.map((t) => (
            <Chip key={t} tone="neutral" onClick={() => addTag(t)}>{t}</Chip>
          ))}
        </div>
      )}
    </div>
  );
}
