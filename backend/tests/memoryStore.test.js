import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/services/memoryStore.js';

test('get on missing key returns null', () => {
  const store = createStore();
  assert.equal(store.get('missing'), null);
});

test('put/get roundtrip deep-equals', () => {
  const store = createStore();
  const item = { id: 1, nested: { a: [1, 2, 3] } };
  store.put('key1', item);
  assert.deepEqual(store.get('key1'), item);
});

test('mutating source object after put does not affect stored copy', () => {
  const store = createStore();
  const item = { session: { problems: [{ steps: ['a', 'b'] }] } };
  store.put('key1', item);
  item.session.problems[0].steps.push('c');
  item.session.problems[0].newProp = 'x';
  const stored = store.get('key1');
  assert.deepEqual(stored, { session: { problems: [{ steps: ['a', 'b'] }] } });
});

test('mutating object returned by get does not affect store', () => {
  const store = createStore();
  const item = { session: { problems: [{ steps: ['a', 'b'] }] } };
  store.put('key1', item);
  const gotten = store.get('key1');
  gotten.session.problems[0].steps.push('c');
  gotten.session.extra = true;
  assert.deepEqual(store.get('key1'), { session: { problems: [{ steps: ['a', 'b'] }] } });
});

test('mutating object returned by scanAll does not affect store', () => {
  const store = createStore();
  const item = { problems: [{ steps: ['a'] }] };
  store.put('key1', item);
  const [got] = store.scanAll();
  got.problems[0].steps.push('z');
  assert.deepEqual(store.get('key1'), { problems: [{ steps: ['a'] }] });
});

test('mutating object returned by merge does not affect store', () => {
  const store = createStore();
  store.put('key1', { problems: [{ steps: ['a'] }] });
  const merged = store.merge('key1', { extra: true });
  merged.problems[0].steps.push('z');
  merged.extra = false;
  assert.deepEqual(store.get('key1'), { problems: [{ steps: ['a'] }], extra: true });
});

test('merge onto existing item overwrites top-level keys and preserves others', () => {
  const store = createStore();
  store.put('key1', { a: 1, b: 2, nested: { x: 1 } });
  const result = store.merge('key1', { b: 20, c: 3 });
  const expected = { a: 1, b: 20, nested: { x: 1 }, c: 3 };
  assert.deepEqual(result, expected);
  assert.deepEqual(store.get('key1'), expected);
});

test('merge onto missing key creates the item', () => {
  const store = createStore();
  const result = store.merge('newKey', { a: 1 });
  assert.deepEqual(result, { a: 1 });
  assert.deepEqual(store.get('newKey'), { a: 1 });
});

test('delete removes item, get returns null afterward', () => {
  const store = createStore();
  store.put('key1', { a: 1 });
  store.delete('key1');
  assert.equal(store.get('key1'), null);
});

test('scanAll returns all values; empty store returns []', () => {
  const store = createStore();
  assert.deepEqual(store.scanAll(), []);
  store.put('key1', { a: 1 });
  store.put('key2', { b: 2 });
  const all = store.scanAll();
  assert.equal(all.length, 2);
  assert.deepEqual(
    all.sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y))),
    [{ a: 1 }, { b: 2 }]
  );
});

test('keys are independent', () => {
  const store = createStore();
  store.put('key1', { a: 1 });
  store.put('key2', { b: 2 });
  store.merge('key1', { a: 100 });
  store.delete('key2');
  assert.deepEqual(store.get('key1'), { a: 100 });
  assert.equal(store.get('key2'), null);
});
