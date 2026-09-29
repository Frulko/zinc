import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'zinc-string-limits-'));
try {
  for(const [name,expr] of Object.entries({repeat:"'abcd'.repeat(2147483647)",padStart:"'x'.padStart(2147483647,'😀')",padEnd:"'x'.padEnd(2147483647)"})) {
    const file=path.join(tmp,name+'.ts'); fs.writeFileSync(file,`console.log(${expr}.length);`);
    for(const jit of process.arch==='arm64'?[false,true]:[false]) {
      const r=spawnSync(process.execPath,['compiler/bin/zinc.mjs','run',file,'--engine','zinc-vm',...(jit?['--jit']:[])],{cwd:root,encoding:'utf8',timeout:120000,env:{...process.env,ZINC_VM_HEAP_BYTES:'65536'}});
      assert.equal(r.error,undefined);assert.notEqual(r.status,0);assert.match(r.stderr,/VM heap memory limit exceeded/);
    }
  }
  const negative=path.join(tmp,'negative.ts'); fs.writeFileSync(negative,"console.log('x'.repeat(-1));");
  for(const engine of ['native','zinc-vm']) {
    const r=spawnSync(process.execPath,['compiler/bin/zinc.mjs','run',negative,'--engine',engine],{cwd:root,encoding:'utf8',timeout:120000});
    assert.equal(r.error,undefined);assert.notEqual(r.status,0);assert.match(r.stderr,/RangeError: invalid count/);
  }
  console.log('ok string limits: expansion rejected before allocation; negative repeat diagnosed');
} finally { fs.rmSync(tmp,{recursive:true,force:true}); }
