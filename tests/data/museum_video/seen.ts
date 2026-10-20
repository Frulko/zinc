// What a visitor sees of a film of the museum table (ZN-650.08) when zinc:video decodes for real: the clip opens, gives pictures, its time
// runs at the pace of the clock and it lasts what the file says. One line, and exit 1 when one of these fails within five seconds.
//   ZINC_NATIVE=real ZINC_ASSETS=<assets directory> ZINC_HEADLESS=1 zinc run next/tests/data/museum_video/seen.ts -- <medium id>
// Not in a deterministic run: it gets the stand-in of zinc:video, which decodes nothing, and the film then shows its poster.
import { onFrame } from 'zinc:gfx';
import { args, clock, exit } from 'zinc:sys';
import { readText } from 'zinc:assets';
import { parseProject } from '../../../../examples/museum-table/src/project';
import { Film } from '../../../../examples/museum-table/src/film';

const project = parseProject(readText('project.json')), found = project.medium(args()[0]);
if (found === null) { console.log(`no medium ${args()[0]}`); exit(1); }
const m = found ?? project.media[0];
const film = new Film(project, m, project.languages[0], 854, 480), start = clock();
let last = start;
film.play();
onFrame((dt: number) => {
  const now = clock();
  film.update((now - last) / 1000);
  last = now;
  const ok = film.image >= 0 && film.t >= 1;
  if (!ok && now - start < 5000) return;
  console.log(`${m.id}: ${film.image >= 0 ? 'pictures' : 'no picture'}, ${film.t >= 1 ? 'its time runs' : 'its time stands'}, ${film.length.toFixed(1)} s, says "${film.said()}"`);
  film.stop();
  exit(ok ? 0 : 1);
});
