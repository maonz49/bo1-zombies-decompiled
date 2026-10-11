import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const file = new URL('../../site/bo1z/artifacts/KisakBlack-web.mobile-start-20261011-1.mjs', import.meta.url);
const source = await fs.readFile(file, 'utf8');
// Use the delivered runtime's actual PThread implementation. Native loading
// is stubbed only to avoid treating Node as a WebGL browser in this test.
const start = source.indexOf('var PThread={');
const end = source.indexOf(';var onPostRuns=[]', start);
assert.ok(start > 0 && end > start);
async function pool(size) {
  const workers = [], preRun = [];
  const context = vm.createContext({ Module: { kisakPthreadPoolSize: size }, ENVIRONMENT_IS_PTHREAD: false,
    URL, addOnPreRun: fn => preRun.push(fn),
    Worker: class { constructor(url, options) { this.url = url.href; this.options = options; workers.push(this); } },
  });
  const module = new vm.SourceTextModule(source.slice(start, end) + ';export {PThread};', {
    context, initializeImportMeta(meta) { meta.url = 'https://bo1.znoam.eu/bo1z/artifacts/KisakBlack-web.mobile-start-20261011-1.mjs'; },
  });
  await module.link(() => { throw Error('unexpected dependency'); }); await module.evaluate();
  const thread = module.namespace.PThread;
  thread.init();
  thread.loadWasmModuleToWorker = worker => { worker.loadRequested = true; return Promise.resolve(worker); };
  return { workers, thread, preRun };
}

test('mobile runtime preallocates eight workers using its matching versioned script', async () => {
  const h = await pool(8);
  assert.equal(h.workers.length, 8);
  for (const worker of h.workers) assert.equal(worker.url, 'https://bo1.znoam.eu/bo1z/artifacts/KisakBlack-web.mobile-start-20261011-1.mjs');
  for (let i = 0; i < 8; ++i) assert.ok(h.thread.getNewWorker());
  const extra = h.thread.getNewWorker();
  assert.equal(h.workers.length, 9);
  assert.equal(extra.loadRequested, true, 'the pool size does not prohibit an extra required native thread');
});

test('runtime preserves its original default pool if no mobile size is supplied', async () => {
  assert.equal((await pool(undefined)).workers.length, 16);
});
