// The Info view of Zinc Inspector: a card about the attached program, from Zinc.getProgramInfo (the runtime's own answer: what zinc run
// compiled, the engine, the process, the renderer, the frames) and Zinc.getThreads (its workers). What it is, where and on what it runs, how
// it draws, its plugins, files and the zinc: modules it imports, and its live numbers, refreshed every second while the view is open.
import { createSignal } from 'zinc:ui/solid';
import { msText } from './model';
import { call, view } from './state';
import { threads, loadThreads, threadLine } from './threads';
import { ThreadInfo } from './model';

/** A part of the card: its title and its rows, a label and a value each. */
export class Section { title: string = ''; labels: string[] = []; values: string[] = []; }

const [sections, setSections] = createSignal<Section[]>([]);
const [device, setDevice] = createSignal<string>('');   // the paired device the program runs on ('' : this machine)
/** Answers received (the dump waits on it). */
export const [infoLoads, setInfoLoads] = createSignal<i32>(0);
/** Where the attached program runs: the name of its paired device, '' for this machine. */
export function setInfoDevice(name: string): void { setDevice(name); }

function has(o: any): boolean { return o !== undefined && o !== null; }
function str(o: any): string { return has(o) ? '' + o : ''; }
function num(o: any): number { return has(o) ? o as number : 0; }
function or(s: string, none: string): string { return s.length > 0 ? s : none; }
function bytes(b: number): string {
  if (b >= 1073741824) return (Math.round(b / 107374182.4) / 10) + ' GB';
  if (b >= 1048576) return (Math.round(b / 104857.6) / 10) + ' MB';
  return Math.round(b / 1024) + ' KB';
}
function duration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + ' s';
  if (s < 3600) return Math.floor(s / 60) + ' min ' + (s % 60) + ' s';
  return Math.floor(s / 3600) + ' h ' + Math.floor((s % 3600) / 60) + ' min';
}
function engineText(e: string): string {
  return e === 'interpreter' ? 'interpreter (ZBC bytecode)' : e === 'AOT' ? 'AOT (compiled to native code)' : e === 'QuickJS' ? 'QuickJS (JavaScript)' :
    e === 'JavaScriptCore' || e === 'V8' || e === 'Hermes' ? e + ' (JavaScript)' : or(e, 'unknown');
}
function rendererText(rt: any): string {
  if (rt.headless === true) return 'CPU raster, headless (no window)';
  const i = rt.gfx.info;
  const r = str(i.renderer);
  if (r === 'gl') return 'GPU: OpenGL replay of the draw commands';
  return 'CPU raster' + (str(i.present).length > 0 ? ', shown through ' + str(i.present) : '');
}

