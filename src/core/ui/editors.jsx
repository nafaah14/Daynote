import { createContext, useContext, useState, useCallback } from 'react';

/**
 * A small registry so any screen can open any module's editor by record,
 * without importing that module's Sheet directly.
 *
 * Dashboard needs to open a reminder's editor, a note's editor, a list —
 * but Dashboard importing each module's Sheet would breach the rule that
 * keeps the home screen ignorant of module internals. Instead each module
 * registers an editor keyed by record type, and Dashboard just says "edit
 * this record." The module it belongs to handles the rest.
 *
 * Editors are looked up by the record's `type` prefix (e.g. 'reminders.task'
 * → the 'reminders' editor), matching how the rest of the shell resolves a
 * record to its module.
 */
const EditorCtx = createContext(null);

export function EditorHost({ children }) {
  // registry: { [moduleId]: (record|null, close) => ReactNode }
  const [registry] = useState(() => new Map());
  const [active, setActive] = useState(null); // { moduleId, record }

  const register = useCallback((moduleId, renderEditor) => {
    registry.set(moduleId, renderEditor);
    return () => registry.delete(moduleId);
  }, [registry]);

  /** Open an editor for an existing record (resolved by its type prefix). */
  const openForRecord = useCallback((record) => {
    if (!record?.type) return;
    const moduleId = record.type.split('.')[0];
    if (registry.has(moduleId)) setActive({ moduleId, record });
  }, [registry]);

  /** Open a blank editor for a given module id. */
  const openNew = useCallback((moduleId) => {
    if (registry.has(moduleId)) setActive({ moduleId, record: null });
  }, [registry]);

  const close = useCallback(() => setActive(null), []);

  const api = { register, openForRecord, openNew, close };
  const renderActive = active && registry.get(active.moduleId);

  return (
    <EditorCtx.Provider value={api}>
      {children}
      {renderActive ? renderActive(active.record, close) : null}
    </EditorCtx.Provider>
  );
}

export const useEditors = () => {
  const ctx = useContext(EditorCtx);
  if (!ctx) throw new Error('useEditors must be used inside EditorHost');
  return ctx;
};
