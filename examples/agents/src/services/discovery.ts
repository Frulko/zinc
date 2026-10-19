// What is on this computer: the agent CLIs, their configuration files, and the folders to chat in.
// Everything here only reads the disk; the one process it starts is `<cli> --version`.
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import * as proc from 'zinc:process';
import { Agent, ConfigSpec } from './agents';

export const HOME = sys.env('HOME');

/** A configuration path that exists. */
export class ConfigFile {
  /** Absolute path. */
  path: string;
  /** As written in the docs: `~/.claude/settings.json`, `CLAUDE.md`. */
  label: string;
  isDirectory: boolean;
  /** Bytes for a file, entries for a folder. */
  size: i32;
  secret: boolean;
  constructor(path: string, label: string, isDirectory: boolean, size: i32, secret: boolean) {
    this.path = path; this.label = label; this.isDirectory = isDirectory; this.size = size; this.secret = secret;
  }
}

/** The specs of `specs` that exist under `base`, labelled with `prefix` (`~/` for the home directory, '' in a project). */
export function findConfig(specs: ConfigSpec[], base: string, prefix: string): ConfigFile[] {
  const found: ConfigFile[] = [];
  for (const s of specs) {
    const path = base + '/' + s.path;
    if (!fs.exists(path)) continue;
    try {
      const st = fs.stat(path);
      const size: i32 = st.isDirectory ? fs.list(path).length : st.size as i32;
      found.push(new ConfigFile(path, prefix + s.path, st.isDirectory, size, s.secret));
    } catch (e) { }   // unreadable (permissions): not listed
  }
  return found;
}

// An app opened from the Finder gets launchd's PATH (/usr/bin:/bin:...), not the shell's: the places the installers
// of these CLIs use are searched too.
const EXTRA_BIN_DIRS = ['/.local/bin', '/.opencode/bin', '/.npm-global/bin', '/.bun/bin'];
const SYSTEM_BIN_DIRS = ['/opt/homebrew/bin', '/usr/local/bin'];

/** The absolute path of `name` in PATH or the usual install folders, '' when it is not installed. */
export function findBinary(name: string): string {
  const dirs = sys.env('PATH').split(':');
  for (const d of EXTRA_BIN_DIRS) dirs.push(HOME + d);
  for (const d of SYSTEM_BIN_DIRS) dirs.push(d);
  for (const d of dirs) {
    if (d === '') continue;
    const path = d + '/' + name;
    if (fs.exists(path)) return path;
  }
  return '';
}

/** The first line `binary --version` prints, '' when it fails. */
export async function versionOf(binary: string): Promise<string> {
  try {
    const r = await proc.run(binary, ['--version'], { cwd: fs.tmpdir() });   // not where the app runs: see agents.ts outputOf
    return r.code === 0 ? r.stdout.trim().split('\n')[0] : '';
  } catch (e) {
    return '';
  }
}

/**
 * The folders offered at start: the ones given on the command line, then the projects Claude Code has seen.
 * Claude names a project's folder after its path with every '/' turned into '-': `-Users-me-Lab-zinc`.
 */
export function initialFolders(): string[] {
  const folders: string[] = [];
  const add = (path: string): void => {
    if (path !== '' && folders.indexOf(path) < 0 && fs.exists(path) && fs.stat(path).isDirectory) folders.push(path);
  };
  for (const a of sys.args()) if (a.startsWith('/')) add(a);
  const projects = HOME + '/.claude/projects';
  if (fs.exists(projects)) {
    // ponytail: a path holding '-' or '.' does not decode back and is skipped; read the sessions' "cwd" if it matters
    for (const name of fs.list(projects)) if (name.startsWith('-')) add(name.split('-').join('/'));
  }
  return folders;
}

/** `/Users/me/Lab/zinc` → `~/Lab/zinc`. */
export function shortPath(path: string): string {
  return HOME !== '' && path.startsWith(HOME) ? '~' + path.slice(HOME.length) : path;
}

/** The configuration of `agent` that `folder` holds. */
export function projectConfigOf(agent: Agent, folder: string): ConfigFile[] {
  return findConfig(agent.projectConfig, folder, '');
}
