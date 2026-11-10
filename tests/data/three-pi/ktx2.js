import * as T from 'three';
import { TIER } from 'zinc:platform';
import { readBytes } from 'zinc:fs';
import { createKTX2Loader } from 'zinc:three-pi';
const assert = (value, message) => { if (!value) throw new Error(message); };
const ordinary = new T.Loader(), support = { extensions: { has: () => true } };
const loader = createKTX2Loader(support, ordinary);
if (TIER !== 2) {
  assert(loader === ordinary, 'T3/T4 ordinary loader identity');
  console.log('three-pi ktx2 no-op PASS', TIER);
} else {
  const { default: native } = await import('../../../plugins/three-pi/native/ktx2.spec.ts');
  const opaque = new Uint8Array(readBytes('tests/data/three-pi/ktx2/opaque.ktx2'));
  const alpha = new Uint8Array(readBytes('tests/data/three-pi/ktx2/alpha.ktx2'));
  const transcode = (bytes, etc1) => {
    const info = [], error = [];
    const output = native.transcode(bytes, etc1, info, error);
    assert(!error.length, new TextDecoder().decode(new Uint8Array(error)));
    return { info, output: new Uint8Array(output) };
  };
  const compressed = transcode(opaque, true), rgba = transcode(opaque, false), transparent = transcode(alpha, true);
  assert(compressed.info.join(',') === '2,1,0,1,8,8,32,4,4,8,2,2,8,1,1,8', 'ETC1 dimensions/metadata');
  assert(rgba.info.join(',') === '2,1,0,0,8,8,256,4,4,64,2,2,16,1,1,4', 'RGBA dimensions/metadata');
  assert(transparent.info.join(',') === '1,1,0,0,8,8,256,4,4,64,2,2,16,1,1,4', 'alpha chooses RGBA');
  assert(compressed.output.length === 56 && rgba.output.length === 340 && transparent.output.length === 340, 'bounded mip outputs');
  const redBlock = [248,0,0,2,255,255,0,0];
  assert(compressed.output.every((byte, i) => byte === redBlock[i % 8]), 'exact ETC1 red blocks across all levels');
  for (const [bytes, a] of [[rgba.output, 255], [transparent.output, 128]]) for (let i = 0; i < bytes.length; i += 4) {
    assert(bytes[i] >= 250 && bytes[i + 1] <= 3 && bytes[i + 2] <= 3 && bytes[i + 3] === a, 'RGBA preserves red and alpha at every mip');
  }
  const reject = (bytes, pattern) => {
    const info = [], message = [], output = native.transcode(bytes, true, info, message);
    const error = new TextDecoder().decode(new Uint8Array(message));
    assert(pattern.test(error) && info.length === 0 && output.length === 0, 'atomic rejection: ' + error);
  };
  reject(new Uint8Array(80), /invalid/);
  reject(opaque.subarray(0, 100), /invalid/);
  reject(new Uint8Array(readBytes('tests/data/three-pi/ktx2/uastc.ktx2')), /ETC1S/);
  const mutate = (offset, value) => { const bytes = opaque.slice(); new DataView(bytes.buffer).setUint32(offset, value, true); return bytes; };
  reject(mutate(20, 4097), /4096/);
  reject(mutate(32, 1), /arrays/);
  reject(mutate(40, 0xffffffff), /invalid/);
  reject(mutate(48, 0xffffffff), /invalid/);
  const overMips = opaque.slice(); new DataView(overMips.buffer).setUint32(20, 1, true); new DataView(overMips.buffer).setUint32(24, 1, true);
  reject(overMips, /mip count/);
  const truncated = opaque.slice(0, opaque.length - 1);
  reject(truncated, /invalid|failed/);
  assert(transcode(opaque, true).output.join(',') === compressed.output.join(','), 'valid decode after errors');
  const largeInfo = [], largeError = [];
  const large = native.transcode(new Uint8Array(readBytes('tests/data/three-pi/ktx2/large.ktx2')), false, largeInfo, largeError);
  assert(!largeError.length && ArrayBuffer.isView(large) && large.length === 129 * 129 * 4, 'large native byte results use typed storage');
  assert(largeInfo.join(',') === '2,1,0,0,129,129,66564' && large[3] === 255 && large[large.length - 1] === 255, 'large result bounds');
  const texture = await new Promise((resolve, reject) => loader.parse(opaque.buffer, resolve, reject));
  assert(texture.isCompressedTexture && texture.format === T.RGB_ETC1_Format && texture.mipmaps.length === 4, 'real compressed texture');
  assert(texture.mipmaps.every(m => m.data instanceof Uint8Array) && texture.colorSpace === T.SRGBColorSpace, 'typed mip bytes and sRGB');
  const other = await new Promise((resolve, reject) => loader.parse(alpha.buffer, resolve, reject));
  assert(other.isDataTexture && other.image.data[3] === 128 && other.colorSpace === T.LinearSRGBColorSpace, 'real alpha texture');
  const dfd = new DataView(alpha.buffer).getUint32(48, true), premultiplied = alpha.slice(); premultiplied[dfd + 15] |= 1;
  const premul = await new Promise((resolve, reject) => loader.parse(premultiplied.buffer, resolve, reject));
  assert(premul.premultiplyAlpha && premul.userData.ktx2.flags === 1, 'DFD premultiplied metadata');
  const incomplete = new Uint8Array(readBytes('tests/data/three-pi/ktx2/incomplete.ktx2'));
  const partialTexture = await new Promise((resolve, reject) => loader.parse(incomplete.buffer, resolve, reject));
  assert(partialTexture.mipmaps.length === 2 && partialTexture.minFilter === T.LinearFilter, 'incomplete mip pyramid is renderable');
  await new Promise(resolve => loader.parse(new ArrayBuffer(0), () => { throw new Error('bad parse succeeded'); }, error => { assert(/KTX2/.test(error.message), 'parse error callback'); resolve(); }));
  for (const t of [texture, other, premul, partialTexture]) t.dispose();
  assert(loader.dispose() === loader, 'dispose is reusable without native handles');
  console.log('three-pi ktx2 PASS', T.REVISION, 'ETC1 56 bytes/7 exact blocks; RGBA 340 bytes/4 mips');
}
