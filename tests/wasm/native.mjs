import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { WASI } from 'node:wasi';
import { Worker } from 'node:worker_threads';
import { NativeABI, NativeRPC, nativeDeclarations, nativeSignature, serveNative } from '../../targets/wasm/glue/native.mjs';
import { nativeServices } from '../../targets/web/native-services.mjs';
const listeners = new Map();
globalThis.addEventListener = (name,fn) => listeners.set(name,fn);
Object.defineProperty(globalThis,'navigator',{value:{userActivation:{hasBeenActive:false}},configurable:true});
const Z = nativeServices({}, {audio:true,webgl2:true});
let gestures = 0;
Z.onUserGesture(()=>gestures++); assert.equal(gestures,0); listeners.get('keydown')(); assert.equal(gestures,1);
Z.registerNative('Test',{echo(x){return x;},zeros(values){values[0]=-0;return [-0];},bad(){throw Error('backend failed');}},['audio']);
const declared = [['Test','echo','s>s'],['Test','bad','>n'],['Test','missing','>i'],['Test','callback','c(i>n)>n'],['Test','promise','>Pi']];
const descriptors = nativeDeclarations(Z,declared.slice(0,3));
assert.deepEqual(descriptors,declared.slice(0,2));
for (const unsupported of declared.slice(3)) assert.throws(()=>nativeDeclarations(Z,[unsupported]),/unsupported browser native signature/);
assert.throws(()=>Z.require('not-present','test'),/not available/);
assert.throws(()=>nativeSignature('h>n'),/unsupported/);
assert.throws(()=>nativeSignature('U>U'),/unsupported/);
assert.throws(()=>nativeSignature('i'.repeat(13)+'>i'),/unsupported/);
const memory = new WebAssembly.Memory({initial:4}); let next = 1024, freed = [];
const abi = new NativeABI(()=>memory,{zn_alloc:n=>{const p=next;next+=n;return p;},zn_free:p=>freed.push(p)});
let view = ()=>new DataView(memory.buffer);
for (const [type,value,expected] of [['i',-2147483648,-2147483648],['u',4294967295,4294967295],['b',true,true],['d',Math.PI,Math.PI],['f',0.1,Math.fround(0.1)]]) {
 abi.write(type,32,value); assert.equal(abi.read(type,32),expected);
}
for (const [type,value] of [['s','é 🎵'],['B',[0,255]],['I',[-2147483648,2147483647]],['U',[2147483648,4294967295]],['D',[0.25,-2.5]]]) {
 if(type === 'U') abi.complete('U>n',32,0,{outputs:[value]});else abi.write(type,32,value); assert.deepEqual(abi.read(type,32),value); memory.grow(1); assert.deepEqual(abi.read(type,32),value);
}
assert.ok(freed.length>0);
assert.throws(()=>abi.write('d',32,NaN),/invalid/);
assert.throws(()=>abi.write('s',32,42),/invalid/);
abi.write('s',64,'a'); abi.write('s',72,'b'); view().setUint32(32,64,true);view().setUint32(36,2,true);
// Each write frees the preceding return; the mock retains bytes, so the packed string views can still be checked.
assert.deepEqual(abi.read('S',32),['a','b']);
view().setUint32(32,memory.buffer.byteLength-1,true);view().setUint32(36,2,true);
assert.throws(()=>abi.read('I',32),/bounds/);assert.throws(()=>abi.cstr(memory.buffer.byteLength),/bounds/);
abi.error(100,5,new Error('abcdef'));assert.equal(abi.cstr(100),'abcd');
for (const [type,bad] of [['B',[-1]],['B',[256]],['I',[2147483648]],['I',[0.5]],['U',[-1]],['U',[4294967296]],['U',[0.5]],['D',[Infinity]],['i',2147483648],['u',-1],['f',1e100]]) {
 const before = new Uint8Array(memory.buffer,32,8).slice(), allocations = next, frees = freed.length;
 assert.throws(()=>type === 'U' ? abi.complete('U>n',32,0,{outputs:[bad]}) : abi.write(type,32,bad),/invalid/);
 assert.deepEqual(new Uint8Array(memory.buffer,32,8),before);assert.equal(next,allocations);assert.equal(freed.length,frees);
}
abi.write('B',128,[1]);abi.write('I',136,[2,3]);abi.complete('U>n',144,0,{outputs:[[2147483648]]});abi.write('D',152,[]);
const outputs = [[255,0,2],[-2147483648],[4294967295,2147483648],[0.25,-2.5]];
abi.complete('BIUD>I',128,192,{value:[-2147483648,2147483647],outputs});
for(const [i,type] of [...'BIUD'].entries()) assert.deepEqual(abi.read(type,128+i*8),outputs[i]);
assert.deepEqual(abi.read('I',192),[-2147483648,2147483647]);
const oldDescriptors = new Uint8Array(memory.buffer,128,72).slice(), oldArena = abi.result;
for(const bad of [null,{}, {value:[],outputs:[]}, {value:[],outputs:[[1],[2],[-1],[3]]}, {value:[2147483648],outputs}, {value:[],outputs:[[1],[2],[3],[NaN]]}]) {
 assert.throws(()=>abi.complete('BIUD>I',128,192,bad),/invalid/);
 assert.deepEqual(new Uint8Array(memory.buffer,128,72),oldDescriptors);assert.equal(abi.result,oldArena);
}
abi.complete('BIUD>s',128,192,{value:'empty',outputs:[[],[],[],[]]});
for(const [i,type] of [...'BIUD'].entries()) {assert.deepEqual(abi.read(type,128+i*8),[]);assert.ok(view().getUint32(128+i*8,true));}
assert.equal(abi.read('s',192),'empty');
const oversized = Array(600000).fill(1), allocatedBeforeBudget = next;
assert.throws(()=>abi.complete('II>n',128,192,{outputs:[oversized,oversized]}),/transport bounds/);assert.equal(next,allocatedBeforeBudget);
const unchanged = new Uint8Array(memory.buffer,128,32).slice();
abi.complete('BIUD>n',128,192,{value:{ignored:true},outputs:[null,null,null,null]});
assert.deepEqual(new Uint8Array(memory.buffer,128,32),unchanged);
const failedAlloc = new NativeABI(()=>memory,{zn_alloc:()=>0,zn_free(){assert.fail('free after failed allocation');}});
assert.throws(()=>failedAlloc.complete('B>s',128,192,{value:'x',outputs:[[2]]}),/allocation failed/);
assert.deepEqual(new Uint8Array(memory.buffer,128,32),unchanged);
const grows = new NativeABI(()=>memory,{zn_alloc:n=>{const p=next;next+=n;memory.grow(1);return p;},zn_free(){}});
grows.complete('U>s',128,192,{value:'grew',outputs:[[4294967295]]});assert.deepEqual(grows.read('U',128),[4294967295]);assert.equal(grows.read('s',192),'grew');grows.close();
// Reject repeated large string views and total multi-argument size before decoding any string.
const boundedMemory = new WebAssembly.Memory({initial:100});
const boundedABI = new NativeABI(()=>boundedMemory,{});
let decoded = 0; boundedABI.string = ()=>{decoded++;throw Error('decoded before budget validation');};
const boundedView = new DataView(boundedMemory.buffer);
boundedView.setUint32(32,64,true);boundedView.setUint32(36,2,true);
for(const p of [64,72]) {boundedView.setUint32(p,1024,true);boundedView.setUint32(p+4,3*1024*1024,true);}
assert.throws(()=>boundedABI.read('S',32),/bounds/);assert.equal(decoded,0);
for(const p of [32,40]) {boundedView.setUint32(p,1024,true);boundedView.setUint32(p+4,3*1024*1024,true);}
assert.throws(()=>boundedABI.args('ss>n',32),/bounds/);assert.equal(decoded,0);
// A shared reply published before the timeout settles even if its notification is lost/delayed.
const delayed = new NativeRPC(message=>void serveNative(Z,descriptors,message.nativeCall,()=>{}),5);
assert.deepEqual(await delayed.call('Test','echo','s>s',['ready'],false),{value:'ready',outputs:[null]});delayed.close();
const rpc = new NativeRPC(message=>void serveNative(Z,descriptors,message.nativeCall,reply=>rpc.reply(reply.nativeReply)),50);
assert.deepEqual(await rpc.call('Test','echo','s>s',['actual'],false),{value:'actual',outputs:[null]});
await assert.rejects(rpc.call('Test','bad','>n',[],false),/backend failed/);
const zeroRPC = new NativeRPC(message=>void serveNative(Z,[['Test','zeros','D>D']],message.nativeCall,reply=>zeroRPC.reply(reply.nativeReply)));
const zeros = await zeroRPC.call('Test','zeros','D>D',[[0]],false);assert.ok(Object.is(zeros.value[0],-0));assert.ok(Object.is(zeros.outputs[0][0],-0));zeroRPC.close();
await assert.rejects(rpc.call('Test','echo','i>i',[1],false),/signature/);
let late;
const stale = new NativeRPC(message=>{late=message.nativeCall;},5);
await assert.rejects(stale.call('Test','echo','s>s',['late'],false),/timed out/);
let called = 0; Z.registerNative('Test',{echo(x){called++;return x;}},[]);
await serveNative(Z,descriptors,late,()=>assert.fail('stale reply delivered'));assert.equal(called,0);
const stopped = new NativeRPC(()=>{},50);const pending=stopped.call('Test','echo','s>s',['old'],false);stopped.close();await assert.rejects(pending,/closed/);assert.throws(()=>stopped.call('Test','echo','s>s',[],false),/closed/);
const restarted = new NativeRPC(message=>void serveNative(Z,descriptors,message.nativeCall,reply=>restarted.reply(reply.nativeReply)));
assert.deepEqual(await restarted.call('Test','echo','s>s',['new'],false),{value:'new',outputs:[null]}); restarted.close();rpc.close();stale.close();
// Real blocking worker: publication through the shared reply works without worker onmessage.
const worker = new Worker(`const {parentPort}=require('node:worker_threads'); import(${JSON.stringify(new URL('../../targets/wasm/glue/native.mjs',import.meta.url).href)}).then(({NativeRPC})=>{ const rpc=new NativeRPC(m=>parentPort.postMessage(m),1000); parentPort.postMessage({result:rpc.call('Test','echo','s>s',['blocking'],true)}); });`,{eval:true});
try {
 await new Promise((resolve,reject)=>{worker.on('error',reject);worker.on('message',message=>{if(message.nativeCall) void serveNative(Z,descriptors,message.nativeCall,()=>{});else {try{assert.deepEqual(message.result,{value:'blocking',outputs:[null]});resolve();}catch(e){reject(e);}}});});
} finally {await worker.terminate();}
console.log('PASS browser native ABI, descriptors, errors, bounds, stale replies, restart and blocking transport');

