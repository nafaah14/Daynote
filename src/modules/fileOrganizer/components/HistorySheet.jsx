import { Trash2, ExternalLink } from 'lucide-react';
import { Sheet, Row, Button } from '../../../core/ui/components';
import { ancestorChain, fmtDate } from '../lib/helpers';

export default function HistorySheet({ open, onClose, fileId, files, onOpenLink, onDeleteEntry }) {
  if (!open) return null;
  const current = files.find((f) => f.id === fileId);
  if (!current) return null;
  const chain = ancestorChain(files, fileId);

  return (
    <Sheet open={open} onClose={onClose} title="Revision history" footer={<Button onClick={onClose}>Close</Button>}>
      <p className="field-hint">
        {current.displayName}{current.revision ? ` · ${current.revision}` : ''} is current.
      </p>
      {chain.length === 0 ? (
        <p className="field-hint">No earlier revisions.</p>
      ) : (
        <div className="ruled">
          {chain.map((old) => (
            <Row
              key={old.id}
              title={old.displayName + (old.revision ? ` · ${old.revision}` : '')}
              meta={fmtDate(old.createdAt)}
              right={
                <span className="fo-row-actions">
                  <button className="icon-btn" title="Open" onClick={() => onOpenLink(old.url)}><ExternalLink size={14} /></button>
                  <button className="icon-btn danger" title="Delete permanently" onClick={() => onDeleteEntry(old.id)}>
                    <Trash2 size={14} />
                  </button>
                </span>
              }
            />
          ))}
        </div>
      )}
    </Sheet>
  );
}
