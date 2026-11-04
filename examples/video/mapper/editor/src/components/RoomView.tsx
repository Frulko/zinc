// The room in 3D with three.js, in the browser and in the native client: drag to turn around it, the wheel moves closer.
import * as THREE from 'three';
import * as ui from 'zinc:ui';
import { createSignal } from 'zinc:ui/solid';
import { SceneSurface, toWebAxes } from '../model/room';
import { revision } from '../state';

const BACKGROUND = 0x08090b, FLOOR = 0x16181d, PROJECTOR = 0xffa600;
const FLOOR_METRES = 20, FLOOR_DROP_METRES = 1.5;
const DRAG_RADIANS_PER_PIXEL = 0.008, WHEEL_ZOOM = 1.1, CLOSEST_METRES = 0.5, FARTHEST_METRES = 40;
const HIGHEST_RADIANS = 1.5;

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

function staticScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_METRES, FLOOR_METRES), new THREE.MeshBasicMaterial({ color: FLOOR, side: THREE.DoubleSide }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -FLOOR_DROP_METRES;
  scene.add(floor);
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.2), new THREE.MeshBasicMaterial({ color: PROJECTOR })));
  return scene;
}

export function RoomView(props: { className: string; surfaces: () => SceneSurface[] }): i32 {
  const [view, setView] = createSignal<number[]>([0.7, 0.4, 7]);   // around, above, distance
  let renderer: THREE.WebGLRenderer | null = null;   // made at the first draw: only this tab pays for it
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let surfaces: THREE.Mesh[] = [];
  let builtRevision = -1;
  let dragging = false, lastX = 0, lastY = 0;

  const draw = (x: i32, y: i32, width: i32, height: i32): void => {
    if (renderer === null) {
      renderer = new THREE.WebGLRenderer({ antialias: true });
      scene = staticScene();
      camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100);
    }
    const r = renderer as THREE.WebGLRenderer, s = scene as THREE.Scene, c = camera as THREE.PerspectiveCamera;
    const current = revision();
    if (current !== builtRevision) {
      for (const mesh of surfaces) s.remove(mesh);
      surfaces = props.surfaces().map(surfaceMesh);
      for (const mesh of surfaces) s.add(mesh);
      builtRevision = current;
    }
    const v = view();
    const flat = Math.cos(v[1]) * v[2];
    c.aspect = width / height;
    c.updateProjectionMatrix();
    c.position.set(Math.sin(v[0]) * flat, Math.sin(v[1]) * v[2], Math.cos(v[0]) * flat - 2);
    c.lookAt(0, 0, -2);
    r.setViewport(x, y, width, height);
    r.render(s, c);
  };
  const move = (e: ui.PointerEvent): void => {
    if (!dragging) return;
    const v = view();
    const above = Math.max(-HIGHEST_RADIANS, Math.min(HIGHEST_RADIANS, v[1] + (e.y - lastY) * DRAG_RADIANS_PER_PIXEL));
    setView([v[0] - (e.x - lastX) * DRAG_RADIANS_PER_PIXEL, above, v[2]]);
    lastX = e.x;
    lastY = e.y;
  };
  return <Canvas className={props.className} onDraw={draw} onPointerMove={move}
    onPointerDown={(e: ui.PointerEvent) => { dragging = true; lastX = e.x; lastY = e.y; }}
    onPointerUp={(e: ui.PointerEvent) => { dragging = false; }}
    onWheel={(e: ui.PointerEvent) => {
      const v = view();
      setView([v[0], v[1], Math.max(CLOSEST_METRES, Math.min(FARTHEST_METRES, v[2] * (e.wheel > 0 ? 1 / WHEEL_ZOOM : WHEEL_ZOOM)))]);
    }} />;
}
