/**
 * In-memory Store
 * Map-backed replacement for DynamoDB in the demo app (data loss on restart is acceptable).
 * All reads/writes go through structuredClone so callers can freely mutate
 * what they get/put without aliasing the stored copy.
 */

export function createStore() {
  const data = new Map();

  return {
    get(key) {
      return data.has(key) ? structuredClone(data.get(key)) : null;
    },
    put(key, item) {
      data.set(key, structuredClone(item));
    },
    merge(key, updates) {
      const existing = data.has(key) ? data.get(key) : {};
      const merged = { ...existing, ...updates };
      data.set(key, structuredClone(merged));
      return structuredClone(merged);
    },
    delete(key) {
      data.delete(key);
    },
    scanAll() {
      return [...data.values()].map((item) => structuredClone(item));
    },
  };
}

export const sessionStore = createStore();
