// Where the builder finds the repository's image tools and keeps its profile. Each can be moved by the environment
// (the tests do): ZINC_PI_IMAGE_ROOT, ZINC_PI_IMAGE_TOOL, ZINC_PI_IMAGE_PROFILE.
import * as fs from 'zinc:fs';
import * as os from 'zinc:os';
import * as sys from 'zinc:sys';

function fromEnv(name: string, fallback: string): string { return sys.env(name) === '' ? fallback : sys.env(name); }

/** The repository: the builder lives in image/builder, and `zinc run` starts it in its project. */
export function repositoryRoot(): string { return fs.realpath(fromEnv('ZINC_PI_IMAGE_ROOT', sys.cwd() + '/../..')); }

export function buildTool(): string { return fromEnv('ZINC_PI_IMAGE_TOOL', repositoryRoot() + '/tools/pi-image'); }

export function defaultProfileFile(): string { return repositoryRoot() + '/image/profile.json'; }
export function catalogFile(): string { return repositoryRoot() + '/image/catalog.json'; }

/** Beside the downloads of tools/pi-image, outside the repository: it holds a password and a Wi-Fi key. */
export function profileFile(): string {
  const home = sys.env('ZINC_HOME') === '' ? os.homedir() + '/.zinc' : sys.env('ZINC_HOME');
  return fromEnv('ZINC_PI_IMAGE_PROFILE', home + '/pi-image/profile.json');
}

export function presetsFile(): string {
  const path = profileFile();
  const slash = path.lastIndexOf('/');
  return (slash < 0 ? '.' : path.slice(0, slash)) + '/presets.json';
}

/** A path as a person reads it: relative to the repository when it is inside. */
export function shownPath(path: string): string {
  const root = repositoryRoot() + '/';
  return path.startsWith(root) ? path.slice(root.length) : path;
}

/** A path tools/pi-image prints from inside its container (/dist/...), as the Mac sees it. */
export function hostPath(containerPath: string): string {
  return containerPath.startsWith('/dist/') ? repositoryRoot() + containerPath : containerPath;
}
