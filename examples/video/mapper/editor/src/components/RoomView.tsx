// The room in 3D with three.js, in the browser and in the native client: drag to turn around it, the wheel moves closer. It frames itself on what it shows.
import * as THREE from 'three';
import * as ui from 'zinc:ui';
import { createSignal } from 'zinc:ui/solid';
import { Lens, SceneSurface, Vec3, toWebAxes } from '../model/room';
import { revision, roomRevision } from '../state';

const BACKGROUND = 0x08090b, FLOOR_LINE = 0x2a2f38, BEAM = 0x5a4a20, EDGE = 0xffffff, PROJECTOR = 0xffa600;
const DRAG_RADIANS_PER_PIXEL = 0.008, WHEEL_ZOOM = 1.1, HIGHEST_RADIANS = 1.5;
const FRAMING = 2.2, MIN_RADIUS = 0.5, FLOOR_MARGIN = 2, LINE_PER_METRE = 0.004;

/** A line as two crossed thin quads, seen from any side: the three.js of the native client draws meshes only. */
function addLine(positions: number[], a: Vec3, b: Vec3, thickness: number): void {
  const offsets: Vec3[] = [[thickness, 0, 0], [0, thickness, 0]];
  for (const o of offsets) {
    positions.push(a[0] - o[0], a[1] - o[1], a[2], b[0] - o[0], b[1] - o[1], b[2], b[0] + o[0], b[1] + o[1], b[2]);
    positions.push(a[0] - o[0], a[1] - o[1], a[2], b[0] + o[0], b[1] + o[1], b[2], a[0] + o[0], a[1] + o[1], a[2]);
  }
}

function linesMesh(positions: number[], colour: number): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: colour, side: THREE.DoubleSide }));
}

function surfaceMesh(surface: SceneSurface): THREE.Mesh {
  const positions: number[] = [];
  for (const point of surface.grid.points) {
    const p = toWebAxes(point);
    positions.push(p[0], p[1], p[2]);
  }
  const uvs: number[] = [];
  for (const uv of surface.grid.uvs) uvs.push(uv[0], uv[1]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(surface.grid.triangles.map((vertex: i32): number => vertex));
  const c = surface.colour;
  const hex = Math.round(c[0] * 255) * 65536 + Math.round(c[1] * 255) * 256 + Math.round(c[2] * 255);
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: hex, side: THREE.DoubleSide }));
}

/** The border of a surface, following its grid: the points are rows of a square grid. */
function addBorder(positions: number[], surface: SceneSurface, thickness: number): void {
  const side: i32 = Math.sqrt(surface.grid.points.length) as i32;
  const at = (i: i32, j: i32): Vec3 => toWebAxes(surface.grid.points[j * side + i]);
  for (let k: i32 = 0; k + 1 < side; k++) {
    addLine(positions, at(k, 0), at(k + 1, 0), thickness);
    addLine(positions, at(k, side - 1), at(k + 1, side - 1), thickness);
    addLine(positions, at(0, k), at(0, k + 1), thickness);
    addLine(positions, at(side - 1, k), at(side - 1, k + 1), thickness);
  }
}

interface Framing { centre: Vec3; radius: number; lowest: number; deepest: number }

function frameOf(surfaces: SceneSurface[]): Framing {
  const low: Vec3 = [0, 0, 0], high: Vec3 = [0, 0, 0];   // the projector stands at the origin: it stays in the picture
  let deepest = 1;
  for (const surface of surfaces) {
    for (const point of surface.grid.points) {
      const p = toWebAxes(point);
      for (let k: i32 = 0; k < 3; k++) {
        low[k] = Math.min(low[k], p[k]);
        high[k] = Math.max(high[k], p[k]);
      }
      deepest = Math.max(deepest, point[2]);
    }
  }
  const radius = Math.max(MIN_RADIUS, Math.hypot(high[0] - low[0], high[1] - low[1], high[2] - low[2]) / 2);
  return { centre: [(low[0] + high[0]) / 2, (low[1] + high[1]) / 2, (low[2] + high[2]) / 2], radius, lowest: low[1], deepest };
}

/** What the lens lights, up to the farthest surface: four rays and the picture there. */
function addBeam(positions: number[], lens: Lens, aspect: number, depth: number, thickness: number): void {
  const corner = (u: number, v: number): Vec3 => toWebAxes([(u - 0.5) * depth / lens.throwRatio, (v - 0.5 - lens.shiftY) / aspect * depth / lens.throwRatio, depth]);
  const corners: Vec3[] = [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)];
  for (let i: i32 = 0; i < 4; i++) {
    addLine(positions, [0, 0, 0], corners[i], thickness);
    addLine(positions, corners[i], corners[(i + 1) % 4], thickness);
  }
}