// A decode completing after unload cannot resurrect a queued voice; a failed decode ends it and reports why.
let audio, completions = [], starts = 0;
const backendContext = {globalThis:{__zincWeb:{require(){},onUserGesture(){},registerNative(name,impl){audio=impl;}}},Uint8Array,Map,Math};
backendContext.globalThis.AudioContext = class {
 state='running';destination={};sampleRate=48000;
 createGain(){return {gain:{value:1},connect(){}};}
 decodeAudioData(){return new Promise((resolve,reject)=>completions.push({resolve,reject}));}
 createBufferSource(){return {playbackRate:{value:1},connect(){},start(){starts++;}};}
};
vm.runInNewContext(readFileSync('plugins/audio/web/audio.js','utf8'),backendContext);
const unloaded=audio.load([0]);audio.play(unloaded,1,false,1,0);audio.unload(unloaded);
completions.shift().resolve({duration:1});await Promise.resolve();assert.equal(starts,0);assert.equal(audio.playing(unloaded),false);
const failed=audio.load([0]);audio.play(failed,1,false,1,0);completions.shift().reject(Error('bad audio'));await Promise.resolve();assert.equal(audio.playing(failed),false);assert.equal(audio.error(),'bad audio');
assert.ok(audio.load([0])>failed); // a stale unloaded sound handle is never reused
console.log('PASS shared WebAudio unload/decode failure regression');

