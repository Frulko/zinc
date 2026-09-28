// Finds the clips to play: files given on the command line, a folder, or the sample media next to the example.
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';
import { EXTENSIONS, isVideo } from 'zinc:video';

/** The sample folder, whether we run from the project folder, the build folder or the repository root. */
const SAMPLE_FOLDERS: string[] = ['media', '../../media', 'examples/video/quad/media'];

/** Video files of a folder, or the path itself when it is a video. */
function videosIn(path: string): string[] {
  if (isVideo(path, EXTENSIONS)) return [path];
  return fs.list(path).filter((f: string) => isVideo(f, EXTENSIONS)).map((f: string) => `${path}/${f}`);
}

/** `quad a.mp4 b.mp4 ...` plays those files; `quad folder` (or no argument) plays a folder. */
export function mediaFiles(): string[] {
  const args = sys.args();
  if (args.length > 1) return args;
  const candidates = args.length === 1 ? [args[0]] : SAMPLE_FOLDERS;
  for (const path of candidates) if (fs.exists(path)) return videosIn(path);
  return [];
}
