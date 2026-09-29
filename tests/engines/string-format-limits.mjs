import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url)),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'zinc-format-limits-'));
const run=(file,engine,jit=false)=>spawnSync(process.execPath,['compiler/bin/zinc.mjs','run',file,'--engine',engine,...(jit?['--jit']:[])],{cwd:root,encoding:'utf8',timeout:120000,env:{...process.env,ZINC_VM_HEAP_BYTES:'65536'}});
try {
  const expansion=path.join(tmp,'expansion.ts');
  fs.writeFileSync(expansion,`const text='a'.repeat(1000);console.log(text.replace('a', "$'".repeat(1000)).length);`);
  for(const jit of process.arch==='arm64'?[false,true]:[false]) {
    const r=run(expansion,'zinc-vm',jit);assert.equal(r.error,undefined);assert.notEqual(r.status,0);assert.match(r.stderr,/VM heap memory limit exceeded/);
  }
  for(const digits of [-1,101]) {
    const file=path.join(tmp,`digits${digits}.ts`);fs.writeFileSync(file,`console.log((1).toFixed(${digits}));`);
    for(const engine of ['native','zinc-vm']) { const r=run(file,engine);assert.equal(r.error,undefined);assert.notEqual(r.status,0);assert.match(r.stderr,/RangeError: toFixed\(\) digits/); }
  }
  console.log('ok format limits: replacement expansion and toFixed digits');
} finally {fs.rmSync(tmp,{recursive:true,force:true});}