const wasm = await WebAssembly.compile(readFileSync(process.argv[2]));
const wasi = new WASI({version:'preview1',args:[],env:{},preopens:{},returnOnExit:true});
const actualInstance = await WebAssembly.instantiate(wasm,{...wasi.getImportObject(),zn:{gfx(){},native_call(){throw Error('unexpected native call');}}});
wasi.initialize(actualInstance);
const actual = actualInstance.exports;
function cstring(value) {const bytes=new TextEncoder().encode(value+'\0'),p=actual.zn_alloc(bytes.length);new Uint8Array(actual.memory.buffer,p,bytes.length).set(bytes);return p;}
const moduleName=cstring('Test'), exportName=cstring('echo'), goodSig=cstring('U>i'), callbackSig=cstring('c(i>n)>n'), promiseSig=cstring('>Pi'), unsignedResultSig=cstring('U>U');
try {
 actual.zn_native_reset();
 assert.equal(actual.zn_native_add(moduleName,exportName,callbackSig),-1);
 assert.equal(actual.zn_native_add(moduleName,exportName,promiseSig),-1);
 assert.equal(actual.zn_native_add(moduleName,exportName,unsignedResultSig),-1);
 assert.equal(actual.zn_native_add(moduleName,exportName,goodSig),0);
 assert.equal(actual.zn_native_add(moduleName,exportName,goodSig),-1);
 actual.zn_native_reset();
 assert.equal(actual.zn_native_add(moduleName,exportName,goodSig),0);
 actual.zn_native_reset();
} finally {[moduleName,exportName,goodSig,callbackSig,promiseSig,unsignedResultSig].forEach(p=>actual.zn_free(p));}
console.log('PASS actual browser wasm descriptor validation and reset');

