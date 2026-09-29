// Standalone embedding check: actual compiler output, no runner subprocess at execution.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'zinc-embedded-'));
const target=process.platform==='darwin'?'macos':'linux';
function run(command,args,env=process.env) {
  const result=spawnSync(command,args,{cwd:root,encoding:'utf8',timeout:120000,env});
  assert.equal(result.error,undefined);assert.equal(result.signal,null);
  assert.equal(result.status,0,`${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
try {
  fs.writeFileSync(path.join(tmp,'dependency.ts'),'export function triple(n:i32):i32 { return n*3; }');
  const programs={
    good:`export let n:i32=0; n++; console.log("embedded",n);
      export function inc(v:i32):i32 { n+=v; return n; }
      export { inc as increment };
      export { triple as fromDependency } from './dependency';
      export const label:string="fixed";
      export let text:string="hello";
      export function join(v:string):string { return text+v; }
      export function fail():void { n++; throw new Error("guest failure"); }
      export function spin():void { while(true) { n++; } }
      export function random():number { return Math.random(); }
      function hidden():i32 { return 42; }`,
    loop:'let n:i32=0; while(true) { n++; }',
    heap:'const values:string[]=[]; for(let n:i32=0;n<10000;n++) values.push(`retained-${n}`); console.log(values.length);',
    timer:'setTimeout(() => {},1000000);',
  };
  const bytecode=[];
  for(const [name,source] of Object.entries(programs)) {
    const file=path.join(tmp,name+'.ts');fs.writeFileSync(file,source);
    run(process.execPath,['compiler/bin/zinc.mjs','build',file,'--engine','zinc-vm']);
    bytecode.push(path.join(tmp,'build',`zinc-vm-${name}-${target}`,'app.zbc'));
  }
  run(process.execPath,['compiler/bin/zinc.mjs','build','tests/engines/native.ts','--engine','zinc-vm']);
  bytecode.push(path.join(root,'tests/engines/build',`zinc-vm-native-${target}`,'app.zbc'));
  const executable=path.join(tmp,'check');
  run(process.env.CXX??'c++',['-std=c++17','-O1','-DZRT_HOSTED_CPP','-I','runtime','-I','runtime/include',
    ...(process.argv.includes('--sanitize')?['-fsanitize=address,undefined','-fno-omit-frame-pointer']:[]),
    'tests/engines/embedded.cpp','runtime/vm/embedded.cpp','runtime/zrt.cpp','runtime/host.cpp',
    'targets/null/hal_null.cpp','targets/common/hal_posix.cpp','-pthread',...(process.platform==='linux'?['-ldl']:[]),'-o',executable]);
  assert.equal(run(executable,bytecode,{...process.env,ZINC_VM_HEAP_BYTES:'invalid',ZINC_EXECUTION_TIMEOUT_MS:'invalid'}),
    'embedded 1\n'.repeat(process.arch==='arm64'?4:2)+'EMBEDDED\n40.25\n41.25\n');
  console.log('ok embedded VM: isolated instances, interpreter/JIT, named exports, error recovery, limits, interruption, verification and module lifecycle');
} finally {fs.rmSync(tmp,{recursive:true,force:true});}
