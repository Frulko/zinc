// Makes lighthouse.glb, the model of this example: `node make-lighthouse.mjs` (written for Zinc, public domain, CC0).
// The lighthouse is a profile turned around the vertical axis: each line is [radius, height, colour of the band that ends there].
const profile = [
  [0, 0], [1.7, 0, 0x4a5a48], [1.5, 0.22, 0x5d7052], [0.75, 0.42, 0x6f8560],          // the island
  [0.5, 0.42, 0x6f8560], [0.46, 0.9, 0xf2efe6], [0.42, 1.4, 0xc8372d], [0.38, 1.9, 0xf2efe6], [0.34, 2.4, 0xc8372d],   // the tower, in stripes
  [0.5, 2.4, 0x2b2f3a], [0.5, 2.5, 0x2b2f3a], [0.27, 2.5, 0x2b2f3a],                 // the gallery
  [0.27, 2.85, 0xffe9a0], [0.4, 2.85, 0x2b2f3a], [0, 3.3, 0xc8372d],                 // the lantern and its roof
];
const AROUND = 24;
const linear = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };   // glTF colours are linear, the hex above is sRGB

const position = [], normal = [], colour = [], index = [];
for (let s = 1; s < profile.length; s++) {
  const [r0, y0] = profile[s - 1], [r1, y1, hex] = profile[s];
  const length = Math.hypot(r1 - r0, y1 - y0), out = (y1 - y0) / length, up = (r0 - r1) / length, first = position.length / 3;
  for (let i = 0; i <= AROUND; i++) {
    const a = i / AROUND * 2 * Math.PI, cos = Math.cos(a), sin = Math.sin(a);
    for (const [r, y] of [[r0, y0], [r1, y1]]) {
      position.push(r * cos, y, r * sin);
      normal.push(out * cos, up, out * sin);
      colour.push(linear(hex >> 16), linear(hex >> 8 & 255), linear(hex & 255));
    }
    if (i < AROUND) { const v = first + 2 * i; index.push(v, v + 1, v + 2, v + 2, v + 1, v + 3); }
  }
}

const vertices = position.length / 3;
const floats = new Float32Array([...position, ...normal, ...colour]), shorts = new Uint16Array(index);
const bin = Buffer.concat([Buffer.from(floats.buffer), Buffer.from(shorts.buffer)]);
const view = (n, target) => ({ buffer: 0, byteOffset: n * vertices * 12, byteLength: vertices * 12, target });
const ys = profile.map(p => p[1]), rs = profile.map(p => p[0]), R = Math.max(...rs);
const gltf = {
  asset: { version: '2.0', generator: 'make-lighthouse.mjs', copyright: 'CC0' },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'lighthouse', mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, indices: 3, material: 0 }] }],
  materials: [{ name: 'paint', pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.8 } }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: vertices, type: 'VEC3', min: [-R, Math.min(...ys), -R], max: [R, Math.max(...ys), R] },
    { bufferView: 1, componentType: 5126, count: vertices, type: 'VEC3' },
    { bufferView: 2, componentType: 5126, count: vertices, type: 'VEC3' },
    { bufferView: 3, componentType: 5123, count: index.length, type: 'SCALAR' },
  ],
  bufferViews: [view(0, 34962), view(1, 34962), view(2, 34962), { buffer: 0, byteOffset: vertices * 36, byteLength: index.length * 2, target: 34963 }],
  buffers: [{ byteLength: bin.length }],
};

// A .glb is a 12-byte header, then the JSON and the binary chunks, each padded to four bytes.
const pad = (b, fill) => Buffer.concat([b, Buffer.alloc((4 - b.length % 4) % 4, fill)]);
const chunk = (type, data) => { const head = Buffer.alloc(8); head.writeUInt32LE(data.length, 0); head.write(type, 4, 'latin1'); return Buffer.concat([head, data]); };
const body = Buffer.concat([chunk('JSON', pad(Buffer.from(JSON.stringify(gltf)), 0x20)), chunk('BIN\0', pad(bin, 0))]);
const header = Buffer.alloc(12);
header.write('glTF', 0, 'latin1'); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + body.length, 8);
const file = new URL('lighthouse.glb', import.meta.url);
(await import('node:fs')).writeFileSync(file, Buffer.concat([header, body]));
console.log('lighthouse.glb:', vertices, 'vertices,', index.length / 3, 'triangles,', 12 + body.length, 'bytes');
