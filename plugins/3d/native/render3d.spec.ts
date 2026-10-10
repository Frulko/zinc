// zinc:3d renderer (C++): mesh storage, render targets (runtime image + z-buffer) and immediate draw calls.
// `number` follows the program's number kind (f64, f32 or fx12); the C++ side converts to float once per value.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** Uploads a mesh: xyz positions, xyz normals (empty: smooth normals are computed), uv pairs (may be empty),
   *  0xRRGGBB vertex colours (may be empty), triangle indices. Returns a handle, -1 when over 65535 vertices. */
  meshCreate(pos: number[], nrm: number[], uv: number[], col: u32[], idx: i32[]): i32;
  meshDestroy(mesh: i32): void;
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
  /** Draws a mesh with a column-major model matrix. texture: image id or -1. flags: 1 vertex colours, 2 flat
   *  shading, 4 unlit, 8 double sided; bits 4-5 the texture filter (ZN-657): 0 the renderer's (the `filter` option), 1 nearest,
   *  2 linear, 3 mipmaps (trilinear). The software renderer always takes the nearest texel. Bits 6-7 the blending (ZN-696): 0 opaque,
   *  1 over the frame, 2 added to it, with the opacity in bits 8-15 (0..255); a blended draw is depth tested and writes no depth. */
  draw(mesh: i32, model: number[], color: u32, texture: i32, flags: i32): void;
  /** Whether the GPU draws (ZN-657): a camera renders at the window's pixel scale there, at 1 in software. */
  gpu(): boolean;
  /** Ends the frame (the image shows the new pixels); returns the number of triangles rasterized. */
  end(): i32;
  /** Draws the target's image in the screen box (nearest-neighbour scaling; composes with zinc:gfx commands). */
  present(t: i32, x: number, y: number, w: number, h: number): void;
}
export default requireNative<Spec>('Render3D');
