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
const Z = nativeServices({}, {audio:true});
let gestures = 0;
Z.onUserGesture(()=>gestures++); assert.equal(gestures,0); listeners.get('keydown')(); assert.equal(gestures,1);
Z.registerNative('Test',{echo(x){return x;},bad(){throw Error('backend failed');}},['audio']);
const declared = [['Test','echo','s>s'],['Test','bad','>n'],['Test','missing','>i'],['Test','callback','c(i>n)>n'],['Test','promise','>Pi']];
const descriptors = nativeDeclarations(Z,declared.slice(0,3));
assert.deepEqual(descriptors,declared.slice(0,2));
for (const unsupported of declared.slice(3)) assert.throws(()=>nativeDeclarations(Z,[unsupported]),/unsupported browser native signature/);
assert.throws(()=>Z.require('not-present','test'),/not available/);
assert.throws(()=>nativeSignature('h>n'),/unsupported/);
assert.throws(()=>nativeSignature('i'.repeat(13)+'>i'),/unsupported/);
const memory = new WebAssembly.Memory({initial:4}); let next = 1024, freed = [];
const abi = new NativeABI(()=>memory,{zn_alloc:n=>{const p=next;next+=n;return p;},zn_free:p=>freed.push(p)});
let view = ()=>new DataView(memory.buffer);
for (const [type,value,expected] of [['i',-2147483648,-2147483648],['u',4294967295,4294967295],['b',true,true],['d',Math.PI,Math.PI],['f',0.1,Math.fround(0.1)]]) {
 abi.write(type,32,value); assert.equal(abi.read(type,32),expected);
}
for (const [type,value] of [['s','é 🎵'],['B',[0,255]],['I',[-2147483648,2147483647]],['D',[0.25,-2.5]]]) {
 abi.write(type,32,value); assert.deepEqual(abi.read(type,32),value); memory.grow(1); assert.deepEqual(abi.read(type,32),value);
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
assert.equal(await delayed.call('Test','echo','s>s',['ready'],false),'ready');delayed.close();
const rpc = new NativeRPC(message=>void serveNative(Z,descriptors,message.nativeCall,reply=>rpc.reply(reply.nativeReply)),50);
assert.equal(await rpc.call('Test','echo','s>s',['actual'],false),'actual');
await assert.rejects(rpc.call('Test','bad','>n',[],false),/backend failed/);
await assert.rejects(rpc.call('Test','echo','i>i',[1],false),/signature/);
let late;
const stale = new NativeRPC(message=>{late=message.nativeCall;},5);
await assert.rejects(stale.call('Test','echo','s>s',['late'],false),/timed out/);
let called = 0; Z.registerNative('Test',{echo(x){called++;return x;}},[]);
await serveNative(Z,descriptors,late,()=>assert.fail('stale reply delivered'));assert.equal(called,0);
const stopped = new NativeRPC(()=>{},50);const pending=stopped.call('Test','echo','s>s',['old'],false);stopped.close();await assert.rejects(pending,/closed/);assert.throws(()=>stopped.call('Test','echo','s>s',[],false),/closed/);
const restarted = new NativeRPC(message=>void serveNative(Z,descriptors,message.nativeCall,reply=>restarted.reply(reply.nativeReply)));
assert.equal(await restarted.call('Test','echo','s>s',['new'],false),'new'); restarted.close();rpc.close();stale.close();
// Real blocking worker: publication through the shared reply works without worker onmessage.
const worker = new Worker(`const {parentPort}=require('node:worker_threads'); import(${JSON.stringify(new URL('../../targets/wasm/glue/native.mjs',import.meta.url).href)}).then(({NativeRPC})=>{ const rpc=new NativeRPC(m=>parentPort.postMessage(m),1000); parentPort.postMessage({result:rpc.call('Test','echo','s>s',['blocking'],true)}); });`,{eval:true});
try {
 await new Promise((resolve,reject)=>{worker.on('error',reject);worker.on('message',message=>{if(message.nativeCall) void serveNative(Z,descriptors,message.nativeCall,()=>{});else {try{assert.equal(message.result,'blocking');resolve();}catch(e){reject(e);}}});});
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
const moduleName=cstring('Test'), exportName=cstring('echo'), goodSig=cstring('s>s'), callbackSig=cstring('c(i>n)>n'), promiseSig=cstring('>Pi');
try {
 actual.zn_native_reset();
 assert.equal(actual.zn_native_add(moduleName,exportName,callbackSig),-1);
 assert.equal(actual.zn_native_add(moduleName,exportName,promiseSig),-1);
 assert.equal(actual.zn_native_add(moduleName,exportName,goodSig),0);
 assert.equal(actual.zn_native_add(moduleName,exportName,goodSig),-1);
 actual.zn_native_reset();
 assert.equal(actual.zn_native_add(moduleName,exportName,goodSig),0);
 actual.zn_native_reset();
} finally {[moduleName,exportName,goodSig,callbackSig,promiseSig].forEach(p=>actual.zn_free(p));}
console.log('PASS actual browser wasm descriptor validation and reset');
