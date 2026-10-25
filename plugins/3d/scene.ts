/** Versioned authoring scenes. A revision is prepared completely before it replaces live state. */
import { Scene, Node, Mesh, Camera, World, mat4, mat4Compose, mat4Multiply } from 'zinc:3d';
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
export interface SceneWorld { cell: number; levels?: string[]; }
export interface SceneWorldChunk { uri: string; hash: string; level: number; }
export interface SceneWorldSource { id: string; node: string; file: string; level: number; in: any[]; }
export interface SceneWorldProvenance { sources: SceneWorldSource[]; logicalNodes: SceneRecord[]; sourceAssets: SceneAsset[]; }
export interface CompiledSceneWorld {
  id: string; uri: string; hash: string; cell: number; cells: number; levels: string[];
  chunks: SceneWorldChunk[]; provenance: SceneWorldProvenance;
}
export interface SceneMetadata {
  camera?: SceneCamera; collision?: SceneBox; trigger?: SceneTrigger;
  socket?: SceneName; spawn?: SceneName; gate?: SceneName; interaction?: SceneEvent;
  world?: SceneWorld;
}
export interface SceneClipEvent { clip: string; time: number; name: string; }
export interface SceneSocket { name: string; joint: string; translation: number[]; }
export interface SceneAsset {
  id: string; uri: string; hash: string; dependencies: string[]; kind?: string;
  rootMotion?: string; events?: SceneClipEvent[]; sockets?: SceneSocket[];
  source?: SceneSource;
}
export interface SceneRecord {
  id: string; name: string; parent: string | null; asset: string | null;
  translation: number[]; rotation: number[]; scale: number[];
  metadata: SceneMetadata; source: SceneSource;
  dynamic?: boolean;
  /** Global matrix on fused provenance nodes; ordinary entities use local TRS. */
  matrix?: number[];
}
export interface SceneDocument {
  schema: string; version: number; id: string; revision: string;
  source: {tool: string; file: string; scene: string}; assets: SceneAsset[]; nodes: SceneRecord[];
  compiled?: string; worlds?: CompiledSceneWorld[]; worldSources?: {world:string;uri?:string;node?:string;source?:SceneSource}[];
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
  const raw: any = JSON.parse(text);
  if (raw === null || raw.schema !== 'zinc.scene') throw new Error('scene: unsupported schema/version');
  if (raw.version !== 1) throw new Error('scene: unsupported schema/version');
  const d: SceneDocument = raw;
  identity(d.id, 'id'); identity(d.revision, 'revision');
  requireScene(d.revision.length === 64, 'invalid revision');
  path(d.source.file); identity(d.source.tool, 'source.tool'); identity(d.source.scene, 'source.scene');
  requireScene(Array.isArray(d.assets) && Array.isArray(d.nodes), 'assets/nodes must be arrays');
  const assets = new Map<string, SceneAsset>(), nodes = new Map<string, SceneRecord>();
  for (const a of d.assets) {
    identity(a.id, 'asset'); requireScene(!assets.has(a.id), 'duplicate asset identity ' + a.id);
    path(a.uri); requireScene(a.hash.length === 64 && Array.isArray(a.dependencies), a.id + ': invalid hash/dependencies');
    requireScene(a.kind === undefined || a.kind === 'model' || a.kind === 'skin', a.id + ': unsupported asset kind');
    if (a.kind === 'skin') {
      requireScene(a.source !== undefined, a.id + ': missing animation provenance');
      if (a.source !== undefined) { path(a.source.file); identity(a.source.object,a.id); }
      const rawAsset: any = a;
      requireScene(a.rootMotion === 'controller' && Array.isArray(rawAsset.events) && Array.isArray(rawAsset.sockets), a.id + ': invalid animation metadata');
      if (a.events !== undefined) for (const e of a.events) { identity(e.clip, a.id); identity(e.name, a.id); requireScene(Number.isFinite(e.time) && e.time >= 0, a.id + ': invalid event time'); }
      if (a.sockets !== undefined) for (const s of a.sockets) { identity(s.name, a.id); identity(s.joint, a.id); vector(s.translation,3,a.id); }
    }
    assets.set(a.id, a);
  }
  for (const n of d.nodes) {
    identity(n.id, 'node'); requireScene(!nodes.has(n.id), 'duplicate node identity ' + n.id);
    identity(n.name, n.id + '.name'); path(n.source.file); identity(n.source.object, n.id + '.source.object');
    requireScene(n.parent === null || typeof n.parent === 'string', n.id + ': invalid parent');
    requireScene(n.asset === null || assets.has(n.asset), n.id + ': missing asset reference');
    const referenced = n.asset === null ? undefined : assets.get(n.asset);
    if (referenced !== undefined && referenced.kind === 'skin') requireScene(n.dynamic === true, n.id + ': skinned instance must be dynamic');
    vector(n.translation, 3, n.id); vector(n.rotation, 4, n.id); vector(n.scale, 3, n.id);
    let norm = 0; for (const q of n.rotation) norm += q * q;
    requireScene(Math.abs(norm - 1) < .001, n.id + ': quaternion must be normalized');
    for (const s of n.scale) requireScene(Math.abs(s) > 1e-9, n.id + ': zero scale');
    requireScene(n.metadata !== null && typeof n.metadata === 'object', n.id + ': missing metadata');
    for (const kind in n.metadata) requireScene(['camera', 'collision', 'trigger', 'socket', 'spawn', 'gate', 'interaction', 'world'].includes(kind), n.id + ': unsupported metadata ' + kind);
    if (n.metadata.world !== undefined) {
      requireScene(Number.isFinite(n.metadata.world.cell) && n.metadata.world.cell > 0, n.id + ': world.cell must be positive finite metres');
      if(n.metadata.world.levels!==undefined)worldLevels(n.metadata.world.levels,n.id);
    }
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
  if(d.worlds!==undefined){
    const raw:any=d;requireScene(d.compiled==='zworld-v1'&&Array.isArray(raw.worlds),'unsupported compiled world data');
    const worlds=new Set<string>();
    for(const w of d.worlds){
      identity(w.id,'world');requireScene(!worlds.has(w.id),'duplicate world '+w.id);worlds.add(w.id);
      const marker=nodes.get(w.id);requireScene(marker!==undefined&&marker.metadata.world!==undefined,'world marker missing '+w.id);
      path(w.uri);requireScene(w.hash.length===64&&Number.isFinite(w.cell)&&w.cell>0&&w.cells>=0&&Math.floor(w.cells)===w.cells,w.id+': invalid world record');worldLevels(w.levels,w.id);
      requireScene(Array.isArray(w.chunks)&&Array.isArray(w.provenance.sources)&&Array.isArray(w.provenance.logicalNodes),w.id+': world tables missing');
      for(const chunk of w.chunks){path(chunk.uri);requireScene(chunk.hash.length===64&&chunk.level>=0&&chunk.level<3&&Math.floor(chunk.level)===chunk.level,w.id+': invalid world chunk');}
      for(const row of w.provenance.sources){identity(row.id,w.id);path(row.file);requireScene(Array.isArray(row.in),w.id+': invalid world source locations');}
      for(const row of w.provenance.logicalNodes){identity(row.id,w.id);path(row.source.file);identity(row.source.object,w.id);}

    }
  }
  return d;
}
function worldLevels(levels:string[],id:string):void {
  requireScene(Array.isArray(levels)&&levels.length>0&&levels.length<=3,id+': world.levels must be included near/mid/far names');
  const seen=new Set<string>();for(const level of levels){requireScene((level==='near'||level==='mid'||level==='far')&&!seen.has(level),id+': invalid/duplicate world level');seen.add(level);}
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
  private dynamicNodes = new Map<string, Node>();
  worlds = new Map<string,World>();
  private worldHashes=new Map<string,string>();
  private worldAhead:number[]=[];
  /** Optional per-instance skinned asset boundary. Factories own cleanup if they throw before returning a node. */
  skinFactory: ((record: SceneRecord, asset: SceneAsset, file: string) => Node) | null = null;
  skinDisposer: ((node: Node) => void) | null = null;

  reload(text: string, base: string): boolean {
    const acquired = new Map<string, Node>();
    const acquiredDynamic = new Map<string, Node>();
    const acquiredWorlds = new Map<string,World>();
    try {
      const d = validateScene(text), assets = new Map<string, Node>(), hashes = new Map<string, string>();
      const worldRecords=new Map<string,CompiledSceneWorld>();if(d.worlds!==undefined)for(const w of d.worlds)worldRecords.set(w.id,w);
      for (const n of d.nodes) requireScene(n.metadata.world === undefined||worldRecords.has(n.id), n.id + ': world publication requires .zworld output from zinc assets build; raw static descendants cannot be individual entities');
      const worlds=new Map<string,World>(),worldHashes=new Map<string,string>();
      for(const record of worldRecords.values()){
        requireScene(digest(base+record.uri)===record.hash,record.id+': world index hash mismatch');
        let fingerprint=base+record.uri+record.hash;
        for(const chunk of record.chunks){requireScene(digest(base+chunk.uri)===chunk.hash,record.id+': world chunk hash mismatch: '+chunk.uri);fingerprint+=chunk.uri+chunk.hash;}
        let world=this.worldHashes.get(record.id)===fingerprint&&this.worlds.has(record.id)?this.worlds.get(record.id):undefined;
        if(world===undefined){
          world=new World(base+record.uri);acquiredWorlds.set(record.id,world);
          requireScene(world.chunkCount===record.chunks.length,record.id+': world chunk table mismatch');
          // shortcut: eager validation decodes every chunk once; add background staging when measured large scenes need it.
          let coarse=0;for(const chunk of record.chunks)coarse=Math.max(coarse,chunk.level);
          for(let i=0;i<record.chunks.length;i++){requireScene(world.load(i)>=0,record.id+': damaged world chunk '+record.chunks[i].uri);if(record.chunks[i].level<coarse)world.free(i);}
        }
        worlds.set(record.id,world);worldHashes.set(record.id,fingerprint);
      }
      for (const a of d.assets) {
        const file = base + a.uri;
        requireScene(digest(file) === a.hash, a.id + ': content hash mismatch: ' + a.uri);
        if (a.kind === 'skin') {
          requireScene(this.skinFactory !== null && this.skinDisposer !== null, a.id + ': skinned scene needs a factory and disposer from zinc:animation');
          hashes.set(a.id,a.hash); continue;
        }
        let source = this.hashes.get(a.id) === a.hash ? this.assets.get(a.id) : undefined;
        if (source === undefined) { source = loadGltf(file); acquired.set(a.id, source); }
        assets.set(a.id, source); hashes.set(a.id, a.hash);
      }
      const scene = new Scene(), nodes = new Map<string, Node>(), state = new Map<string, string>();
      const previous = new Map<string, SceneRecord>();
      const records = new Map<string, SceneAsset>(); for (const a of d.assets) records.set(a.id,a);
      if (this.document !== null && this.document.id === d.id) for (const n of this.document.nodes) previous.set(n.id, n);
      for (const n of d.nodes) {
        const source = n.asset === null || !assets.has(n.asset) ? undefined : assets.get(n.asset);
        const asset = n.asset === null ? undefined : records.get(n.asset);
        let node = source === undefined ? new Node(null, null) : clone(source);
        if (asset !== undefined && asset.kind === 'skin' && this.skinFactory !== null) {
          node = this.skinFactory(n,asset,base+asset.uri); acquiredDynamic.set(n.id,node);
        }
        node.position = n.translation.slice(); node.rotation = n.rotation.slice(); node.scale = n.scale.slice();
        nodes.set(n.id, node);
        const old = previous.get(n.id), value = this.state.get(n.id);
        if (old !== undefined && value !== undefined && old.asset === n.asset && old.dynamic === n.dynamic && componentSignature(old.metadata) === componentSignature(n.metadata)) state.set(n.id, value);
      }
      for (const n of d.nodes) {
        const node = nodes.get(n.id); if (node === undefined) continue;
        const parent = n.parent === null ? scene : nodes.get(n.parent);
        if (parent !== undefined) parent.add(node);
      }
      for(const world of worlds.values())scene.add(world);
      for (const id of this.assets.keys()) if (this.hashes.get(id) !== hashes.get(id)) { const old = this.assets.get(id); if (old !== undefined) dispose(old); }
      for (const node of this.dynamicNodes.values()) this.releaseDynamic(node);
      this.dynamicNodes = acquiredDynamic;
      for(const id of this.worlds.keys())if(this.worldHashes.get(id)!==worldHashes.get(id)){const old=this.worlds.get(id);if(old!==undefined)old.dispose();}
      this.worlds=worlds;this.worldHashes=worldHashes;
      this.scene = scene; this.nodes = nodes; this.state = state; this.assets = assets; this.hashes = hashes; this.document = d; this.error = '';
      return true;
    } catch (e) {
      for (const source of acquired.values()) dispose(source);
      for (const node of acquiredDynamic.values()) this.releaseDynamic(node);
      for(const world of acquiredWorlds.values())world.dispose();
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

  private releaseDynamic(node: Node): void { const release = this.skinDisposer; if (release !== null) release(node); }

  /** Load the visible levels through the existing World's selector, then select their draw ranges. */
  updateWorlds(camera:Camera,aspect:number,dt:number):void {
    for(const world of this.worlds.values()){
      world.select(camera,aspect,this.worldAhead,dt);let loaded=false;
      for(const chunk of world.unused)world.free(chunk);
      for(const chunk of world.missing){if(world.load(chunk)<0)throw new Error('scene: streamed world chunk could not be loaded');loaded=true;}
      if(loaded)world.select(camera,aspect,this.worldAhead,0);
    }
  }
  /** Batches may contain several authored objects; return every candidate matching the authoritative cell/batch mapping. */
  sourcesForWorld(id:string,chunk:number,batch:number,cell:number):SceneRecord[] {
    const result:SceneRecord[]=[];
    if(this.document!==null&&this.document.worlds!==undefined)for(const world of this.document.worlds)if(world.id===id&&chunk>=0&&chunk<world.chunks.length){
      const file=world.chunks[chunk].uri;const ids=new Set<string>();
      for(const source of world.provenance.sources)for(const location of source.in)if(location[0]===cell&&location[2]===file&&location[3]===batch)ids.add(source.id);
      for(const node of world.provenance.logicalNodes)if(ids.has(node.id))result.push(node);
    }
    return result;
  }

  dispose(): void { for(const world of this.worlds.values())world.dispose();this.worlds.clear();this.worldHashes.clear();for (const node of this.dynamicNodes.values()) this.releaseDynamic(node); this.dynamicNodes.clear(); for (const source of this.assets.values()) dispose(source); this.assets.clear(); this.hashes.clear(); this.nodes.clear(); this.state.clear(); this.scene = new Scene(); this.document = null; }
}
function worldMatrix(record: SceneRecord, records: Map<string, SceneRecord>): number[] {
  const local = mat4Compose(mat4(), record.translation, record.rotation, record.scale);
  const parent = record.parent === null ? undefined : records.get(record.parent);
  return parent === undefined ? local : mat4Multiply(mat4(), worldMatrix(parent, records), local);
}

function componentSignature(m: SceneMetadata): string {
  return `${m.camera !== undefined}:${m.collision !== undefined}:${m.trigger !== undefined}:${m.socket !== undefined}:${m.spawn !== undefined}:${m.gate !== undefined}:${m.interaction !== undefined}`;
}
