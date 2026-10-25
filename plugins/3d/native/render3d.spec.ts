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
  /** A new set of cells (index.ts Cells): boxes with up to three levels of detail, culled, chosen and drawn here. */
  cellsCreate(): i32;
  /** Adds a cell: info = min x y z, max x y z, the geometric error of each level in metres (0 the finest), the triangles of each level
   *  (0: not in this pack). Returns its index. */
  cellAdd(set: i32, info: number[]): i32;
  /** Adds a part to a cell's level: mat = colour, draw flags (as draw's), texture, emissive, the night's texture and emissive. mesh -1
   *  forgets the level's parts: present in the pack, not loaded. */
  cellPart(set: i32, cell: i32, level: i32, mesh: i32, mat: i32[]): void;
  /** The parts show their night texture and emissive colour (or their day ones). */
  cellsNight(set: i32, on: boolean): void;
  /** Chooses the level each cell shows. eyes: x y z of the eye, then of points it will pass (for the levels to load). prm: look x y z,
   *  half-angle of the view cone (radians), focal length (pixels), tau (pixels), budget (triangles), reach, fogStart (metres), hysteresis,
   *  hold (calls), fade (seconds), dt (seconds since the last call), idle (seconds, 0 never). out: triangles, draws, n levels to load, m
   *  to free, then n and m (cell, level) pairs. */
  cellsSelect(set: i32, eyes: number[], prm: number[], out: i32[]): void;
  /** Draws the levels cellsSelect chose (pass 0, opaque) or the ones fading out (pass 1, blended: after the opaque nodes). */
  cellsDraw(set: i32, pass: i32): void;
}
export default requireNative<Spec>('Render3D');
