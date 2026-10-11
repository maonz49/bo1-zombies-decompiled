from pathlib import Path
import json, hashlib

import argparse, urllib.request
PROJECT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--engine', type=Path)
parser.add_argument('--output', type=Path, default=PROJECT/'build/memory')
args = parser.parse_args()
ROOT = args.output.resolve()
ROOT.mkdir(parents=True, exist_ok=True)
BASE = args.engine or ROOT/'KisakBlack-web.wasm'
if not BASE.exists():
    BASE.write_bytes(urllib.request.urlopen('https://bo1.znoam.eu/bo1z/artifacts/KisakBlack-web.wasm', timeout=60).read())

def uleb(n):
    out = bytearray()
    while True:
        b = n & 127
        n >>= 7
        out.append(b | (128 if n else 0))
        if not n: return bytes(out)

def read(b, p):
    n = shift = 0
    while True:
        v = b[p]; p += 1
        n |= (v & 127) << shift
        if not v & 128: return n, p
        shift += 7
        if shift > 35: raise ValueError('invalid uleb')

def string(b, p):
    n, p = read(b, p)
    return b[p:p+n].decode(), p+n

def sections(b):
    p = 8
    out = []
    while p < len(b):
        head = p; kind = b[p]; size, p = read(b, p+1)
        out.append((kind, head, p, p+size)); p += size
    assert p == len(b)
    return out

def names(b):
    result = {}
    for kind, _, p, end in sections(b):
        if kind: continue
        name,p = string(b,p)
        if name != 'name': continue
        while p < end:
            sub = b[p]; size,p = read(b,p+1); stop=p+size
            if sub == 1:
                count,p=read(b,p)
                for _ in range(count):
                    idx,p=read(b,p);name,p=string(b,p);result[name]=idx
            p=stop
    return result

def exports(b, extra):
    ss=sections(b); _,head,start,end=next(s for s in ss if s[0]==7)
    count,p=read(b,start)
    body=uleb(count+len(extra))+b[p:end]
    for name,idx in extra.items():
        txt=name.encode();body+=uleb(len(txt))+txt+b'\0'+uleb(idx)
    return b[:head]+b'\x07'+uleb(len(body))+body+b[end:]

def run():
    b=BASE.read_bytes()
    assert hashlib.sha256(b).hexdigest()=='61192df377020627f52fa7e9fd28047bd53662aa46e5e3cd6e7fad0c5c35cc98'
    ns=names(b)
    # Function names from the original, not numeric guesses.
    targets=['VirtualAlloc','VirtualFree','__wasm_init_memory','PMem_Init()',
             '_PMem_AllocNamed(unsigned int, unsigned int, int, unsigned int, char const*, EMemTrack)']
    extra={k:ns[k] for k in targets if k in ns}
    print(json.dumps({'sha256':hashlib.sha256(b).hexdigest(),'functions':extra}))
    (ROOT/'original-test.wasm').write_bytes(exports(b,extra))
    (ROOT/'names.json').write_text(json.dumps(ns))

def build_patch():
    b=BASE.read_bytes(); ns=names(b)
    assert hashlib.sha256(b).hexdigest()=='61192df377020627f52fa7e9fd28047bd53662aa46e5e3cd6e7fad0c5c35cc98'
    _,ch,cs,ce=next(s for s in sections(b) if s[0]==10)
    count,p=read(b,cs); bodies={}
    for index in range(170,170+count):
        head=p;size,p=read(b,p); bodies[index]=(head,p,p+size);p+=size
    assert p==ce
    edits=[]; growth={}
    def edit_func(name, old, new, occurrence=1):
        idx=ns[name];head,start,end=bodies[idx]
        body=b[start:end]
        assert body.count(old)==occurrence,(name,old.hex(),body.count(old))
        assert occurrence==1
        at=start+body.index(old)
        edits.append({'at':at,'before':list(old),'after':list(new),'purpose':name})
        growth[idx]=growth.get(idx,0)+len(new)-len(old)
    # MEM_RESERVE doesn't commit/zero pages. Existing commit path zeros each new page.
    old=bytes.fromhex('20000440200428022441002000fc0b000b')
    new=bytes.fromhex('2002418020710440200428022441002000fc0b000b')
    edit_func('VirtualAlloc',old,new)
    alloc_name='_PMem_AllocNamed(unsigned int, unsigned int, int, unsigned int, char const*, EMemTrack)'
    # Both emitted copies of PMem_Init reserve 328 MiB (584 MiB for mod zones).
    call=b'\x10'+uleb(ns['VirtualAlloc'])
    for name in ['PMem_Init()',alloc_name]:
        edit_func(name,bytes.fromhex('418020')+call,bytes.fromhex('4180c000')+call)
    # Preserve size in a new local, because the low-allocation path reuses local 0.
    h,s,e=bodies[ns[alloc_name]]
    assert b[s:s+3]==bytes([1,3,0x7f])
    edits.append({'at':s,'before':[1,3,127],'after':[1,4,127,0x20,0,0x21,6],'purpose':'preserve allocation size'})
    growth[ns[alloc_name]]+=4
    # Commit only the requested range, keep the original (possibly unaligned) pointer.
    tail=bytes.fromhex('20016a0f0b000b')
    commit=bytes.fromhex('22052006418020')+call+bytes.fromhex('1a2005')
    edit_func(alloc_name,tail,tail[:3]+commit+tail[3:])
    code_growth=sum(growth.values())
    for idx,delta in growth.items():
        h,s,e=bodies[idx]
        after=uleb(e-s+delta)
        code_growth+=len(after)-(s-h)
        edits.append({'at':h,'before':list(b[h:s]),'after':list(after),'purpose':'function body length'})
    edits.append({'at':ch+1,'before':list(b[ch+1:cs]),'after':list(uleb(ce-cs+code_growth)),'purpose':'code section length'})
    edits.sort(key=lambda x:x['at'])
    out=bytearray();p=0
    for edit in edits:
        at=edit['at'];old=bytes(edit['before']);new=bytes(edit['after'])
        assert at>=p and b[at:at+len(old)]==old
        out+=b[p:at]+new;p=at+len(old)
    out+=b[p:]
    extra={k:ns[k] for k in ['VirtualAlloc','VirtualFree','__wasm_init_memory','PMem_Init()',alloc_name]}
    (ROOT/'patched.wasm').write_bytes(out)
    (ROOT/'patched-test.wasm').write_bytes(exports(out,extra))
    recipe={'id':'bo1-memory-20261011-1','baseSha256':hashlib.sha256(b).hexdigest(),
            'patchedSha256':hashlib.sha256(out).hexdigest(),'baseBytes':len(b),'patchedBytes':len(out),'edits':edits}
    (ROOT/'recipe.json').write_text(json.dumps(recipe,indent=2)+'\n')
    print(json.dumps({k:v for k,v in recipe.items() if k!='edits'}))

if __name__=='__main__':
    run();build_patch()
    fixture=ROOT/'KisakBlack-web.wasm'
    if fixture.resolve()!=BASE.resolve():fixture.write_bytes(BASE.read_bytes())
    recipe=json.loads((ROOT/'recipe.json').read_text())
    assert recipe==json.loads((PROJECT/'memory/recipe.json').read_text())
    template=(PROJECT/'memory/runtime.template.js').read_text()
    generated=template.replace('__BO1_RECIPE__',json.dumps(recipe,separators=(',',':')))
    (PROJECT/'BO1Mobile/MemoryPatch.js').write_text(generated)
