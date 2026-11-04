// Wire data becomes small typed records before it reaches the native UI.
export function str(v: any, fallback: string = ''): string { return typeof v === 'string' ? v as string : fallback; }
export function num(v: any, fallback: number = 0): number { return typeof v === 'number' ? v as number : fallback; }
export class Transition { kind: string = 'instant'; duration: number = 0; easing: string = 'linear'; }
export class Action { key: string = ''; trigger: string = ''; action: string = ''; target: string = ''; delay: number = 0; transition: Transition = new Transition(); }
export class Point { at: number = 0; value: number = 0; easing: string = 'linear'; }
export class Track { key: string = ''; points: Point[] = []; }
export class Native { kind: string = ''; outlet: string = ''; event: string = ''; min: number = 0; max: number = 100; step: number = 1; value: number = 0; stickToBottom: boolean = false; items: string = ''; itemHeight: number = 72; }
export class Layer {
  id: string = ''; name: string = ''; codeName: string = ''; type: string = 'View'; classes: string = '';
  imageFit: string = 'stretch';
  text: string = ''; assetPath: string = ''; children: Layer[] = []; actions: Action[] = []; tracks: Track[] = [];
  native: Native = new Native();
  fontFamily: string = ''; fontStyle: string = '';
  styleKeys: string[] = []; styleValues: number[] = [];
}
export class Screen { group: string = ''; minWidth: number = 0; id: string = ''; name: string = ''; width: number = 360; height: number = 480; duration: number = 0; tree: Layer = new Layer(); }
export class Font { family: string = ''; style: string = ''; extraction: string = ''; name: string = ''; path: string = ''; }
export class Document { name: string = ''; initial: string = ''; screens: Screen[] = []; fonts: Font[] = []; warnings: string[] = []; }
function layer(v: any): Layer {
  const n = new Layer();
  n.id = str(v.id); n.name = str(v.name); n.codeName = str(v.codeName); n.type = str(v.type); n.classes = str(v.classes);
  n.imageFit = str(v.imageFit, 'stretch'); n.text = str(v.text); n.assetPath = str(v.assetPath);
  if (v.native !== undefined && v.native !== null) { const c = v.native; n.native.kind = str(c.kind); n.native.outlet = str(c.outlet); n.native.event = str(c.event); n.native.min = num(c.min); n.native.max = num(c.max,100); n.native.step = num(c.step,1); n.native.value = num(c.value); n.native.stickToBottom = c.stickToBottom === true; n.native.items = str(c.items); n.native.itemHeight = num(c.itemHeight,72); }
  if (v.font !== undefined && v.font !== null) { n.fontFamily = str(v.font.family); n.fontStyle = str(v.font.style); }
  if (Array.isArray(v.numbers)) for (const pair of v.numbers) { n.styleKeys.push(str(pair.key)); n.styleValues.push(num(pair.value)); }
  if (Array.isArray(v.children)) for (const c of v.children) n.children.push(layer(c));
  if (Array.isArray(v.interactions)) for (const a of v.interactions) {
    const action = new Action(); action.key = str(a.key); action.trigger = str(a.trigger); action.action = str(a.action); action.target = str(a.target); action.delay = num(a.delay);
    action.transition.kind = str(a.transition.kind); action.transition.duration = num(a.transition.duration); action.transition.easing = str(a.transition.easing);
    n.actions.push(action);
  }
  if (Array.isArray(v.motion)) for (const t of v.motion) {
    const track = new Track(); track.key = str(t.key);
    for (const p of t.points) { const point = new Point(); point.at = num(p.at); point.value = num(p.value); point.easing = str(p.easing, 'linear'); track.points.push(point); }
    n.tracks.push(track);
  }
  return n;
}
export function readDocument(v: any): Document {
  const d = new Document(); d.name = str(v.name); d.initial = str(v.initial);
  for (const s of v.screens) { const screen = new Screen(); screen.group = str(s.group); screen.minWidth = num(s.minWidth); screen.id = str(s.id); screen.name = str(s.name); screen.width = num(s.width, 360); screen.height = num(s.height, 480); screen.duration = num(s.duration); screen.tree = layer(s.tree); d.screens.push(screen); }
  for (const f of v.fonts) { const font = new Font(); font.family = str(f.family); font.style = str(f.style); font.extraction = str(f.extraction); font.name = str(f.name); font.path = str(f.path); d.fonts.push(font); }
  for (const w of v.warnings) d.warnings.push(str(w));
  return d;
}
