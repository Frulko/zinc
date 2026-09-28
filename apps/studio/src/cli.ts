// Headless commands (no window), for scripts and tests:
//   studio --generate <project.zproj>    writes build/zinc.json + build/src/main.ts, prints warnings
//   studio --all-boxes <dir.zproj>       creates a project using every library box (template check, see test.sh)
import * as project from './project';
import { writeBuild } from './codegen';
import { BOXES } from './library';

/** Runs a headless command when the arguments ask for one; returns the exit code, or -1 to start the UI. */
export function runCli(args: string[]): i32 {
  if (args.length >= 2 && args[0] === '--generate') return generateCmd(args[1]);
  if (args.length >= 2 && args[0] === '--all-boxes') return allBoxesCmd(args[1]);
  return -1;
}

function generateCmd(dir: string): i32 {
  try {
    const p = project.load(dir);
    const r = writeBuild(dir, p);
    for (const w of r.warnings) console.warn('warning:', w);
    console.log(`generated ${project.join(dir, 'build/src/main.ts')}: ${p.boxes.length} boxes, ${p.links.length} links, modules ${r.modules.join(' ')}`);
    return 0;
  } catch (e) {
    console.error(`cannot generate ${dir}:`, e);
    return 1;
  }
}

/** One instance of every box, each fed by the start bar, so every template is compiled by `zinc check`. */
function allBoxesCmd(dir: string): i32 {
  const p = project.emptyProject('all boxes');
  p.boxes.push({ id: 'log', type: 'log', title: 'Log', x: 40, y: 0, params: [], script: '' });
  let i = 0;
  for (const d of BOXES) {
    i++;
    const id = `b${i}`;
    p.boxes.push({ id: id, type: d.type, title: d.title, x: 40 + (i % 6) * 220, y: 40 + Math.floor(i / 6) * 160, params: [], script: '' });
    for (const inp of d.inputs) if (inp.isSignal) p.links.push({ from: '@start', out: 'onStart', to: id, inp: inp.name });
    // signal outputs end the behavior; value outputs feed the Log box's text input (number -> string conversions)
    for (const o of d.outputs) p.links.push(o.isSignal ? { from: id, out: o.name, to: '@end', inp: 'onStopped' } : { from: id, out: o.name, to: 'log', inp: 'message' });
  }
  project.save(dir, p);
  return generateCmd(dir);
}
