import * as T from 'three';
import { TIER } from 'zinc:platform';
import { splitGeometry, warmUp } from 'zinc:three-pi';
const assert = (value, message) => { if (!value) throw new Error(message); };
const rejects = fn => { let threw = false; try { fn(); } catch { threw = true; } assert(threw, 'expected rejection'); };
const geometry = count => {
  const g = new T.BufferGeometry(), p = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) p[i * 3] = i;
  return g.setAttribute('position', new T.BufferAttribute(p, 3));
};
const g = geometry(65538);
const raw = new Uint8Array(65538 * 5);
for (let i = 0; i < 65538; i++) raw[i * 5 + 1] = i % 251;
g.setAttribute('color', new T.InterleavedBufferAttribute(new T.InterleavedBuffer(raw, 5), 3, 1, true));
const skin = new T.Uint16BufferAttribute(new Uint16Array(65538 * 4).fill(7), 4);
skin.gpuType = T.IntType;
g.setAttribute('skinIndex', skin);
g.morphAttributes.position = [g.attributes.position.clone()]; g.morphTargetsRelative = true;
g.setIndex(new T.Uint32BufferAttribute(Array.from({ length: 65538 }, (_, i) => i), 1));
g.addGroup(0, 65535, 2); g.addGroup(65535, 3, 7);
const renderer = { debug: { checkShaderErrors: true }, compile(s, c) { assert(s === g && c === g, 'compile arguments'); this.calls = (this.calls || 0) + 1; } };
const chunks = splitGeometry(g);
if (TIER !== 2) {
  assert(chunks.length === 1 && chunks[0] === g && g.index.array instanceof Uint32Array, 'high-tier identity');
  assert(warmUp(renderer, g, g) === renderer && renderer.debug.checkShaderErrors && !renderer.calls, 'high-tier warmup no-op');
} else {
  assert(chunks.length === 2, 'split at triangle boundary');
  let source = 0;
  for (const chunk of chunks) {
    assert(chunk.attributes.position.count <= 65535 && chunk.index.array instanceof Uint16Array, '16-bit vertices/index');
    assert(chunk.morphTargetsRelative && chunk.attributes.skinIndex.gpuType === T.IntType, 'flags');
    for (let i = 0; i < chunk.index.count; i++, source++) {
      const v = chunk.index.array[i];
      assert(v <= 65534 && chunk.attributes.position.getX(v) === source, 'ordered triangles');
      assert(chunk.attributes.color.array[v * 3] === source % 251 && chunk.attributes.color.normalized, 'raw interleaved color');
      assert(chunk.attributes.skinIndex.getX(v) === 7 && chunk.morphAttributes.position[0].getX(v) === source, 'skin/morph remap');
    }
  }
  assert(source === 65538 && chunks[0].groups[0].materialIndex === 2 && chunks[1].groups[0].materialIndex === 7, 'material spans');
  const boundary = geometry(65535);
  assert(splitGeometry(boundary)[0] === boundary, '65535 boundary');
  const repeat = geometry(65538);
  repeat.setIndex(new T.Uint32BufferAttribute(new Uint32Array(120000).map((_, i) => [65537, 0, 65536][i % 3]), 1));
  const compact = splitGeometry(repeat);
  assert(compact.length === 1 && compact[0].attributes.position.count === 3 && compact[0].index.count === 120000, 'index count is not vertex count');
  repeat.setDrawRange(3, 9); repeat.addGroup(0, 6, 1); repeat.addGroup(6, 12, 2);
  const drawn = splitGeometry(repeat)[0];
  assert(drawn.index.count === 9 && drawn.groups[0].count === 3 && drawn.groups[1].count === 6, 'drawRange intersections');
  const edge = geometry(65536); edge.setIndex(new T.Uint32BufferAttribute([65535, 0, 1], 1));
  assert(splitGeometry(edge)[0].attributes.position.count === 3, '65536 boundary with high reference');
  const nonindexed = splitGeometry(geometry(65538));
  assert(nonindexed.length === 2 && nonindexed[1].index.count === 3, 'nonindexed split');
  const grouped = geometry(9); grouped.setIndex(new T.Uint32BufferAttribute([0,1,2,3,4,5,6,7,8], 1));
  grouped.addGroup(3, 3, 1); grouped.addGroup(3, 6, 2);
  const groupChunk = splitGeometry(grouped)[0];
  assert(groupChunk.index.count === 9 && groupChunk.attributes.position.getX(0) === 0, 'scalar material keeps gapped/overlapping index stream');
  assert(groupChunk.groups[0].start === 3 && groupChunk.groups[0].count === 3 && groupChunk.groups[1].start === 3 && groupChunk.groups[1].count === 6, 'array material group ranges retained');
  const empty = geometry(3); empty.setDrawRange(0, 0); assert(splitGeometry(empty).length === 0, 'empty small draw');
  grouped.clearGroups(); grouped.addGroup(1, 3, 0); rejects(() => splitGeometry(grouped));
  const bad = geometry(3); bad.setIndex(new T.BufferAttribute(new Float32Array([0, 1.5, 2]), 1));
  rejects(() => splitGeometry(bad));
  bad.setIndex(new T.Uint32BufferAttribute([0, 1, 3], 1)); rejects(() => splitGeometry(bad));
  bad.setIndex(null); bad.setAttribute('uv', new T.Float32BufferAttribute([0, 0], 2)); rejects(() => splitGeometry(bad));
  assert(warmUp(renderer, g, g) === renderer && renderer.calls === 1 && !renderer.debug.checkShaderErrors, 'warmup');
  const failed = { debug: { checkShaderErrors: true }, compile() { throw new Error('compile'); } };
  rejects(() => warmUp(failed, g, g)); assert(failed.debug.checkShaderErrors, 'failure retains diagnostics');
}
console.log('three-pi split PASS', T.REVISION, TIER);
