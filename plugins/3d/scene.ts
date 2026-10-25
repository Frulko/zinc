/** Versioned authoring scenes. A revision is prepared completely before it replaces live state. */
import { Scene, Node, Mesh, Camera, mat4, mat4Compose, mat4Multiply } from 'zinc:3d';
import { loadGltf } from 'zinc:3d/gltf';
import { readBytes, exists } from 'zinc:assets';
import { sha256 } from 'zinc:web';
import T from '../three/native/three.spec';

export interface SceneSource { file: string; object: string; }
export interface SceneCamera { fov: number; near: number; far: number; }
export interface SceneBox { shape: string; size: number[]; }
export interface SceneTrigger { shape: string; size: number[]; event: string; }
export interface SceneName { name: string; }
export interface SceneEvent { event: string; }
export interface SceneMetadata {
  camera?: SceneCamera; collision?: SceneBox; trigger?: SceneTrigger;
  socket?: SceneName; spawn?: SceneName; gate?: SceneName; interaction?: SceneEvent;
}
export interface SceneAsset { id: string; uri: string; hash: string; dependencies: string[]; }
export interface SceneRecord {
  id: string; name: string; parent: string | null; asset: string | null;
  translation: number[]; rotation: number[]; scale: number[];
  metadata: SceneMetadata; source: SceneSource;
}
export interface SceneDocument {
  schema: string; version: number; id: string; revision: string;
  source: {tool: string; file: string; scene: string}; assets: SceneAsset[]; nodes: SceneRecord[];
}

function requireScene(ok: boolean, message: string): void { if (!ok) throw new Error('scene: ' + message); }
function identity(value: any, where: string): void { requireScene(typeof value === 'string' && value.trim().length > 0, where + ': missing identity'); }
function path(value: string): void {
  identity(value, 'path');
  requireScene(!value.startsWith('/') && !value.includes('\\') && !value.includes(':') &&
    !value.split('/').some((p: string) => p === '..' || p === '.' || p.length === 0), 'invalid relative path ' + value);
}
function vector(value: number[], count: i32, where: string): void {
  requireScene(Array.isArray(value) && value.length === count, where + ': invalid vector');
  for (const n of value) requireScene(typeof n === 'number' && Number.isFinite(n), where + ': non-finite number');
}
function clone(source: Node): Node {
  const node = new Node(source.mesh, source.material);
  node.position = source.position.slice(); node.rotation = source.rotation.slice(); node.scale = source.scale.slice();
  for (const child of source.children) node.add(clone(child));
  return node;
}
function dispose(source: Node): void {
  const meshes = new Map<i32, Mesh>();
  collectMeshes(source, meshes);
  for (const mesh of meshes.values()) mesh.dispose();
}
function collectMeshes(node: Node, meshes: Map<i32, Mesh>): void {
  if (node.mesh !== null) meshes.set(node.mesh.handle, node.mesh);
  for (const child of node.children) collectMeshes(child, meshes);
}
function bytes(file: string): u8[] {
  if (exists(file)) return readBytes(file);
  const out: u8[] = []; T.readFile(file, out); return out;
}
function digest(file: string): string {
  const hash = sha256(bytes(file)); let out = '';
  for (const b of hash) out += '0123456789abcdef'.at(b >> 4) + '0123456789abcdef'.at(b & 15);
  return out;
}

