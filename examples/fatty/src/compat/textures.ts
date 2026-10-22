import { readText, readBytes } from 'zinc:assets';
import { imageFromBytes } from 'zinc:gfx';

interface AtlasEntry {
  name: string; x: string; y: string; width: string; height: string;
  frameX?: string; frameY?: string; frameWidth?: string; frameHeight?: string;
}
export interface Glyph {
  id: string; x: string; y: string; width: string; height: string;
  xoffset: string; yoffset: string; xadvance: string;
}
interface AtlasData {
  atlases: Record<string, AtlasEntry[]>;
  glyphs: Glyph[];
  kernings: { first: string; second: string; amount: string }[];
  lineHeight: number;
}
let data: AtlasData | null = null;
export function atlasData(): AtlasData {
  if (!data) data = JSON.parse(readText('atlas-data.json')) as AtlasData;
  return data;
}
const images = new Map<string, number>();
export function loadImage(path: string): number {
  const cached = images.get(path);
  if (cached !== undefined) return cached;
  const id = imageFromBytes(readBytes(path));
  if (id < 0) throw new Error('Fatty: cannot decode ' + path);
  images.set(path, id);
  return id;
}
export class Texture {
  x = 0; y = 0; width = 0; height = 0;
  frameX = 0; frameY = 0; frameWidth = 0; frameHeight = 0;
  constructor(public image: number) {}
}
export class TextureAtlas {
  private textures = new Map<string, Texture>();
  constructor(imagePath: string, xmlPath: string) {
    const image = loadImage(imagePath);
    const entries = atlasData().atlases[xmlPath];
    if (!entries) throw new Error('Fatty: missing atlas ' + xmlPath);
    for (const entry of entries) {
      const texture = new Texture(image);
      texture.x = Number(entry.x); texture.y = Number(entry.y);
      texture.width = Number(entry.width); texture.height = Number(entry.height);
      texture.frameX = Number(entry.frameX || 0); texture.frameY = Number(entry.frameY || 0);
      texture.frameWidth = Number(entry.frameWidth || entry.width);
      texture.frameHeight = Number(entry.frameHeight || entry.height);
      this.textures.set(entry.name, texture);
    }
  }
  getTexture(name: string): Texture {
    const texture = this.textures.get(name);
    if (!texture) throw new Error('Fatty: missing texture ' + name);
    return texture;
  }
  getTextures(prefix: string): Texture[] {
    const names = Array.from(this.textures.keys()).filter(n => n.startsWith(prefix)).sort((a,b) => a < b ? -1 : a > b ? 1 : 0);
    if (names.length === 0) throw new Error('Fatty: empty animation ' + prefix);
    return names.map(n => this.getTexture(n));
  }
}
