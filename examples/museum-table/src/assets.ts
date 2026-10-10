// Loads every file the project names the way the player will and says what it found, one line per file: images through zinc:gfx (pixel
// size), OBJ models through zinc:3d (vertices and triangles), the rest by its size in bytes. Exit code 1 when a file is missing or unreadable.
//   ZINC_HEADLESS=1 zinc run examples/museum-table/src/assets.ts      (from examples/museum-table)
import { onFrame, image, imageWidth, imageHeight, quit } from 'zinc:gfx';
import { readText, readBytes, exists } from 'zinc:assets';
import { exit } from 'zinc:sys';
import { loadObj } from 'zinc:3d';
import { parseProject, assetFiles } from './project';

const project = parseProject(readText('project.json'));
const IMAGES: string[] = ['jpg', 'jpeg', 'png', 'webp'];
let done = false;

onFrame((dt: number) => {   // images exist once the frame loop runs
  if (done) return;
  done = true;
  const files = assetFiles(project);
  let bad = 0;
  for (const f of files) {
    const kind = f.slice(f.lastIndexOf('.') + 1).toLowerCase();
    if (!exists(f)) { console.log(`${f}: missing`); bad++; }
    else if (IMAGES.indexOf(kind) >= 0) {
      const im = image(f);
      if (im < 0) { console.log(`${f}: not an image zinc:gfx reads`); bad++; }
      else console.log(`${f}: image ${imageWidth(im)}x${imageHeight(im)}`);
    } else if (kind === 'obj') {
      const mesh = loadObj(f);
      console.log(`${f}: model ${mesh.vertices} vertices, ${mesh.triangles} triangles`);
    } else console.log(`${f}: ${readBytes(f).length} bytes`);
  }
  console.log(bad === 0 ? `${files.length} files, all read` : `${bad} of ${files.length} files not read`);
  if (bad > 0) exit(1);
  quit();
});