/** Validates data before any renderer resources are acquired. Publication hashes are checked by tools/scene-exchange. */
export function validateScene(text: string): SceneDocument {
  const d: SceneDocument = JSON.parse(text);
  requireScene(d !== null && d.schema === 'zinc.scene' && d.version === 1, 'unsupported schema/version');
  identity(d.id, 'id'); identity(d.revision, 'revision');
  requireScene(d.revision.length === 64, 'invalid revision');
  path(d.source.file); identity(d.source.tool, 'source.tool'); identity(d.source.scene, 'source.scene');
  requireScene(Array.isArray(d.assets) && Array.isArray(d.nodes), 'assets/nodes must be arrays');
  const assets = new Map<string, SceneAsset>(), nodes = new Map<string, SceneRecord>();
  for (const a of d.assets) {
    identity(a.id, 'asset'); requireScene(!assets.has(a.id), 'duplicate asset identity ' + a.id);
    path(a.uri); requireScene(a.hash.length === 64 && Array.isArray(a.dependencies), a.id + ': invalid hash/dependencies');
    assets.set(a.id, a);
  }
  for (const n of d.nodes) {
    identity(n.id, 'node'); requireScene(!nodes.has(n.id), 'duplicate node identity ' + n.id);
    identity(n.name, n.id + '.name'); path(n.source.file); identity(n.source.object, n.id + '.source.object');
    requireScene(n.parent === null || typeof n.parent === 'string', n.id + ': invalid parent');
    requireScene(n.asset === null || assets.has(n.asset), n.id + ': missing asset reference');
    vector(n.translation, 3, n.id); vector(n.rotation, 4, n.id); vector(n.scale, 3, n.id);
    let norm = 0; for (const q of n.rotation) norm += q * q;
    requireScene(Math.abs(norm - 1) < .001, n.id + ': quaternion must be normalized');
    for (const s of n.scale) requireScene(Math.abs(s) > 1e-9, n.id + ': zero scale');
    requireScene(n.metadata !== null && typeof n.metadata === 'object', n.id + ': missing metadata');
    for (const kind in n.metadata) requireScene(['camera', 'collision', 'trigger', 'socket', 'spawn', 'gate', 'interaction'].includes(kind), n.id + ': unsupported metadata ' + kind);
    const c = n.metadata.camera;
    if (c !== undefined) requireScene(Number.isFinite(c.fov) && Number.isFinite(c.near) && Number.isFinite(c.far) && c.fov > 0 && c.fov < 180 && c.near > 0 && c.far > c.near, n.id + ': invalid camera');
    const box = n.metadata.collision;
    if (box !== undefined) { vector(box.size, 3, n.id); requireScene(box.shape === 'box' && box.size.every((s: number) => s > 0), n.id + ': invalid collision'); }
    const trigger = n.metadata.trigger;
    if (trigger !== undefined) { vector(trigger.size, 3, n.id); requireScene(trigger.shape === 'box' && trigger.size.every((s: number) => s > 0), n.id + ': invalid trigger'); identity(trigger.event, n.id + '.trigger.event'); }
    if (n.metadata.socket !== undefined) identity(n.metadata.socket.name, n.id + '.socket.name');
    if (n.metadata.spawn !== undefined) identity(n.metadata.spawn.name, n.id + '.spawn.name');
    if (n.metadata.gate !== undefined) identity(n.metadata.gate.name, n.id + '.gate.name');
    if (n.metadata.interaction !== undefined) identity(n.metadata.interaction.event, n.id + '.interaction.event');
    nodes.set(n.id, n);
  }
  const visitedAssets = new Set<string>(), activeAssets = new Set<string>();
  for (const a of d.assets) visitAsset(a.id, assets, visitedAssets, activeAssets);
  const visitedNodes = new Set<string>(), activeNodes = new Set<string>();
  for (const n of d.nodes) visitNode(n.id, nodes, visitedNodes, activeNodes);
  return d;
}
function visitAsset(id: string, records: Map<string, SceneAsset>, visited: Set<string>, active: Set<string>): void {
  requireScene(!active.has(id), 'asset cycle at ' + id);
  const record = records.get(id); requireScene(record !== undefined, 'missing asset reference ' + id);
  if (visited.has(id) || record === undefined) return;
  active.add(id); for (const dependency of record.dependencies) visitAsset(dependency, records, visited, active);
  active.delete(id); visited.add(id);
}
function visitNode(id: string, records: Map<string, SceneRecord>, visited: Set<string>, active: Set<string>): void {
  requireScene(!active.has(id), 'node cycle at ' + id);
  const record = records.get(id); requireScene(record !== undefined, 'missing parent reference ' + id);
  if (visited.has(id) || record === undefined) return;
  active.add(id); if (record.parent !== null) visitNode(record.parent, records, visited, active);
  active.delete(id); visited.add(id);
}

