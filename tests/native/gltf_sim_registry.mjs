// Exercise the production stand-in reader. Only gfx image allocation is replaced, and no test decodes an image.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import ts from '@typescript/typescript6';
import vm from 'node:vm';
const source=fs.readFileSync('plugins/three/native/three.sim.ts','utf8');
assert.equal((source.match(/^import .*;$/gm)||[]).length,2);
const result=ts.transpileModule(source.replace(/^import .*;$/gm,'').replace('export default {','globalThis.provider = {'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},reportDiagnostics:true});
assert.equal((result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
const js=result.outputText;
const context=vm.createContext({fs,Buffer,Uint8Array,DataView,Array,Set,Map,Object,Number,Math,JSON,createImage(){assert.fail('unexpected image decode');}});
vm.runInContext(js,context);
const p=context.provider, folder=process.argv[2];
const bytes=name=>Array.from(fs.readFileSync(folder+'/'+name+'.gltf'));
const data=bytes('model');
const old=p.parse(data);assert.ok(old>0);p.free(old);
const live=p.parse(data);assert.ok(live>old);assert.equal(p.nodeCount(old),0);assert.equal(p.materialSpecular(old,0,[]),false);p.free(old);assert.equal(p.nodeCount(live),3);
const size=[];assert.equal(p.primitiveSize(live,0,0,size),true);assert.deepEqual(size,[9,3]);
const spec=[];assert.equal(p.materialSpecular(live,0,spec),true);assert.deepEqual(spec,[.25,.125,.0625,.5]);p.free(live);
const multi=p.parse(bytes('multi-scene'));assert.ok(multi>0);p.free(multi);
for(const name of ['cycle','dag','roots','bad-node','deep','node-budget','infinite-transform','infinite-specular','boolean-specular','bad-specular','bad-colour','bad-roughness','texture','colour-texture','optional-texture','forbidden-specular-glossiness','forbidden-unlit']) assert.equal(p.parse(bytes(name)),-1,name);
for(const name of ['count-normal', 'count-texcoord_0', 'count-color_0', 'compressed-normal', 'compressed-texcoord_0', 'compressed-color_0','compressed-cumulative']) { const h=p.parse(bytes(name));assert.ok(h>0);const out=[];assert.equal(p.primitiveSize(h,0,0,out),false,name);assert.deepEqual(out,[]);p.free(h); }
const handles=[];for(let i=0;i<16;i++){const h=p.parse(data);assert.ok(h>0);handles.push(h);}assert.equal(p.parse(data),-1);for(const h of handles)p.free(h);
assert.equal(vm.runInContext('transition(docs[0],DocumentState.Vacant)',context),false,'illegal vacant-to-vacant transition');
// A source-level endpoint check reaches exhaustion without billions of opens; this is not a native runtime exhaustion campaign.
vm.runInContext('nextDocumentId=2147483647',context);
const last=p.parse(data);assert.equal(last,2147483647);p.free(last);assert.equal(p.parse(data),-1);assert.match(p.error(),/exhausted/);
console.log('PASS production glTF stand-in: strict trees/factors, stale handles, sixteen active slots and ID exhaustion');
