// zinc-ui/1: portable, data-only UI documents. Shared by CLI and Figma's plugin UI.
import { styleEntry } from './ui-style.ts';
export type Scalar = string | number | boolean;
export interface Binding { input: string }
export type Value = Scalar | Binding;
export type UIStyle = Record<string, string | number | Binding>;
export interface Input { type: 'string' | 'number' | 'boolean'; default: Scalar }
export interface Action { type: 'navigate' | 'back' | 'emit'; target?: string; event?: string; value?: Value }
export interface UINode {
  id: string; type: string; style?: UIStyle; styles?: string[];
  text?: Value; value?: Value; placeholder?: string; src?: string;
  inputs?: Record<string, Value>; events?: Record<string, string>;
  onClick?: Action[]; onInput?: string; children?: UINode[];
}
export interface Component {
  name: string; inputs?: Record<string, Input>; events?: Record<string, 'void' | 'string' | 'number' | 'boolean'>;
  root?: UINode; screens?: { id: string; root: UINode }[]; initial?: string;
}
export interface UIDocument {
  format: 'zinc-ui/1'; name: string; entry: string; width: number; height: number;
  styles?: Record<string, UIStyle>; components: Component[]; assets?: string[];
}
const hosts = new Set(['view', 'text', 'button', 'image', 'scroll', 'input', 'textarea']);
const reserved = new Set('break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static implements interface package private protected public await constructor prototype toString valueOf hasOwnProperty'.split(' '));
function ident(s: unknown): asserts s is string {
  if (typeof s !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*$/.test(s) || reserved.has(s) || s.startsWith('__')) throw new Error(`invalid public identifier: ${String(s)}`);
}
function object(v: unknown, allowed: string[], at: string): asserts v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${at}: expected object`);
  for (const k of Object.keys(v)) if (!allowed.includes(k)) throw new Error(`${at}: unknown field '${k}'`);
}
function record(v: unknown, at: string): asserts v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${at}: expected object`);
}
function text(v: unknown, at: string): asserts v is string { if (typeof v !== 'string' || v.length > 100000) throw new Error(`${at}: expected bounded string`); }
export function assetPath(v: unknown): asserts v is string {
  if (typeof v !== 'string' || v.length > 180 || !/^[A-Za-z0-9_-][A-Za-z0-9_./-]*\.(png|svg|ttf)$/.test(v) || v.split('/').some(p => !p || p === '.' || p === '..')) throw new Error(`unsafe asset path: ${String(v)}`);
}
/** Reject unknown behavior rather than silently changing a prototype. Limits also bound generated code. */
export function validateDocument(value: unknown): UIDocument {
  object(value, ['format', 'name', 'entry', 'width', 'height', 'styles', 'components', 'assets'], 'document');
  if (value.format !== 'zinc-ui/1') throw new Error('expected format zinc-ui/1');
  ident(value.name); ident(value.entry);
  for (const k of ['width', 'height']) if (!Number.isInteger(value[k]) || (value[k] as number) < 1 || (value[k] as number) > 4096) throw new Error(`${k}: expected 1..4096`);
  if (!Array.isArray(value.components) || !value.components.length || value.components.length > 128) throw new Error('expected 1..128 components');
  if (value.assets !== undefined && (!Array.isArray(value.assets) || value.assets.length > 512)) throw new Error('invalid assets');
  for (const a of (value.assets ?? []) as unknown[]) assetPath(a);
  if (new Set(value.assets as string[] ?? []).size !== (value.assets as string[] ?? []).length) throw new Error('duplicate asset');
  const d = value as unknown as UIDocument, components = new Map<string, Component>();
  for (const c of d.components) {
    object(c, ['name', 'inputs', 'events', 'root', 'screens', 'initial'], 'component'); ident(c.name);
    if (!/^[A-Z]/.test(c.name) || hosts.has(c.name.toLowerCase()) || ['StyleSheet', 'Show'].includes(c.name) || components.has(c.name)) throw new Error(`invalid/duplicate component ${c.name}`);
    components.set(c.name, c);
    if (c.inputs !== undefined) record(c.inputs, 'inputs');
    if (c.events !== undefined) record(c.events, 'events');
    for (const [name, input] of Object.entries(c.inputs ?? {})) {
      ident(name); object(input, ['type', 'default'], `${c.name}.${name}`);
      if (!['number', 'boolean', 'string'].includes(input.type) || typeof input.default !== input.type || (typeof input.default === 'number' && !Number.isFinite(input.default))) throw new Error(`invalid input ${name}`);
    }
    for (const [name, type] of Object.entries(c.events ?? {})) { ident(name); if (!['void', 'number', 'boolean', 'string'].includes(type) || c.inputs?.[name]) throw new Error(`invalid event ${name}`); }
  }
  if (!components.has(d.entry)) throw new Error('entry component is missing');
  let count = 0;
  const deps = new Map<string, Set<string>>();
  function valueType(v: unknown, c: Component): string {
    if (typeof v === 'string' || typeof v === 'boolean') return typeof v;
    if (typeof v === 'number' && Number.isFinite(v)) return 'number';
    object(v, ['input'], 'binding'); ident(v.input);
    const input = c.inputs?.[v.input]; if (!input) throw new Error(`unknown input ${c.name}.${v.input}`);
    return input.type;
  }
  function style(s: unknown, c: Component): void {
    record(s, 'style');
    if (Object.keys(s).length > 80) throw new Error('too many style properties');
    for (const [k, v] of Object.entries(s)) {
      if (typeof v === 'string' || typeof v === 'number') styleEntry(k, v);
      else {
        if (valueType(v, c) !== 'number') throw new Error(`style ${k} requires a number binding`);
        styleEntry(k, c.inputs![(v as Binding).input].default as number);
      }
    }
  }
  if (d.styles !== undefined) record(d.styles, 'styles');
  for (const [name, s] of Object.entries(d.styles ?? {})) { ident(name); style(s, { name: 'styles' }); }
  for (const c of d.components) {
    deps.set(c.name, new Set());
    const ids = new Set<string>();
    if ((c.root !== undefined) === (c.screens !== undefined)) throw new Error(`${c.name}: provide root OR screens`);
    const screens = new Set<string>();
    if (c.screens) {
      if (!Array.isArray(c.screens) || !c.screens.length || c.screens.length > 128) throw new Error('invalid screens');
      for (const s of c.screens) { object(s, ['id', 'root'], 'screen'); text(s.id, 'screen id'); if (screens.has(s.id)) throw new Error('duplicate screen'); screens.add(s.id); }
      if (!c.initial || !screens.has(c.initial)) throw new Error(`${c.name}: missing initial screen`);
    } else if (c.initial !== undefined) throw new Error('initial requires screens');
    const walk = (n: UINode, depth: number) => {
      if (++count > 10000 || depth > 64) throw new Error('UI exceeds 10000 nodes / 64 levels');
      object(n, ['id', 'type', 'style', 'styles', 'text', 'value', 'placeholder', 'src', 'inputs', 'events', 'onClick', 'onInput', 'children'], 'node');
      text(n.id, 'node id'); text(n.type, 'node type'); if (!n.id || ids.has(n.id)) throw new Error(`duplicate/empty node id ${n.id}`); ids.add(n.id);
      if (n.style !== undefined) style(n.style, c);
      if (n.styles !== undefined && (!Array.isArray(n.styles) || n.styles.length > 80)) throw new Error('invalid style references');
      for (const s of n.styles ?? []) if (!Object.hasOwn(d.styles ?? {}, s)) throw new Error(`unknown style ${s}`);
      const child = components.get(n.type);
      if (!hosts.has(n.type) && !child) throw new Error(`unknown component ${n.type}`);
      if (child) {
        deps.get(c.name)!.add(child.name);
        if (n.style || n.styles || n.children || n.text !== undefined || n.value !== undefined || n.src || n.onClick || n.onInput || n.placeholder) throw new Error('component instances accept inputs/events; put layout on a wrapping view');
        if (n.inputs !== undefined) record(n.inputs, 'instance inputs');
        if (n.events !== undefined) record(n.events, 'instance events');
        for (const [k, v] of Object.entries(n.inputs ?? {})) if (!child.inputs?.[k] || valueType(v, c) !== child.inputs[k].type) throw new Error(`input type mismatch: ${n.type}.${k}`);
        for (const [k, v] of Object.entries(n.events ?? {})) if (!child.events?.[k] || !c.events?.[v] || child.events[k] !== c.events[v]) throw new Error(`event type mismatch: ${n.type}.${k}`);
      } else if (n.inputs || n.events) throw new Error('inputs/events only apply to component instances');
      if (n.text !== undefined) { valueType(n.text, c); if (!['text', 'button'].includes(n.type)) throw new Error('text only applies to text/button'); }
      if (n.value !== undefined && (!['input', 'textarea'].includes(n.type) || valueType(n.value, c) !== 'string')) throw new Error('value requires a text field and a string');
      if (n.placeholder !== undefined) { text(n.placeholder, 'placeholder'); if (!['input', 'textarea'].includes(n.type)) throw new Error('placeholder requires text field'); }
      if (n.src !== undefined) { assetPath(n.src); if (n.type !== 'image' || !d.assets?.includes(n.src)) throw new Error(`missing image asset ${n.src}`); }
      if (n.onInput !== undefined && (!['input', 'textarea'].includes(n.type) || c.events?.[n.onInput] !== 'string')) throw new Error('onInput requires a string event and text field');
      if (n.onClick !== undefined && (!Array.isArray(n.onClick) || n.onClick.length > 16)) throw new Error('invalid actions');
      for (const a of n.onClick ?? []) {
        object(a, ['type', 'target', 'event', 'value'], 'action');
        if (a.type === 'navigate') { if (!a.target || !screens.has(a.target) || a.event !== undefined || a.value !== undefined) throw new Error(`invalid navigation ${a.target}`); }
        else if (a.type === 'back') { if (!c.screens || Object.keys(a).length !== 1) throw new Error('invalid back action'); }
        else if (a.type === 'emit') {
          const type = a.event && c.events?.[a.event];
          if (!type || a.target !== undefined || (type === 'void' ? a.value !== undefined : valueType(a.value, c) !== type)) throw new Error(`invalid event ${a.event}`);
        } else throw new Error(`unsupported action ${a.type}`);
      }
      if (n.children !== undefined && (!Array.isArray(n.children) || ['text', 'input', 'textarea', 'image'].includes(n.type))) throw new Error('invalid children');
      for (const ch of n.children ?? []) walk(ch, depth + 1);
    };
    if (c.root) walk(c.root, 0); else for (const s of c.screens!) walk(s.root, 0);
  }
  const visited = new Set<string>();
  const visit = (name: string, chain: Set<string>) => {
    if (visited.has(name)) return;
    if (chain.has(name)) throw new Error(`recursive component ${name}`);
    const next = new Set(chain); next.add(name); for (const k of deps.get(name)!) visit(k, next); visited.add(name);
  };
  for (const c of d.components) visit(c.name, new Set());
  return d;
}
const q = JSON.stringify;
/** Readable Solid TSX, no runtime interpreter and no injected source expressions. */
export function generateUI(input: unknown): string {
  const d = validateDocument(input), out = ["// Generated from zinc-ui/1. Re-export replaces this file; keep application logic in your caller.", "import { createSignal } from 'zinc:ui/solid';", "import { StyleSheet } from 'zinc:ui';"];
  if (d.styles && Object.keys(d.styles).length) out.push(`const __shared = StyleSheet.create(${JSON.stringify(d.styles, null, 2)});`);
  for (const c of d.components) {
    const read = (v: Value): string => typeof v === 'object' ? `(props.${v.input} !== undefined ? props.${v.input}() : ${q(c.inputs![v.input].default)})` : q(v);
    out.push(`export interface ${c.name}Props {`);
    for (const [name, i] of Object.entries(c.inputs ?? {})) out.push(`  ${name}?: () => ${i.type};`);
    for (const [name, t] of Object.entries(c.events ?? {})) out.push(`  ${name}?: (${t === 'void' ? '' : 'value: ' + t}) => void;`);
    out.push('}', `export function ${c.name}(props: ${c.name}Props): i32 {`);
    if (c.screens) out.push(`  const [screen, setScreen] = createSignal<string>(${q(c.initial)});`, '  const history: string[] = [];');
    const action = (a: Action): string => a.type === 'navigate' ? `if (screen() !== ${q(a.target)}) { history.push(screen()); setScreen(${q(a.target)}); }` : a.type === 'back' ? 'if (history.length > 0) setScreen(history.pop());' : `if (props.${a.event} !== undefined) props.${a.event}(${a.value === undefined ? '' : read(a.value)});`;
    const node = (n: UINode, indent: string): string => {
      const attrs: string[] = [];
      if (n.styles?.length || n.style) {
        const layers = (n.styles ?? []).map(s => `__shared.${s}`);
        if (n.style) layers.push(`{ ${Object.entries(n.style).map(([k, v]) => `${q(k)}: ${read(v)}`).join(', ')} }`);
        attrs.push(`style={[${layers.join(', ')}]}`);
      }
      if (n.onClick?.length) attrs.push(`onClick={() => { ${n.onClick.map(action).join(' ')} }}`);
      if (n.onInput) attrs.push(`onInput={(value: string) => { if (props.${n.onInput} !== undefined) props.${n.onInput}(value); }}`);
      for (const [k, v] of Object.entries(n.inputs ?? {})) attrs.push(`${k}={() => ${read(v)}}`);
      for (const [k, v] of Object.entries(n.events ?? {})) {
        const t = c.events![v]; attrs.push(`${k}={(${t === 'void' ? '' : 'value: ' + t}) => { if (props.${v} !== undefined) props.${v}(${t === 'void' ? '' : 'value'}); }}`);
      }
      if (n.value !== undefined) attrs.push(`value={${read(n.value)}}`);
      if (n.placeholder !== undefined) attrs.push(`placeholder={${q(n.placeholder)}}`);
      if (n.src) attrs.push(`src={${q(n.src)}}`);
      const start = `${indent}<${n.type}${attrs.length ? ' ' + attrs.join(' ') : ''}`;
      const kids = (n.children ?? []).map(ch => node(ch, indent + '  '));
      if (n.text !== undefined) kids.unshift(`${indent}  {${typeof n.text === 'object' && c.inputs![n.text.input].type !== 'string' ? "'' + " : ''}${read(n.text)}}`);
      return kids.length ? `${start}>\n${kids.join('\n')}\n${indent}</${n.type}>` : `${start} />`;
    };
    if (c.root) out.push('  return (', node(c.root, '    '), '  );');
    else {
      out.push('  return <view style={{ width: "100%", height: "100%" }}>');
      for (const s of c.screens!) out.push(`    <Show when={screen() === ${q(s.id)}}>`, node(s.root, '      '), '    </Show>');
      out.push('  </view>;');
    }
    out.push('}', '');
  }
  return out.join('\n');
}
export function previewSource(d: UIDocument): string {
  const c = d.components.find(c => c.name === d.entry)!;
  const events = Object.entries(c.events ?? {}).map(([name, type]) => `${name}: (${type === 'void' ? '' : 'value: ' + type}) => { console.log(${q(name)}${type === 'void' ? '' : ', value'}); }`);
  return `// Generated preview entry. Use the exported component from your application.\nimport * as ui from 'zinc:ui';\nimport { ${d.entry} } from './design';\nconst root = ${d.entry}({ ${events.join(', ')} });\nui.mount(root, 0xffffff, null);\n`;
}
