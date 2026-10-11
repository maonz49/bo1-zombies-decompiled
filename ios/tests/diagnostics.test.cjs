const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../BO1Mobile/Diagnostics.js'), 'utf8');
function run(origin='https://bo1.znoam.eu') {
  const messages=[], intervals=[], events={};
  const context={location:{origin,href:origin+'/bo1z/kino-mobile-20261011.html'}, navigator:{storage:{getDirectory(){}},userAgent:'test'},crossOriginIsolated:true,SharedArrayBuffer,OffscreenCanvas:function(){},WebAssembly:{Suspending(){},promising(){}},console:{log(){},warn(){},error(){}},setInterval:f=>intervals.push(f),addEventListener:(e,f)=>events[e]=f};
  context.window=context; context.top=context;
  context.webkit={messageHandlers:{bo1:{postMessage:m=>messages.push(m)}}};
  vm.runInNewContext(source,context);
  return {context,messages,intervals,events};
}
test('reports capabilities and leaves console functioning',()=>{
  const h=run(); assert.equal(h.messages[0].jspi,true); assert.equal(h.messages[0].isolated,true);
  h.context.console.error('engine aborted');h.intervals[0]();
  assert.match(h.messages[1].lines[0],/engine aborted/);
});
test('bounds log queues and text during engine floods',()=>{
  const h=run();for(let i=0;i<10000;i++)h.context.console.log(i,'x'.repeat(10000));
  h.intervals[0](); const m=h.messages[1];
  assert.equal(m.lines.length,40);assert.equal(m.dropped,9960);assert.ok(m.lines.every(l=>l.length<620));
});
test('ignores other origins',()=>{const h=run('https://example.com');assert.equal(h.messages.length,0);assert.equal(h.intervals.length,0);});
test('handles undefined and circular console arguments without breaking the game',()=>{
  const h=run(), circular={};circular.self=circular;
  assert.doesNotThrow(()=>h.context.console.log(undefined,circular));h.intervals[0]();assert.equal(h.messages[1].lines.length,1);
});
test('flushes errors immediately and avoids duplicate injection',()=>{
  const h=run();h.events.error({message:'failure'});assert.match(h.messages[1].lines[0],/failure/);
  vm.runInNewContext(source,h.context);assert.equal(h.intervals.length,1);
});
test('reports small engine counters without walking or serializing the heap',()=>{
  const h=run();
  h.context.five={load:{stage:'world'},engine:{telemetryMemory:()=>({wasmBytes:2147418112,enginePMemUsed:1234,extra:new Uint8Array(1000),audioCachedPCMBytes:NaN}),memorySnapshot:()=>{throw new Error('must not walk heap');}}};
  h.intervals[0]();const m=h.messages.find(m=>m.type==='memory');
  assert.equal(m.stage,'world');assert.equal(m.enginePMemUsed,1234);assert.equal(m.extra,undefined);assert.equal(m.audioCachedPCMBytes,undefined);
});
