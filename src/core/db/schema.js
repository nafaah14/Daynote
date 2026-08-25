import { ulid } from 'ulid';

export const newId = () => `rec_${ulid()}`;

export const CURRENT_SCHEMA = 1;

/**
 * The envelope. Every record in the app wears this shape, whatever module
 * owns it. `data` is deliberately loose so modules can grow fields for years
 * without a migration.
 */
export function makeRecord(type, fields = {}) {
  const now = new Date().toISOString();
  return {
    id: newId(),
    type,                       // namespaced: 'module.entity'
    title: '',                  // every record has a human label
    createdAt: now,
    updatedAt: now,
    deletedAt: null,            // always soft delete
    dueAt: null,                // top-level so the day agenda is one query
    doneAt: null,
    home: 'auto',               // auto (follow the rule) | pinned (always) | hidden (never)
    tags: [],
    links: [],                  // [{ rel, id }]
    notes: '',
    schemaVersion: CURRENT_SCHEMA,
    data: {},
    ...fields,
  };
}

/**
 * Lazy migration on read. Each module can register its own upgrade steps;
 * this is the escape hatch for when you change your mind about a shape.
 */
const migrations = {};

export function registerMigration(type, fromVersion, fn) {
  (migrations[type] ||= {})[fromVersion] = fn;
}

export function migrate(record) {
  let r = record;
  const steps = migrations[r.type];
  while (steps && r.schemaVersion < CURRENT_SCHEMA && steps[r.schemaVersion]) {
    r = { ...steps[r.schemaVersion](r), schemaVersion: r.schemaVersion + 1 };
  }
  return r.schemaVersion === CURRENT_SCHEMA ? r : { ...r, schemaVersion: CURRENT_SCHEMA };
}