export class SceneRevision {
  scene = new Scene();
  nodes = new Map<string, Node>();
  document: SceneDocument | null = null;
  /** Program-owned per-node state. Retained only when asset identity and component schema match. */
  state = new Map<string, string>();
  error = '';
  private assets = new Map<string, Node>();
  private hashes = new Map<string, string>();

  reload(text: string, base: string): boolean {
    const acquired = new Map<string, Node>();
    try {
      const d = validateScene(text), assets = new Map<string, Node>(), hashes = new Map<string, string>();
      for (const a of d.assets) {
        const file = base + a.uri;
        requireScene(digest(file) === a.hash, a.id + ': content hash mismatch: ' + a.uri);
        let source = this.hashes.get(a.id) === a.hash ? this.assets.get(a.id) : undefined;
        if (source === undefined) { source = loadGltf(file); acquired.set(a.id, source); }
        assets.set(a.id, source); hashes.set(a.id, a.hash);
      }
      const scene = new Scene(), nodes = new Map<string, Node>(), state = new Map<string, string>();
      const previous = new Map<string, SceneRecord>();
      if (this.document !== null && this.document.id === d.id) for (const n of this.document.nodes) previous.set(n.id, n);
      for (const n of d.nodes) {
        const source = n.asset === null ? undefined : assets.get(n.asset);
        const node = source === undefined ? new Node(null, null) : clone(source);
        node.position = n.translation.slice(); node.rotation = n.rotation.slice(); node.scale = n.scale.slice();
        nodes.set(n.id, node);
        const old = previous.get(n.id), value = this.state.get(n.id);
        if (old !== undefined && value !== undefined && old.asset === n.asset && componentSignature(old.metadata) === componentSignature(n.metadata)) state.set(n.id, value);
      }
      for (const n of d.nodes) {
        const node = nodes.get(n.id); if (node === undefined) continue;
        const parent = n.parent === null ? scene : nodes.get(n.parent);
        if (parent !== undefined) parent.add(node);
      }
      for (const id of this.assets.keys()) if (this.hashes.get(id) !== hashes.get(id)) { const old = this.assets.get(id); if (old !== undefined) dispose(old); }
      this.scene = scene; this.nodes = nodes; this.state = state; this.assets = assets; this.hashes = hashes; this.document = d; this.error = '';
      return true;
    } catch (e) {
      for (const source of acquired.values()) dispose(source);
      this.error = (e as Error).message; return false;
    }
  }

  cameraFor(id: string): Camera {
    const d = this.document; requireScene(d !== null, 'no scene');
    const camera = new Camera();
    if (d === null) return camera;
    const records = new Map<string, SceneRecord>(); for (const n of d.nodes) records.set(n.id, n);
    const record = records.get(id); requireScene(record !== undefined, 'missing camera ' + id);
    if (record === undefined) return camera;
    const settings = record.metadata.camera; requireScene(settings !== undefined, id + ': not a camera');
    const m = worldMatrix(record, records);
    camera.position = [m[12], m[13], m[14]];
    camera.target = [m[12] - m[8], m[13] - m[9], m[14] - m[10]];
    camera.up = [m[4], m[5], m[6]];
    if (settings !== undefined) { camera.fov = settings.fov; camera.near = settings.near; camera.far = settings.far; }
    return camera;
  }

  dispose(): void { for (const source of this.assets.values()) dispose(source); this.assets.clear(); this.hashes.clear(); this.nodes.clear(); this.state.clear(); this.scene = new Scene(); this.document = null; }
}
function worldMatrix(record: SceneRecord, records: Map<string, SceneRecord>): number[] {
  const local = mat4Compose(mat4(), record.translation, record.rotation, record.scale);
  const parent = record.parent === null ? undefined : records.get(record.parent);
  return parent === undefined ? local : mat4Multiply(mat4(), worldMatrix(parent, records), local);
}

function componentSignature(m: SceneMetadata): string {
  return `${m.camera !== undefined}:${m.collision !== undefined}:${m.trigger !== undefined}:${m.socket !== undefined}:${m.spawn !== undefined}:${m.gate !== undefined}:${m.interaction !== undefined}`;
}
