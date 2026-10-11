const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const fixture = name => fs.readFileSync(path.join(root, 'build/memory', name));
const runtime = fs.readFileSync(path.join(root, 'BO1Mobile/MemoryPatch.js'), 'utf8');
const recipe = JSON.parse(fs.readFileSync(path.join(root, 'memory/recipe.json')));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const URL_ENGINE = 'https://bo1.znoam.eu/bo1z/artifacts/KisakBlack-web.wasm';

function browser(bytes = fixture('KisakBlack-web.wasm'), origin = 'https://bo1.znoam.eu') {
  const messages = [], calls = [];
  const context = {location: {origin, href: origin+'/bo1z/kino-mobile-20261011.html'},
    URL, Response, Headers, Uint8Array, WebAssembly, crypto: crypto.webcrypto,
    console: {log(){},error(){}}, fetch: async (...args) => {
      calls.push(args); return new Response(bytes, {headers: {'Content-Type':'application/wasm','Content-Encoding':'br','ETag':'old'}});
    }};
  context.window = context; context.top = context;
  context.webkit = {messageHandlers:{bo1:{postMessage:m=>messages.push(m)}}};
  const original = context.fetch;
  vm.runInNewContext(runtime, context);
  return {context, messages, calls, original};
}

test('production fetch patch produces the verified module, with unchanged ABI', async () => {
  const h = browser();
  const response = await h.context.fetch(URL_ENGINE);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(sha(bytes), recipe.patchedSha256);
  assert.equal(bytes.byteLength, recipe.patchedBytes);
  assert.equal(response.headers.get('Content-Encoding'), null);
  assert.equal(response.headers.get('ETag'), null);
  const [old,patched] = await Promise.all([WebAssembly.compile(fixture('KisakBlack-web.wasm')),WebAssembly.compile(bytes)]);
  assert.deepEqual(WebAssembly.Module.imports(patched),WebAssembly.Module.imports(old));
  assert.deepEqual(WebAssembly.Module.exports(patched),WebAssembly.Module.exports(old));
  assert.equal(h.context.__bo1MemoryPatch.state,'applied');
});

test('rejects modified engines on every attempt instead of falling back unpatched', async () => {
  const bytes = Uint8Array.from(fixture('KisakBlack-web.wasm'));bytes[500000]^=1;
  const h = browser(bytes);
  await assert.rejects(h.context.fetch(URL_ENGINE),/Version du moteur inconnue/);
  await assert.rejects(h.context.fetch(URL_ENGINE),/Version du moteur inconnue/);
  assert.equal(h.context.__bo1MemoryPatch.state,'failed');
});

test('accepts a server already serving the exact patch and does not double patch',async()=>{
  const h=browser(fixture('patched.wasm'));
  assert.equal(sha(new Uint8Array(await (await h.context.fetch(URL_ENGINE)).arrayBuffer())),recipe.patchedSha256);
  const first=h.context.fetch;vm.runInNewContext(runtime,h.context);assert.equal(h.context.fetch,first);
});

test('leaves other requests and other origins untouched',async()=>{
  const h=browser(new Uint8Array([1,2,3]));
  const options={cache:'no-store'};
  assert.deepEqual(Array.from(new Uint8Array(await (await h.context.fetch('/bo1z/maps.js',options)).arrayBuffer())),[1,2,3]);
  assert.equal(h.calls[0][1],options);assert.equal(h.context.__bo1MemoryPatch.state,'installed');
  const other=browser(new Uint8Array(),'https://example.com');assert.equal(other.context.fetch,other.original);
});

async function allocator() {
  const module=await WebAssembly.compile(fixture('patched-test.wasm'));
  const memory=new WebAssembly.Memory({initial:32767,maximum:32767,shared:true});
  const imports={};
  for(const x of WebAssembly.Module.imports(module)) {
    imports[x.module]??={};
    imports[x.module][x.name]=x.kind==='memory'?memory:(...args)=>{
      if(/abort|assert|resize_heap/.test(x.name))throw new Error(x.name+' '+args);
      if(x.name==='emscripten_get_heap_max')return memory.buffer.byteLength;
      if(x.name==='emscripten_get_now')return performance.now();
      if(x.name==='emscripten_date_now')return Date.now();
      return 0;
    };
  }
  const {exports:e}=await WebAssembly.instantiate(module,imports);
  e.__wasm_init_memory();e.__wasm_call_ctors();
  return {e,heap:new Uint8Array(memory.buffer)};
}

test('real VirtualAlloc keeps zero-on-commit, repeated commits and decommit/recommit semantics',async()=>{
  const {e,heap}=await allocator();
  const ptr=e.VirtualAlloc(0,8*1024*1024,0x2000);assert.ok(ptr);
  assert.equal(e.VirtualAlloc(ptr,4096,0x1000),ptr);
  assert.ok(heap.subarray(ptr,ptr+4096).every(x=>x===0));
  heap.fill(0xa5,ptr,ptr+4096);
  assert.equal(e.VirtualAlloc(ptr+5,10,0x1000),ptr);
  assert.ok(heap.subarray(ptr,ptr+4096).every(x=>x===0xa5));
  assert.equal(e.VirtualAlloc(ptr+4096,4096,0x1000),ptr+4096);
  assert.ok(heap.subarray(ptr+4096,ptr+8192).every(x=>x===0));
  assert.ok(heap.subarray(ptr,ptr+4096).every(x=>x===0xa5));
  e.VirtualFree(ptr,4096,0x4000);
  e.VirtualAlloc(ptr,4096,0x1000);
  assert.ok(heap.subarray(ptr,ptr+4096).every(x=>x===0));
  e.VirtualFree(ptr,0,0x8000);
  const direct=e.VirtualAlloc(0,65536,0x3000);assert.ok(direct);
  assert.ok(heap.subarray(direct,direct+65536).every(x=>x===0));
  e.VirtualFree(direct,0,0x8000);
});

for(const init of ['explicit','inline']) test('real PMem '+init+' init preserves aligned low/high allocations and existing data',async()=>{
  const {e,heap}=await allocator();
  if(init==='explicit')e['PMem_Init()']();
  const alloc=e['_PMem_AllocNamed(unsigned int, unsigned int, int, unsigned int, char const*, EMemTrack)'];
  const records=[];
  for(let i=0;i<160;i++) {
    const size=1+((i*719)%12000),align=2**(4+i%4),high=i%2;
    const ptr=alloc(size,align,high);assert.ok(ptr);assert.equal(ptr%align,0);
    assert.ok(heap.subarray(ptr,ptr+size).every(x=>x===0));
    const byte=1+i%250;heap.fill(byte,ptr,ptr+size);records.push({ptr,size,byte});
  }
  for(const {ptr,size,byte} of records)assert.ok(heap.subarray(ptr,ptr+size).every(x=>x===byte));
  assert.equal(e.KB_VirtualMemoryStats(0),343932928);
});
