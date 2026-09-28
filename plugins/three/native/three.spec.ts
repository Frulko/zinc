// three (Zinc) native side: glTF 2.0 documents (.gltf JSON and .glb), PNG/JPEG decoding into runtime images,
// file reading and the display's pixel ratio. The scene graph is built in Zinc (addons/GLTFLoader.ts).
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** Parses a .gltf (JSON) or .glb document; -1 when invalid (error() tells why). */
  parse(data: u8[]): i32;
  error(): string;
  free(h: i32): void;
  assetInfo(h: i32): string;
  /** Buffers: external ones (uri !== '') must be supplied with setBuffer before reading primitives. */
  bufferCount(h: i32): i32;
  bufferUri(h: i32, i: i32): string;
  setBuffer(h: i32, i: i32, data: u8[]): void;
  /** Images: uri of an external file, '' when embedded (buffer view or data: URI, decoded by imageDecode). */
  imageCount(h: i32): i32;
  imageUri(h: i32, i: i32): string;
  imageDecode(h: i32, i: i32): i32;
  /** Source image of a texture, -1 when none (or only in an unsupported extension). */
  textureSource(h: i32, t: i32): i32;
  sceneCount(h: i32): i32;
  defaultScene(h: i32): i32;
  sceneName(h: i32, s: i32): string;
  sceneNodes(h: i32, s: i32, out: i32[]): void;
  nodeCount(h: i32): i32;
  nodeName(h: i32, n: i32): string;
  nodeMesh(h: i32, n: i32): i32;
  nodeChildren(h: i32, n: i32, out: i32[]): void;
  /** Local transform: 10 numbers (translation, rotation quaternion x y z w, scale) or 16 (column-major matrix). */
  nodeTransform(h: i32, n: i32, out: number[]): void;
  meshCount(h: i32): i32;
  meshName(h: i32, m: i32): string;
  primitiveCount(h: i32, m: i32): i32;
  /** Triangles of a primitive (TRIANGLES, strips and fans): xyz positions, xyz normals, uv pairs, rgb colours (0..1),
   *  indices; empty arrays when the attribute is absent. Returns the material index, -1 for the default material,
   *  -2 when the primitive has no triangles or no positions. */
  primitive(h: i32, m: i32, p: i32, pos: number[], nrm: number[], uv: number[], col: number[], idx: i32[]): i32;
  materialCount(h: i32): i32;
  materialName(h: i32, m: i32): string;
  /** baseColorFactor r, g, b, a */
  materialColor(h: i32, m: i32, out: number[]): void;
  /** baseColorTexture index, -1 when none */
  materialTexture(h: i32, m: i32): i32;
  /** 1 double sided, 2 unlit (KHR_materials_unlit), 4 alphaMode BLEND, 8 alphaMode MASK */
  materialFlags(h: i32, m: i32): i32;
  /** Counts of what the loader ignores (reported in the GLTF object). */
  animationCount(h: i32): i32;
  skinCount(h: i32): i32;
  /** PNG or JPEG bytes -> runtime image (0x00RRGGBB, alpha dropped), -1 when the data cannot be decoded. */
  decode(data: u8[]): i32;
  /** Reads a file from disk into `out`; false when it cannot be read. */
  readFile(path: string, out: u8[]): boolean;
  /** Physical pixels per logical pixel (HiDPI screens), 1 elsewhere. */
  pixelRatio(): i32;
}
export default requireNative<Spec>('Three');
