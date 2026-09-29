// Dense typed arrays deliberately reject mutation that would require undefined/holes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'zinc-array-limits-'));
try {
  for(const method of ['map','findIndex','findLastIndex','find']) {
    const file=path.join(tmp,method+'.ts');
    fs.writeFileSync(file,`const values:{n:i32}[]=[{n:1},{n:2},{n:3}]; try { values.${method}(v=>{values.splice(0);return ${method==='map'?'v.n':'false'};}); console.log("unexpected success"); } catch(e) { console.log(e.message); }`);
    for(const engine of ['native','zinc-vm',...(process.arch==='arm64'?['jit']:[])]) {
      const r=spawnSync(process.execPath,['compiler/bin/zinc.mjs','run',file,'--engine',engine==='jit'?'zinc-vm':engine,...(engine==='jit'?['--jit']:[])],{cwd:root,encoding:'utf8',timeout:120000,env:{...process.env,ZINC_LOG_FORMAT:'plain'}});
      assert.equal(r.error,undefined);
      if(engine==='native')assert.notEqual(r.status,0);else assert.equal(r.status,0,r.stderr);
      assert.match(engine==='native'?r.stderr:r.stdout,new RegExp(`typed array ${method} cannot visit removed elements`));
    }
  }
  const scalar=path.join(tmp,'scalar.ts');fs.writeFileSync(scalar,'const values:i32[]=[1,2];values.find(v=>v===1);');
  const r=spawnSync(process.execPath,['compiler/bin/zinc.mjs','build',scalar,'--engine','zinc-vm'],{cwd:root,encoding:'utf8',timeout:120000});
  assert.equal(r.error,undefined);assert.notEqual(r.status,0);assert.match(r.stderr,/find requires reference elements/);
  console.log('ok array limits: removed-element diagnostics and scalar find rejection');
} finally {fs.rmSync(tmp,{recursive:true,force:true});}
