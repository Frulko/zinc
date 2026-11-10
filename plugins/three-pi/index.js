import { TIER } from 'zinc:platform';
import { BufferAttribute, BufferGeometry, Uint16BufferAttribute, Float32BufferAttribute, Material,
  Mesh, Object3D, MeshBasicMaterial, MeshLambertMaterial, MeshPhongMaterial, MeshStandardMaterial, MeshPhysicalMaterial, NormalBlending } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { NativeKTX2Loader } from './ktx2-loader.js';

export function createKTX2Loader(renderer, ordinaryLoader) {
  if (TIER !== 2) return ordinaryLoader;
  return new NativeKTX2Loader(ordinaryLoader.manager).setPath(ordinaryLoader.path)
    .setRequestHeader(ordinaryLoader.requestHeader).setWithCredentials(ordinaryLoader.withCredentials).detectSupport(renderer);
}

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

// A call-local identity map preserves sharing without retaining app resources globally.
export function downgradeMaterials(scene) {
  if (TIER !== 2) return scene;
  const converted = new Map(), replacements = [];
  const convert = source => {
    if (!source || (source.constructor !== MeshStandardMaterial && source.constructor !== MeshPhysicalMaterial) ||
        source.onBeforeCompile !== Material.prototype.onBeforeCompile ||
        source.onBeforeRender !== Material.prototype.onBeforeRender ||
        source.customProgramCacheKey !== Material.prototype.customProgramCacheKey) return source;
    if (!converted.has(source)) {
      const material = new MeshLambertMaterial();
      Material.prototype.copy.call(material, source);
      material.color.copy(source.color);
      material.emissive.copy(source.emissive);
      for (const key of ['map', 'emissiveMap', 'emissiveIntensity', 'lightMap', 'lightMapIntensity',
        'aoMap', 'aoMapIntensity', 'alphaMap', 'fog', 'wireframe', 'wireframeLinewidth', 'wireframeLinecap', 'wireframeLinejoin']) material[key] = source[key];
      // VC4 lacks derivatives for flat shading, normal/bump maps, alpha hashing and coverage.
      material.alphaHash = false;
      material.alphaToCoverage = false;
      material.flatShading = false;
      converted.set(source, material);
    }
    return converted.get(source);
  };
  scene.traverse(object => {
    if (!object.isMesh) return;
    const source = object.material;
    const material = Array.isArray(source) ? source.map(convert) : convert(source);
    if (Array.isArray(source) ? source.some((value, i) => value !== material[i]) : source !== material) replacements.push([object, material]);
  });
  for (const [object, material] of replacements) object.material = material;
  return scene;
}

