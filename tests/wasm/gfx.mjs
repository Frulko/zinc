import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { NativeABI, NativeRPC } from '../../targets/wasm/glue/native.mjs';
const source = readFileSync('targets/wasm/glue/worker.mjs', 'utf8').replace(/^import .*;\n/gm, '');
const coverage = [], drawn = [];
const context = { NativeABI, NativeRPC, OffscreenCanvas: class { getContext() { return { putImageData(im) { coverage.push([...im.data]); } }; } }, ImageData: class { constructor(data) { this.data=data; } }, TextDecoder, TextEncoder, Uint8Array, Uint8ClampedArray, DataView, Int32Array, self: {} };
vm.createContext(context);
vm.runInContext(source + '\nself.test = {bakedResources,bakedFont,textGlyphs,drawBakedText};', context);
const { bakedResources, bakedFont, textGlyphs, drawBakedText } = context.self.test;
const bytes = [];
const u = x => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, x, true); bytes.push(...b); };
const str = s => { const b = new TextEncoder().encode(s); u(b.length); bytes.push(...b); };
bytes.push(90,82,83,49); u(1); str('sans~i'); [18,14,4,2,3].forEach(u);
for (const [cp,adv] of [[63,320],[65,641],[0x1f600,960]]) [cp,-1,-2,1,1,adv,0].forEach(u);
u(1); bytes.push(128); u(0); u(0);
const buf = Uint8Array.from(bytes).buffer;
const {fonts,images} = bakedResources(buf);
assert.equal(images.length,0); assert.equal(fonts[0].glyphs.get(65).x,-1);
assert.equal(bakedFont(fonts,'fonts/sans.ttf~i',18),0);
assert.equal(bakedFont(fonts,'sans~i',19),0);
assert.equal(bakedFont(fonts,'missing',18),-1);
assert.equal(textGlyphs(fonts[0],'A😀x\u200d',0.1),(641+960+320+3*6)/64);
assert.equal(textGlyphs(undefined,'x',0),0);
const ctx = { save() {}, restore() {}, drawImage(_,x,y) { drawn.push([x,y]); } };
drawBakedText(ctx,fonts[0],-0.2,0.4,'AA',0x123456,128,0.1);
assert.deepEqual(coverage,[[18,52,86,128]]);
assert.deepEqual(drawn,[[-1,12],[9,12]]);
assert.equal(ctx.globalAlpha,128/255);

for(let n=0;n<buf.byteLength;n++) assert.throws(()=>bakedResources(buf.slice(0,n)),/ZRS1/);
console.log('wasm_gfx: bounded 28-byte ZRS1 glyphs, normalized font lookup, Unicode and fixed-point tracking passed');

// Drive the actual dispatcher with a recording canvas, including target switches.
let harness = readFileSync('tests/wasm/images.mjs','utf8').split("if (existsSync('build-wasm/vm-web.wasm'))")[0];
harness = harness.replace("['gfxImageFromBytes', 'B>i']", "['gfxImageFromBytes', 'B>i'], ['gfxTranslate','dd>n'], ['gfxSetTransform','dddddd>n'], ['gfxResetTransform','>n'], ['gfxClip','ddddd>n'], ['gfxUnclip','>n'], ['gfxClear','u>n'], ['gfxGradient','ddddduubi>n']");
harness = harness.replace("} else v.setBigInt64", "} else if (sig[k] === 'd') v.setFloat64(b, args[k], true); else v.setBigInt64");
harness = harness.replace('const writes = [];', 'const writes = []; let matrix, clipBox, gradient; const stack=[];');
harness = harness.replace('setTransform() {}, resetTransform() {}, save() {}, restore() {}', 'setTransform(...m) { matrix=m; }, resetTransform() {}, save() { stack.push(matrix); }, restore() { matrix=stack.pop(); }, beginPath() {}, roundRect(...a) { clipBox=a; }, clip() {}, fillRect() {}, fill() {}, createLinearGradient(...a) { gradient = { points:a, stops:[] }; return { addColorStop(t,c) { gradient.stops.push([t,c]); } }; }');
harness = harness.replace("return 0;\n} };", `call(9,[3,4]); call(10,[2,0,0,3,10,20]); assert.deepEqual(matrix,[2,0,0,3,16,32]);
  call(12,[1,2,5,6,9]); assert.deepEqual(clipBox,[12,26,10,18,0]);
  call(9,[7,8]); call(13); assert.deepEqual(matrix,[2,0,0,3,24,44]);
  call(11); assert.deepEqual(matrix,[1,0,0,1,7,8]);
  call(12,[1,2,5,6,2]); assert.deepEqual(clipBox,[8,10,5,6,2]);
  call(14,[0]); assert.deepEqual(matrix,[1,0,0,1,7,8]);
  call(13); assert.equal(stack.length,0);
  call(15,[1,2,10,20,0,0x123456,0xabcdef,1,128]); assert.deepEqual(gradient,{points:[1,2,1,22],stops:[[0,"#123456"],[1,"#abcdef"]]});
  return 0;
} };`);
// Reuse its import bindings in a separate module scope.
harness = harness.replace("from '../../targets/wasm/glue/native.mjs'", 'from ' + JSON.stringify(new URL('../../targets/wasm/glue/native.mjs',import.meta.url).href));
const moduleURL = 'data:text/javascript;base64,' + Buffer.from(harness.replace("import { wasiImports } from '../../targets/wasm/glue/wasi.mjs';", 'const wasiImports = () => ({});')).toString('base64');
await import(moduleURL);
console.log('wasm_gfx: matrix/translation, reset, device-space clip, unclip and clear state passed');

const app = readFileSync('targets/wasm/glue/app.js','utf8').replace(/^import .*;\n/gm,'').replace("await import('./natives.js')", '({declarations:[]})').replaceAll('import.meta.url', "'https://example.test/app.js'");
const downloads = [];
const page = { nativeServices:()=>({}), nativeDeclarations:()=>[], URL, location: { href:'https://example.test/' }, crossOriginIsolated:true,
  document: { getElementById: () => ({}) }, window: { addEventListener() {} },
  fetch: async url => { downloads.push(url); return { ok:url !== 'app.res', arrayBuffer:async()=>new ArrayBuffer(0), json:async()=>null }; },
  WebAssembly: { compileStreaming: async promise => { await promise; return {}; } } };
await assert.rejects(vm.runInNewContext('(async()=>{' + app + '})()',page),/cannot download baked fonts/);
assert.ok(downloads.includes('app.res'));
console.log('wasm_gfx: default font download is required and failures propagate');