// The unchanged real Render3D math backend and the actual interpreter consume output views.
globalThis.__zincWeb=Z; // CPU-only backend functions; no GL context or rendering is exercised.
vm.runInThisContext(readFileSync('plugins/3d/web/render3d.js','utf8'));
vm.runInThisContext(readFileSync('tests/data/wasm_native/plugins/array-probe/web/probe.js','utf8'));
const arrayDeclarations = [['ArrayProbe','edit','BIUD>I'],['ArrayProbe','clear','BIUD>s'],['ArrayProbe','fail','B>n'],['ArrayProbe','alias','II>n'],['ArrayProbe','voidValue','>n'],['ArrayProbe','doubles','>D'],['Render3D','transform','DDDDD>n'],['Render3D','partBounds','BiD>b'],['Render3D','meshCreate','DDDUI>i']];
const available = nativeDeclarations(Z,arrayDeclarations);assert.deepEqual(available,arrayDeclarations);
let realABI, nativeCalls=0;
const transport = new NativeRPC(message=>void serveNative(Z,available,message.nativeCall,reply=>transport.reply(reply.nativeReply)));
const realWasi = new WASI({version:'preview1',args:[],env:{},preopens:{},returnOnExit:true});
const hasJSPI = typeof WebAssembly.Suspending === 'function' && typeof WebAssembly.promising === 'function';
const nativeImport = async (module,name,sig,args,ret,err,size)=>{
 nativeCalls++;try {const signature=realABI.cstr(sig);const reply=await transport.call(realABI.cstr(module),realABI.cstr(name),signature,realABI.args(signature,args),false);realABI.complete(signature,args,ret,reply);return 0;}
 catch(error){realABI.error(err,size,error);return 2;}
};
const imported = hasJSPI ? new WebAssembly.Suspending(nativeImport) : ()=>{throw Error('JSPI unavailable');};
const realInstance = await WebAssembly.instantiate(wasm,{...realWasi.getImportObject(),zn:{gfx(){},native_call:imported}});
realWasi.initialize(realInstance);const real = realInstance.exports;realABI = new NativeABI(()=>real.memory,real);
for(const row of available){const pointers=row.map(value=>{const bytes=new TextEncoder().encode(value+'\0'),p=real.zn_alloc(bytes.length);new Uint8Array(real.memory.buffer,p,bytes.length).set(bytes);return p;});try{assert.equal(real.zn_native_add(...pointers),0);}finally{pointers.forEach(p=>real.zn_free(p));}}
const errorArgs=real.zn_alloc(8);
try {
 realABI.write('B',errorArgs,[9]);const unchanged=new Uint8Array(real.memory.buffer,errorArgs,8).slice();
 await assert.rejects(transport.call('ArrayProbe','fail','B>n',realABI.args('B>n',errorArgs),false),/expected remote failure/);
 assert.deepEqual(new Uint8Array(real.memory.buffer,errorArgs,8),unchanged);assert.deepEqual(realABI.read('B',errorArgs),[9]);
} finally {real.zn_free(errorArgs);}
const program=readFileSync(process.argv[3]), programPtr=real.zn_alloc(program.length);
try {if(hasJSPI){new Uint8Array(real.memory.buffer,programPtr,program.length).set(program);assert.equal(await WebAssembly.promising(real.zn_run)(programPtr,program.length),0);assert.equal(nativeCalls,7);}}
finally {transport.close();realABI.close();real.zn_native_reset();real.zn_free(programPtr);}
console.log(hasJSPI ? 'PASS actual JSPI WASM VM BIUD grow/shrink/empty/alias/void and Render3D CPU adapters' : 'SKIP optional JSPI entry (unavailable); blocking VM proof follows');

