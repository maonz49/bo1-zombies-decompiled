import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { BUILDS } from '../extension/src/layout.js';
import { inspectWasm, patchEngine, sha256Hex } from '../extension/src/patch.js';

const file = process.env.BO1Z_MEMORY_ENGINE_WASM;
const read = (bytes, offset) => {
  let value = 0, shift = 0, byte;
  do { byte = bytes[offset++]; value |= (byte & 127) << shift; shift += 7; } while (byte & 128);
  return [value >>> 0, offset];
};
function bodies(bytes) {
  const info = inspectWasm(bytes);
  let [count, offset] = read(bytes, info.sections.find(s => s.id === 10).body);
  const result = new Map();
  for (let i = 0; i < count; i++) {
    const [length, body] = read(bytes, offset);
    result.set(i + info.importedFunctions, bytes.subarray(body, body + length));
    offset = body + length;
  }
  return result;
}

test('iOS 0.2 memory patch composes with co-op without changing allocator code, data or ABI', { skip: !file }, async () => {
  const before = new Uint8Array(fs.readFileSync(file));
  const hash = await sha256Hex(before);
  assert.equal(hash, '36024c2655e29a3eb97b64c20e3b9270cd610943c70c18ed470bcd8789a6ff01');
  assert.ok(BUILDS[hash]);
  const after = patchEngine(before, hash);
  const [a, b] = await Promise.all([WebAssembly.compile(before), WebAssembly.compile(after)]);
  assert.deepEqual(WebAssembly.Module.imports(b), WebAssembly.Module.imports(a));
  assert.deepEqual(WebAssembly.Module.exports(b), WebAssembly.Module.exports(a));
  const oldBodies = bodies(before), newBodies = bodies(after);
  for (const index of [1949, 5757, 1231]) assert.deepEqual(newBodies.get(index), oldBodies.get(index));
  const oldSections = inspectWasm(before).sections.filter(s => s.id !== 10);
  const newSections = inspectWasm(after).sections.filter(s => s.id !== 10);
  assert.equal(oldSections.length, newSections.length);
  oldSections.forEach((section, i) => {
    assert.equal(section.id, newSections[i].id);
    assert.deepEqual(after.subarray(newSections[i].body, newSections[i].end), before.subarray(section.body, section.end));
  });
});
