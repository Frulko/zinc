import { TIER } from 'zinc:platform';
import { BufferAttribute, BufferGeometry, Uint16BufferAttribute } from 'three';

const LIMIT = 65535;
const invalid = message => { throw new Error('zinc:three-pi: ' + message); };

function readable(attribute, count) {
  const interleaved = attribute.isInterleavedBufferAttribute;
  const array = interleaved ? attribute.data.array : attribute.array;
  if (!array || !ArrayBuffer.isView(array) || array instanceof DataView ||
      !Number.isInteger(attribute.itemSize) || attribute.itemSize < 1 ||
      attribute.count !== count || attribute.isInstancedBufferAttribute ||
      (interleaved && attribute.data.isInstancedInterleavedBuffer)) invalid('expected matching CPU vertex attributes');
  const stride = interleaved ? attribute.data.stride : attribute.itemSize;
  const offset = interleaved ? attribute.offset : 0;
  if (!Number.isSafeInteger(stride) || stride < attribute.itemSize ||
      !Number.isSafeInteger(offset) || offset < 0 || offset + attribute.itemSize > stride ||
      (count > 0 && (count - 1) * stride + offset + attribute.itemSize > array.length)) invalid('invalid vertex storage');
  return attribute;
}

function remap(attribute, vertices) {
  const interleaved = attribute.isInterleavedBufferAttribute;
  const source = interleaved ? attribute.data.array : attribute.array;
  const stride = interleaved ? attribute.data.stride : attribute.itemSize;
  const offset = interleaved ? attribute.offset : 0;
  const array = new source.constructor(vertices.length * attribute.itemSize);
  for (let i = 0; i < vertices.length; i++) {
    for (let c = 0; c < attribute.itemSize; c++) array[i * attribute.itemSize + c] = source[vertices[i] * stride + offset + c];
  }
  // Raw storage preserves normalized integers (getX would decode them a second time).
  const result = interleaved ? new BufferAttribute(array, attribute.itemSize, attribute.normalized) :
    new attribute.constructor(array, attribute.itemSize, attribute.normalized);
  result.name = attribute.name;
  result.setUsage(interleaved ? attribute.data.usage : attribute.usage);
  if (attribute.gpuType !== undefined) result.gpuType = attribute.gpuType;
  return result;
}

// Triangle geometry only. Callers own mesh/skeleton/morph state and source resources.
export function splitGeometry(geometry) {
  if (TIER !== 2) return [geometry];
  if (geometry.isInstancedBufferGeometry) invalid('instanced geometry is not triangle geometry');
  const position = geometry.getAttribute('position');
  if (!position || !Number.isInteger(position.count)) invalid('geometry needs CPU positions');
  const count = position.count;
  for (const attribute of Object.values(geometry.attributes)) readable(attribute, count);
  for (const attributes of Object.values(geometry.morphAttributes)) for (const attribute of attributes) readable(attribute, count);
  const index = geometry.index;
  if (index && (!index.array || index.itemSize !== 1 || index.normalized)) invalid('expected integer scalar indices');
  const size = index ? index.count : count;
  const range = geometry.drawRange;
  const validRange = (start, length) => Number.isSafeInteger(start) && start >= 0 &&
    (length === Infinity || (Number.isSafeInteger(length) && length >= 0));
  if (!validRange(range.start, range.count)) invalid('invalid drawRange');
  const start = Math.min(size, range.start);
  const end = start + Math.max(0, Math.floor((Math.min(size, range.start + range.count) - start) / 3) * 3);
  const groups = geometry.groups.map(group => {
    if (!validRange(group.start, group.count) || !Number.isSafeInteger(group.materialIndex) || group.materialIndex < 0) invalid('invalid material group');
    const first = Math.min(end, Math.max(start, group.start));
    const last = Math.min(end, group.start + group.count);
    return { start: first, end: first + Math.max(0, Math.floor((last - first) / 3) * 3), materialIndex: group.materialIndex };
  });
  // Validate before narrowing: typed arrays silently truncate invalid indices.
  for (let i = start; i < end; i++) {
    const vertex = index ? index.array[i] : i;
    if (!Number.isSafeInteger(vertex) || vertex < 0 || vertex >= count) invalid('index outside vertex attributes');
  }
  if (start === end) return [];
  if (count <= LIMIT && (!index || (index.array instanceof Uint16Array && !index.array.includes(LIMIT)))) return [geometry];
  // One index stream serves scalar materials too; groups may overlap or leave gaps.
  if (groups.some(group => group.start < group.end && (group.start - start) % 3)) invalid('group triangles must align with the effective drawRange');
  const chunks = [];
  let lookup = new Map(), vertices = [], indices = [], chunkStart = start;
  const flush = () => {
    if (!indices.length) return;
    const chunk = new BufferGeometry();
    chunk.name = geometry.name;
    chunk.userData = { ...geometry.userData };
    for (const [name, attribute] of Object.entries(geometry.attributes)) chunk.setAttribute(name, remap(attribute, vertices));
    for (const [name, attributes] of Object.entries(geometry.morphAttributes)) chunk.morphAttributes[name] = attributes.map(attribute => remap(attribute, vertices));
    chunk.morphTargetsRelative = geometry.morphTargetsRelative;
    chunk.setIndex(new Uint16BufferAttribute(indices, 1));
    for (const group of groups) {
      const first = Math.max(group.start, chunkStart), last = Math.min(group.end, chunkStart + indices.length);
      if (last > first) chunk.addGroup(first - chunkStart, last - first, group.materialIndex);
    }
    chunks.push(chunk);
    chunkStart += indices.length;
    lookup = new Map(); vertices = []; indices = [];
  };
  for (let i = start; i < end; i += 3) {
    const triangle = [0, 1, 2].map(c => index ? index.array[i + c] : i + c);
    const additions = new Set(triangle.filter(vertex => !lookup.has(vertex))).size;
    if (vertices.length + additions > LIMIT) flush();
    for (const vertex of triangle) {
      if (!lookup.has(vertex)) { lookup.set(vertex, vertices.length); vertices.push(vertex); }
      indices.push(lookup.get(vertex));
    }
  }
  flush();
  return chunks;
}

// Call after setting final lighting/environment and before the first production render.
export function warmUp(renderer, scene, camera) {
  if (TIER !== 2) return renderer;
  renderer.compile(scene, camera);
  renderer.debug.checkShaderErrors = false;
  return renderer;
}
