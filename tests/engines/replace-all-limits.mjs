import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url)),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'zinc-replace-all-limits-'));
try {
  const cases={matches:`'a'.repeat(1000).replaceAll('a', "$'")`,boundaries:`'😀'.repeat(1000).replaceAll('', '$\u0060')`,literal:`'a'.repeat(1000).replaceAll('', 'b'.repeat(1000))`};
  for(const [name,expr] of Object.entries(cases)) {
    const file=path.join(tmp,name+'.ts');fs.writeFileSync(file,`console.log((${expr}).length);`);
    for(const jit of process.arch==='arm64'?[false,true]:[false]) {
      const r=spawnSync(process.execPath,['compiler/bin/zinc.mjs','run',file,'--engine','zinc-vm',...(jit?['--jit']:[])],{cwd:root,encoding:'utf8',timeout:120000,env:{...process.env,ZINC_VM_HEAP_BYTES:'65536'}});
      assert.equal(r.error,undefined);assert.notEqual(r.status,0);assert.match(r.stderr,/VM heap memory limit exceeded/);
    }
  }
  console.log('ok replaceAll limits: literal and substitution expansion bounded');
} finally {fs.rmSync(tmp,{recursive:true,force:true});}