const renderKeys = ['visible', 'castShadow', 'receiveShadow', 'renderOrder', 'frustumCulled'];
const hooks = ['onBeforeRender', 'onAfterRender', 'onBeforeShadow', 'onAfterShadow'];
function mergeable(mesh) {
  const geometry = mesh.geometry, material = mesh.material;
  if (mesh.constructor !== Mesh || mesh.userData.static !== true || mesh.children.length || mesh.animations.length ||
      mesh.matrixWorldAutoUpdate === false || mesh.customDepthMaterial || mesh.customDistanceMaterial ||
      hooks.some(key => mesh[key] !== Object3D.prototype[key]) || !geometry ||
      geometry.isInstancedBufferGeometry || Object.keys(geometry.morphAttributes).length ||
      mesh.morphTargetInfluences || Array.isArray(material) || !material || material.transparent ||
      material.blending !== NormalBlending || !material.depthTest || !material.depthWrite || material.stencilWrite ||
      ![MeshBasicMaterial, MeshLambertMaterial, MeshPhongMaterial, MeshStandardMaterial, MeshPhysicalMaterial].includes(material.constructor) ||
      material.onBeforeCompile !== Material.prototype.onBeforeCompile ||
      material.onBeforeRender !== Material.prototype.onBeforeRender ||
      material.customProgramCacheKey !== Material.prototype.customProgramCacheKey ||
      geometry.groups.length || geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) return false;
  const position = geometry.attributes.position;
  if (!position || position.itemSize !== 3) return false;
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    // Baking transforms into integer/half-float storage would round or corrupt positions/normals/tangents.
    if (attribute.isInterleavedBufferAttribute || attribute.isInstancedBufferAttribute ||
        !attribute.array || !ArrayBuffer.isView(attribute.array) || attribute.array instanceof DataView ||
        !Number.isSafeInteger(attribute.itemSize) || attribute.itemSize < 1 || attribute.count !== position.count ||
        !(attribute.constructor === BufferAttribute || attribute.constructor === Float32BufferAttribute) ||
        (['position', 'normal', 'tangent'].includes(name) &&
          (attribute.normalized || !(attribute.array instanceof Float32Array || attribute.array instanceof Float64Array) ||
           attribute.itemSize !== (name === 'tangent' ? 4 : 3)))) return false;
  }
  const index = geometry.index;
  if (index) {
    if (!index.array || index.itemSize !== 1 || index.normalized) return false;
    for (const value of index.array) if (!Number.isSafeInteger(value) || value < 0 || value >= position.count) return false;
  }
  if ((index ? index.count : position.count) % 3) return false;
  if (mesh.matrixAutoUpdate) mesh.updateMatrix();
  const determinant = mesh.matrix.determinant();
  // Reflections reverse winding/handedness; leave them and singular transforms to the caller.
  return mesh.matrix.elements.every(Number.isFinite) && Number.isFinite(determinant) && determinant > 0;
}

function compatible(a, b) {
  if (a.material !== b.material || a.layers.mask !== b.layers.mask || renderKeys.some(key => a[key] !== b[key])) return false;
  const ga = a.geometry, gb = b.geometry;
  if ((ga.index === null) !== (gb.index === null)) return false;
  const names = Object.keys(ga.attributes);
  return names.length === Object.keys(gb.attributes).length && names.every(name => {
    const x = ga.attributes[name], y = gb.attributes[name];
    return y && x.array.constructor === y.array.constructor && x.itemSize === y.itemSize &&
      x.normalized === y.normalized && x.gpuType === y.gpuType && x.usage === y.usage;
  });
}

// Only explicitly static, compatible direct children are candidates. Unsupported meshes stay intact.
export function mergeStaticMeshes(parent) {
  if (TIER !== 2) return parent;
  const batches = [], replacements = [];
  for (const mesh of parent.children) {
    if (!mergeable(mesh)) continue;
    let batch = batches.find(group => compatible(group[0], mesh));
    if (!batch) { batch = []; batches.push(batch); }
    batch.push(mesh);
  }
  // Prepare every result before touching the scene. Never release shared source resources.
  for (const batch of batches) {
    if (batch.length < 2) continue;
    const geometries = batch.map(mesh => mesh.geometry.clone().applyMatrix4(mesh.matrix));
    const merged = mergeGeometries(geometries, false);
    if (!merged) invalid('static geometry merge failed');
    for (const [name, attribute] of Object.entries(merged.attributes)) {
      const source = batch[0].geometry.attributes[name];
      attribute.setUsage(source.usage);
      attribute.name = source.name;
      if (source.gpuType !== undefined) attribute.gpuType = source.gpuType;
    }
    const meshes = splitGeometry(merged).map(geometry => {
      const mesh = new Mesh(geometry, batch[0].material);
      for (const key of renderKeys) mesh[key] = batch[0][key];
      mesh.layers.mask = batch[0].layers.mask;
      mesh.userData.static = true;
      return mesh;
    });
    replacements.push({ batch, meshes });
  }
  for (const { batch, meshes } of replacements) {
    for (const mesh of batch) parent.remove(mesh);
    for (const mesh of meshes) parent.add(mesh);
  }
  return parent;
}