const blockingProgram = new Worker(`const {parentPort,workerData}=require('node:worker_threads');
(async()=>{
 const {WASI}=await import('node:wasi');const {NativeABI,NativeRPC}=await import(workerData.nativeURL);
 let abi,calls=0;const rpc=new NativeRPC(m=>parentPort.postMessage(m));
 const wasi=new WASI({version:'preview1',args:[],env:{},preopens:{},returnOnExit:true});
 const {instance}=await WebAssembly.instantiate(workerData.wasm,{...wasi.getImportObject(),zn:{gfx(){},native_call(module,name,sig,args,ret,err,size){
  calls++;try{const signature=abi.cstr(sig),reply=rpc.call(abi.cstr(module),abi.cstr(name),signature,abi.args(signature,args),true);abi.complete(signature,args,ret,reply);return 0;}
  catch(error){abi.error(err,size,error);return 2;}
 }}});wasi.initialize(instance);const ex=instance.exports;abi=new NativeABI(()=>ex.memory,ex);
 for(const row of workerData.declarations){const pointers=row.map(text=>{const bytes=new TextEncoder().encode(text+'\\0'),p=ex.zn_alloc(bytes.length);new Uint8Array(ex.memory.buffer,p,bytes.length).set(bytes);return p;});try{if(ex.zn_native_add(...pointers)!==0)throw Error('register');}finally{pointers.forEach(p=>ex.zn_free(p));}}
 const p=ex.zn_alloc(workerData.program.length);try{new Uint8Array(ex.memory.buffer,p,workerData.program.length).set(workerData.program);parentPort.postMessage({result:ex.zn_run(p,workerData.program.length),calls});}
 finally{rpc.close();abi.close();ex.zn_native_reset();ex.zn_free(p);}
})().catch(e=>{throw e;});`,{eval:true,workerData:{nativeURL:new URL('../../targets/wasm/glue/native.mjs',import.meta.url).href,wasm:readFileSync(process.argv[2]),program,declarations:available}});
try {
 await new Promise((resolve,reject)=>{
  blockingProgram.on('error',reject);blockingProgram.on('exit',code=>reject(Error('blocking program exited before reply: '+code)));
  blockingProgram.on('message',message=>{if(message.nativeCall)void serveNative(Z,available,message.nativeCall,()=>{});else{try{assert.equal(message.result,0);assert.equal(message.calls,7);resolve();}catch(error){reject(error);}}});
 });
} finally {await blockingProgram.terminate();}
console.log('PASS actual blocking WASM VM numeric copyback and Render3D CPU adapters');
