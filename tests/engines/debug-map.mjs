// Source stacks from real guest execution, using one unchanged prebuilt VM core.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadProgram } from '../../compiler/src/frontend.ts';
import { Sema } from '../../compiler/src/sema.ts';
import { emitAbi } from '../../compiler/src/abi.ts';
import { emitBytecode } from '../../compiler/src/emit-bc.ts';
const root=fileURLToPath(new URL('../..',import.meta.url)), target=process.platform==='darwin'?'macos':'linux';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'zinc-debug-'));
const launch=(exe,args)=>spawnSync(exe,args,{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:1<<20});
try {
  const built=launch(process.execPath,['compiler/bin/zinc.mjs','build','tests/engines/debug/throw.ts','--engine','zinc-vm','--headless','--print-exe','--json']);
  assert.equal(built.status,0,built.stderr);
  const runner=JSON.parse(built.stdout.trim().split('\n').at(-1))[0];
  const runnerBefore=fs.statSync(runner).mtimeMs;
  function compile(name,text){
    const file=path.join(temp,name+'.ts'),dir=path.join(temp,name);fs.mkdirSync(dir);fs.writeFileSync(file,text);
    const frontend=loadProgram(file,[]);assert.equal(frontend.tsDiagnostics.length,0,JSON.stringify(frontend.tsDiagnostics));
    const sema=new Sema(frontend,temp,{numberKind:'f64',typing:'gradual',warnFloat:false,noFloat:false,heap0:false});
    const abi=emitAbi(sema,dir,target),bundle=path.join(dir,'app.zbc');
    fs.writeFileSync(bundle,emitBytecode(sema,abi,map=>fs.writeFileSync(bundle+'.debug',map)));return bundle;
  }
  const sync=compile('sync',"function deepest(): void {\n  throw new Error('source trace');\n}\nfunction middle(): void {\n  deepest();\n}\nmiddle();\n");
  const async=compile('async',"async function failure(): Promise<void> {\n  await Promise.resolve();\n  throw new Error('async trace');\n}\nfailure();\n");
  const rejected=compile('rejected',"function reject(): void {\n  Promise.reject(new Error('rejected trace'));\n}\nreject();\n");
  const caught=compile('caught',"function failure(): void {throw new Error('caught');} try{failure();}catch(error){console.log(error.message);}\n");
  const run=(file,jit=false)=>{const r=launch(runner,[file,...(jit?['--jit']:[])]);assert.equal(r.error,undefined);assert.equal(r.signal,null);return r;};
  for(const jit of process.arch==='arm64'?[false,true]:[false]) {
    const r=run(sync,jit);assert.equal(r.status,1);assert.match(r.stderr,/Error: source trace\n    at deepest \(sync.ts:2:3\)\n    at middle \(sync.ts:5:3\)\n    at <init> \(sync.ts:7:1\)/);
    const a=run(async,jit);assert.equal(a.status,1);assert.match(a.stderr,/Error: async trace/);assert.match(a.stderr,/at failure \(async.ts:3:3\)/);
    const p=run(rejected,jit);assert.equal(p.status,1);assert.match(p.stderr,/Error: rejected trace/);assert.match(p.stderr,/at reject \(rejected.ts:2:3\)/);
    const c=run(caught,jit);assert.equal(c.status,0);assert.equal(c.stdout,'caught\n');assert.equal(c.stderr,'');
  }
  const original=fs.readFileSync(sync+'.debug');
  for(const map of [undefined,Buffer.from('broken'),Buffer.from(original)]) {
    if(map===undefined)fs.rmSync(sync+'.debug');else {if(map.length>8)map.writeUInt32LE(map.readUInt32LE(4)^1,4);fs.writeFileSync(sync+'.debug',map);}
    const r=run(sync);assert.equal(r.status,1);assert.match(r.stderr,/Error: source trace/);assert.match(r.stderr,/function#\d+ \(bytecode:\d+\)/);assert.doesNotMatch(r.stderr,/sync.ts:/);
  }
  assert.equal(fs.statSync(runner).mtimeMs,runnerBefore,'script/debug updates must not rebuild the core');
  console.log('ok source stacks: interpreter/JIT, async, rejection, caught exceptions, missing/stale/malformed maps and unchanged core');
} finally {fs.rmSync(temp,{recursive:true,force:true});}
