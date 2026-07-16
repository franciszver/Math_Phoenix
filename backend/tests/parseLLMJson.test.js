import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLLMJson } from '../src/utils/parseLLMJson.js';

test('parses plain JSON object', () => {
  const result = parseLLMJson('{"a": 1}');
  assert.deepEqual(result, { a: 1 });
});

test('parses plain JSON array', () => {
  const result = parseLLMJson('[1, 2, 3]');
  assert.deepEqual(result, [1, 2, 3]);
});

test('strips ```json fences', () => {
  const result = parseLLMJson('```json\n{"a": 1}\n```');
  assert.deepEqual(result, { a: 1 });
});

test('strips bare ``` fences', () => {
  const result = parseLLMJson('```\n{"a": 1}\n```');
  assert.deepEqual(result, { a: 1 });
});

test('tolerates surrounding whitespace', () => {
  const result = parseLLMJson('   {"a": 1}   ');
  assert.deepEqual(result, { a: 1 });
});

test('tolerates surrounding whitespace with fences', () => {
  const result = parseLLMJson('  ```json\n{"a": 1}\n```  ');
  assert.deepEqual(result, { a: 1 });
});

test('throws on unparseable input', () => {
  assert.throws(() => parseLLMJson('not json at all'));
});

test('throws on text surrounding fenced JSON (matches existing inline behavior)', () => {
  assert.throws(() => parseLLMJson('Here is the JSON:\n```json\n{"a": 1}\n```'));
});
