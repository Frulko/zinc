// Where the files a project names are read. The table reads the assets of its app (zinc:assets; a picture is an image of the app). The
// storyboard editor's preview plays a project that lies in a folder of the author's disk: it puts its own functions here
// (../editor/preview.tsx), so the player itself never opens the file system.
import { image } from 'zinc:gfx';
import { readText, readBytes, exists } from 'zinc:assets';
import { writeBytes, tmpdir } from 'zinc:fs';

export class Files {
  /** The image of a picture file; -1 when there is none or it is not a picture. */
  picture: (file: string) => i32 = (file: string): i32 => image(file);
  text: (file: string) => string = (file: string): string => readText(file);
  bytes: (file: string) => u8[] = (file: string): u8[] => readBytes(file);
  exists: (file: string) => boolean = (file: string): boolean => exists(file);
  /** The name under which a loader that opens files itself finds this one: zinc:3d's glTF reader, which also opens the buffers a .gltf names. */
  path: (file: string) => string = (file: string): string => file;
  /** A file of the disk that holds this one, for a decoder that opens nothing else (zinc:video). An app's assets have no path of their
   *  own: the film is copied to the temporary directory, once per run. */
  onDisk: (file: string) => string = (file: string): string => {
    const copy = `${tmpdir()}/museum-table-${file.replaceAll('/', '-')}`;
    writeBytes(copy, readBytes(file));
    return copy;
  };
}
export const files = new Files();
