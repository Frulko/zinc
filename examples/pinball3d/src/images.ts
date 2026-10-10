// The images a table names (the painting of a playfield, the picture of a panel), read once from where the table
// comes from and kept: a scene that is built again for the same table (an editor after each change) gets the same
// images back instead of reading them again, for the engine holds a limited number of images at a time.
import { imageFromBytes, destroyImage } from 'zinc:gfx';
import { TableSource } from './format/source';

const images = new Map<string, i32>();

/** The image `file` of a table's source, for zinc:gfx and as a texture of zinc:3d; -1 when the table has no source,
 *  the file is not there, or it is not a PNG or JPEG image (said once on the error output). */
export function tableImage(src: TableSource | null, file: string): i32 {
  if (file === '' || src === null) return -1;
  const key = `${src.describe()}\n${file}`;
  if (images.has(key)) return images.get(key) ?? -1;
  let id: i32 = -1;
  if (!src.has(file)) console.warn(`pinball3d: the image ${file} is not in ${src.describe()}`);
  else {
    id = imageFromBytes(src.bytes(file));
    if (id < 0) console.warn(`pinball3d: ${file} is not a PNG or JPEG image`);
  }
  images.set(key, id);
  return id;
}

/** Frees every image read so far: after the files of a table changed, or when a table is closed. Scenes built before
 *  must be built again. */
export function forgetImages(): void {
  for (const id of images.values()) if (id >= 0) destroyImage(id);
  images.clear();
}
