// zinc:3d renderer (C++): mesh storage, render targets (runtime image + z-buffer) and immediate draw calls.
// `number` follows the program's number kind (f64, f32 or fx12); the C++ side converts to float once per value.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** Uploads a mesh: xyz positions, xyz normals (empty: smooth normals are computed), uv pairs (may be empty),
   *  0xRRGGBB vertex colours (may be empty), triangle indices. Returns a handle, -1 when over 65535 vertices. */
  meshCreate(pos: number[], nrm: number[], uv: number[], col: u32[], idx: i32[]): i32;
  /** A part of a .zmesh model (ZMS1, include/zn/zmesh.h, ZN-441) at byte `at` of `data`: its arrays taken as they are, no parsing. Returns
   *  a handle, -1 when the part does not fit in `data` or an index passes its vertices. */
  meshLoad(data: u8[], at: i32): i32;
  meshDestroy(mesh: i32): void;
  /** CPU-skinned positions/normals, same vertex count. Returns false for unsupported GPU mesh layouts. */
  meshDeform(mesh: i32, pos: number[], nrm: number[]): boolean;
  /** Reads an asset (a .zmesh model) into the renderer in one go, for assetByte and assetMesh: its size, or -1 when this host gives native
   *  modules no asset (loadModel then reads it through zinc:assets). */
  assetOpen(name: string): i32;
  /** A byte of the asset assetOpen read (0 past its end). */
  assetByte(at: i32): i32;
  /** meshLoad over the asset assetOpen read. */
  assetMesh(at: i32): i32;
  /** Frees the asset assetOpen read. */
  assetClose(): void;
  /** Render target for a w x h screen box (internal size divided by the `scale` option). Returns `t`, resized if
   *  needed, or a new handle when t < 0. */
  target(t: i32, w: i32, h: i32): i32;
  targetDestroy(t: i32): void;
  /** Starts a frame: clears colour and depth, sets the camera. `view` is a column-major 4x4 matrix; `proj` is the
   *  vertical field of view in radians, or the view height in world units when `ortho`. */
  begin(t: i32, clear: u32, view: number[], proj: number, near: number, far: number, ortho: boolean): void;
  ambient(color: u32): void;
  /** Adds a directional light (direction the light travels, world space) for this frame; up to 4. */
  light(dx: number, dy: number, dz: number, color: u32): void;
  /** The specular reflection of the next draws (Blinn-Phong, ZN-563.04): `color` 0xRRGGBB is the reflectance at normal incidence, 0 none
   *  (begin resets it); `shininess` is the exponent. Lit draws only; per vertex in the software renderer, per pixel on the GPU. */
  specular(color: u32, shininess: number): void;
  /** The emissive colour of the next draws (ZN-696), 0xRRGGBB, 0 none (begin resets it): added to the light they receive, before the texture. */
  emissive(color: u32): void;
  /** Linear fog for the rest of the frame (begin turns it off): a pixel at view depth `near` or closer keeps its colour, one at `far` or
   *  beyond is `color` (0xRRGGBB), in between mixed. By depth along the view, as the fixed-function GPUs' fog (the GE, the PICA200). */
  fog(color: u32, near: number, far: number): void;
  /** Draws a mesh with a column-major model matrix. texture: image id or -1. flags: 1 vertex colours, 2 flat
   *  shading, 4 unlit, 8 double sided; bits 4-5 the texture filter (ZN-657): 0 the renderer's (the `filter` option), 1 nearest,
   *  2 linear, 3 mipmaps (trilinear). The software renderer always takes the nearest texel. Bits 6-7 the blending (ZN-696): 0 opaque,
   *  1 over the frame, 2 added to it, with the opacity in bits 8-15 (0..255); a blended draw is depth tested and writes no depth. Bit 16: no fog (the GPUs; the software renderer
   *  fogs by its depth buffer once the frame is drawn). */
  draw(mesh: i32, model: number[], color: u32, texture: i32, flags: i32): void;
  /** A node's world matrix: world = parent x translation(p) x rotation(q, a quaternion x, y, z, w) x scale(s), column major, written into
   *  `world`. Here and not in the program: interpreted, the two products took 12 of the 14 ms of a PSP frame of examples/3d/orbit. */
  transform(world: number[], parent: number[], p: number[], q: number[], s: number[]): void;
  /** Whether the GPU draws (ZN-657): a camera renders at the window's pixel scale there, at 1 in software. */
  gpu(): boolean;
  /** Ends the frame (the image shows the new pixels); returns the number of triangles rasterized. */
  end(): i32;
  /** Draws the target's image in the screen box (nearest-neighbour scaling; composes with zinc:gfx commands). */
  present(t: i32, x: number, y: number, w: number, h: number): void;
  /** Opens a world (include/zn/zworld.h, index.ts World): its index of cells and chunks, nothing loaded. Returns a handle, -1 when the asset
   *  is not there or damaged. */
  worldOpen(name: string): i32;
  worldChunkCount(world: i32): i32;
  /** Releases loaded batches, chunk metadata and the index. */
  worldClose(world: i32): void;
  /** Loads one of its chunks (a level of a few cells): the bytes read, -1 when it cannot. */
  worldLoad(world: i32, chunk: i32): i32;
  /** Frees a chunk: its cells show another level from the next worldSelect. */
  worldFree(world: i32, chunk: i32): void;
  /** How far the night has come, 0 (day) to 1: from 0.5 the batches show their night picture and emissive colour; a renderer that mixes
   *  the two (the 3DS's combiners) goes from one to the other by it. */
  worldNight(world: i32, night: number): void;
  /** The shadows of the scene's first light over a field of heights: the asset `heights` holds u16 heights (little-endian, rows along +z),
   *  prm: x0, z0 (the first cell's corner), step (metres a cell), w, h (cells), y0 (the height of 0), unit (metres a step); `heights` empty:
   *  the shadows off. A renderer that draws them (the 3DS, the PSP) darkens the ground and the roofs where something stands between them
   *  and the light; the others ignore them. */
  worldShadows(world: i32, heights: string, prm: number[]): void;
  /** Chooses what worldDraw draws: the cells in the frustum of the camera (`view`, its view matrix), each at the level of its distance,
   *  of their walls the sectors that can face the eye. eyes: x y z of the eye, then of points it will pass (for the chunks to load). prm:
   *  vertical field of view (radians), aspect, near, far, near reach, mid reach (metres), budget (triangles), hysteresis, sectors (0/1),
   *  dt (seconds since the last call), idle (seconds, 0 never). out: triangles, draws, the reaches' scale x 1000, n chunks to load, m to
   *  free, then the n and the m chunk numbers. */
  worldSelect(world: i32, view: number[], eyes: number[], prm: number[], out: i32[]): void;
  /** Draws the index ranges worldSelect chose. */
  worldDraw(world: i32): void;
}
export default requireNative<Spec>('Render3D');