/** The card's parts from the answer of Zinc.getProgramInfo and the workers. */
export function infoSections(r: any, ws: ThreadInfo[], where: string): Section[] {
  const out: Section[] = [];
  if (!has(r.runtime)) return out;
  const rt = r.runtime;
  const p = has(rt.program) ? rt.program : JSON.parse('{}');
  const proj = p.project;
  const f = has(p.facts) ? p.facts : JSON.parse('{}');
  const g = rt.gfx;
  const add = (s: Section, label: string, value: string): void => { s.labels.push(label); s.values.push(value); };
  const prog = new Section(); prog.title = 'Program';
  add(prog, 'name', has(proj) ? or(str(proj.name), '(no name in zinc.json)') : '(no zinc.json)');
  if (has(proj)) { add(prog, 'id', or(str(proj.id), '(none)')); add(prog, 'version', or(str(proj.version), '(none)')); }
  add(prog, 'entry', or(str(p.entry), 'unknown'));
  add(prog, 'project', or(str(p.projectDir), 'unknown'));
  add(prog, 'zinc', or(str(p.zinc), 'unknown'));
  add(prog, 'run', r.dev === true ? 'dev run (zinc dev)' : 'zinc run (not a dev run)');
  add(prog, 'uptime', duration(num(rt.uptimeMs)));
  add(prog, 'pid', '' + num(rt.pid));
  out.push(prog);
  const mach = new Section(); mach.title = 'Where it runs';
  add(mach, 'on', where.length > 0 ? 'a paired device: ' + where : 'this machine');
  add(mach, 'system', str(r.os) + ' ' + str(r.release));
  add(mach, 'arch', str(r.arch));
  add(mach, 'machine', or(str(r.cpu), 'cpu') + ', ' + num(r.cores) + ' cores, ' + bytes(num(r.memory)));
  add(mach, 'host name', str(r.host));
  out.push(mach);
  const eng = new Section(); eng.title = 'Engine';
  add(eng, 'engine', engineText(str(rt.engine)));
  add(eng, 'profile', or(str(p.profile), 'host'));
  out.push(eng);
  const ren = new Section(); ren.title = 'Renderer';
  add(ren, 'renderer', rendererText(rt));
  const gpu = str(g.info.gpu).length > 0 ? str(g.info.gpu) : str(g.info.gl_renderer);
  if (gpu.length > 0) add(ren, 'GPU', gpu);
  add(ren, 'window', num(r.width) + ' x ' + num(r.height) + ' (' + num(g.pixels[0]) + ' x ' + num(g.pixels[1]) + ' pixels)');
  add(ren, 'scale', num(g.scale) + 'x' + (num(g.scale) > 1 ? ' (HiDPI)' : ''));
  add(ren, 'vsync', rt.headless === true ? 'none (headless)' : or(str(g.info.vsync), 'unknown'));
  out.push(ren);
  const code = new Section(); code.title = 'Code';
  const plugins: string[] = [];
  if (has(f.plugins)) for (const x of f.plugins) plugins.push(str(x.name) + (x.native === true ? ' (native)' : has(x.backend) ? ' (' + str(x.backend) + ')' : ' (Zinc)'));
  add(code, 'plugins', plugins.length > 0 ? plugins.join(', ') : 'none');
  add(code, 'files', num(f.files) + ' source files' + (has(f.functions) ? ', ' + num(f.functions) + ' functions compiled' : ''));
  const res = r.resources;
  const fonts = has(res['baked.fonts']) ? num(res['baked.fonts'].objects) : 0, images = has(res['baked.images']) ? num(res['baked.images'].objects) : 0;
  add(code, 'assets', fonts + ' fonts, ' + images + ' images baked');
  out.push(code);
  const feat = new Section(); feat.title = 'Features';
  const imports: string[] = [];
  if (has(f.imports)) for (const m of f.imports) imports.push(str(m));
  add(feat, 'imports', imports.length > 0 ? imports.join(', ') : 'none');
  const perms: string[] = [];
  if (has(proj) && has(proj.permissions)) for (const x of proj.permissions) perms.push(str(x));
  add(feat, 'permissions', perms.length > 0 ? perms.join(', ') : has(proj) && proj.permissionsDeclared === true ? 'none' : 'not declared');
  out.push(feat);
  const wk = new Section(); wk.title = 'Workers';
  add(wk, 'workers', ws.length === 0 ? 'none (the main thread only)' : ws.length + (ws.length === 1 ? ' worker' : ' workers'));
  for (const t of ws) add(wk, t.state, threadLine(t));
  out.push(wk);
  const perf = new Section(); perf.title = 'Performance';
  add(perf, 'frame rate', has(g.fps) ? Math.round(num(g.fps) * 10) / 10 + ' fps (last ' + num(g.frames) + ' frames)' : 'no frame yet');
  if (has(g.lastFrameUs)) add(perf, 'last frame', msText(num(g.lastFrameUs)));
  if (has(g.phasesUs)) {
    const ph: string[] = [];
    for (const k of ['app', 'input', 'anim', 'layout', 'paint', 'effects', 'diff', 'raster', 'present']) ph.push(k + ' ' + msText(num(g.phasesUs[k])));
    add(perf, 'phases', ph.join(', '));
  }
  add(perf, 'memory', bytes(num(rt.rssBytes)) + ' resident' + (has(res['runtime.blocks']) ? ', ' + num(res['runtime.blocks'].objects) + ' live blocks' : ''));
  add(perf, 'CPU time', duration(num(rt.cpuMs)) + ' (' + num(rt.cpuMs) + ' ms)');
  out.push(perf);
  return out;
}

/** Asks the program again: its card and its workers. */
export async function loadInfo(): Promise<void> {
  const r = await call('Zinc.getProgramInfo', '{}');
  await loadThreads();
  setSections(infoSections(r, threads(), device()));
  setInfoLoads(infoLoads() + 1);
}

let polling = false;
/** Starts the refresh once; it stops itself when another view is open, and the tab starts it again. */
export function watchInfo(): void {
  if (polling) return;
  polling = true;
  const tick = async (): Promise<void> => {
    if (view() !== 'info') { polling = false; return; }
    await loadInfo();
    setTimeout(() => { tick(); }, 1000);
  };
  tick();
}

/** The card as text (ZINC_INSPECTOR_DUMP=info). */
export function dumpInfo(): void {
  console.log('info:');
  for (const s of sections()) {
    console.log('  ' + s.title);
    for (let i = 0; i < s.labels.length; i++) console.log('    ' + s.labels[i] + ': ' + s.values[i]);
  }
}

function Card(p: { s: Section }): i32 {
  return <View className="flex-col gap-1 p-3 rounded-md bg-white border">
    <Text className="text-sm font-bold text-slate-900">{p.s.title}</Text>
    {p.s.labels.map((l: string, i: i32) => <View className="flex-row gap-2">
      <Text className="w-28 text-xs text-slate-500">{l}</Text>
      <Text className="flex-1 text-xs text-slate-900">{p.s.values[i]}</Text>
    </View>)}
  </View>;
}

export function InfoView(): i32 {
  return <ScrollView className="flex-1 bg-slate-50">
    <View className="flex-col gap-2 p-3">
      {sections().length === 0 ? <Text className="text-xs text-slate-500">Attach to a program to see what it is and how it runs</Text> : <View />}
      {sections().map((s: Section) => <Card s={s} />)}
    </View>
  </ScrollView>;
}