function addFloor(positions: number[], frame: Framing, thickness: number): void {
  const reach = Math.ceil(frame.radius) + FLOOR_MARGIN;
  const y = frame.lowest, cx = Math.round(frame.centre[0]), cz = Math.round(frame.centre[2]);
  for (let k = -reach; k <= reach; k++) {
    addLine(positions, [cx + k, y, cz - reach], [cx + k, y, cz + reach], thickness);
    addLine(positions, [cx - reach, y, cz + k], [cx + reach, y, cz + k], thickness);
  }
}

export function RoomView(props: { className: string; surfaces: () => SceneSurface[]; lens: () => Lens; aspect: () => number }): i32 {
  const [view, setView] = createSignal<number[]>([0.7, 0.4, 1]);   // around, above, how far as a share of what frames the scene
  let renderer: THREE.WebGLRenderer | null = null;   // made at the first draw: only this tab pays for it
  let camera: THREE.PerspectiveCamera | null = null;
  let scene: THREE.Scene | null = null;
  let frame: Framing = { centre: [0, 0, 0], radius: 1, lowest: 0, deepest: 1 };
  let builtRevision = -1;
  let dragging = false, lastX = 0, lastY = 0;

  const build = (): void => {
    const next = new THREE.Scene();
    next.background = new THREE.Color(BACKGROUND);
    const surfaces = props.surfaces();
    frame = frameOf(surfaces);
    const thickness = Math.max(frame.radius, 1) * LINE_PER_METRE;
    const floor: number[] = [], beam: number[] = [], edges: number[] = [];
    addFloor(floor, frame, thickness);
    addBeam(beam, props.lens(), props.aspect(), frame.deepest, thickness);
    for (const surface of surfaces) {
      next.add(surfaceMesh(surface));
      addBorder(edges, surface, thickness);
    }
    next.add(linesMesh(floor, FLOOR_LINE));
    next.add(linesMesh(beam, BEAM));
    if (edges.length > 0) next.add(linesMesh(edges, EDGE));
    const projectorSize = thickness * 30;
    next.add(new THREE.Mesh(new THREE.BoxGeometry(projectorSize, projectorSize / 2, projectorSize), new THREE.MeshBasicMaterial({ color: PROJECTOR })));
    scene = next;
  };

  const draw = (x: i32, y: i32, width: i32, height: i32): void => {
    if (renderer === null) {
      renderer = new THREE.WebGLRenderer({ antialias: true });
      camera = new THREE.PerspectiveCamera(45, 1, 0.02, 500);
    }
    const r = renderer as THREE.WebGLRenderer, c = camera as THREE.PerspectiveCamera;
    const current = revision() + roomRevision();
    if (current !== builtRevision) {
      build();
      builtRevision = current;
    }
    const v = view();
    const distance = frame.radius * FRAMING * v[2];
    const flat = Math.cos(v[1]) * distance;
    c.aspect = width / height;
    c.updateProjectionMatrix();
    c.position.set(frame.centre[0] + Math.sin(v[0]) * flat, frame.centre[1] + Math.sin(v[1]) * distance, frame.centre[2] + Math.cos(v[0]) * flat);
    c.lookAt(frame.centre[0], frame.centre[1], frame.centre[2]);
    r.setViewport(x, y, width, height);
    r.render(scene as THREE.Scene, c);
  };
  const move = (e: ui.PointerEvent): void => {
    if (!dragging) return;
    const v = view();
    const above = Math.max(-HIGHEST_RADIANS, Math.min(HIGHEST_RADIANS, v[1] + (e.y - lastY) * DRAG_RADIANS_PER_PIXEL));
    setView([v[0] - (e.x - lastX) * DRAG_RADIANS_PER_PIXEL, above, v[2]]);
    lastX = e.x;
    lastY = e.y;
  };
  return <Canvas className={props.className} grab="keep" onDraw={draw} onPointerMove={move}
    onPointerDown={(e: ui.PointerEvent) => { dragging = true; lastX = e.x; lastY = e.y; }}
    onPointerUp={(e: ui.PointerEvent) => { dragging = false; }}
    onWheel={(e: ui.PointerEvent) => {
      const v = view();
      setView([v[0], v[1], v[2] * (e.wheel > 0 ? 1 / WHEEL_ZOOM : WHEEL_ZOOM)]);
    }} />;
}
