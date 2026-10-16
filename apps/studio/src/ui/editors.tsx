// Centre tabs other than the diagram: the Script editor (a Script box's code, or the read-only template of any
// other box), the generated program (read-only) and the Docs web view.
import { For, Show } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as model from '../model';
import { Box } from '../model';
import { generate, expand } from '../codegen';
import { BoxFile } from '../project';
import * as docs from '../docs';
import { Badge, HSep } from './kit';

const CODE = 'grow w-full font-mono text-[13] text-zinc-800 bg-white border-0 rounded-none';

/** Expanded template of a built-in box, as the generator will write it. */
function templateOf(b: Box): string {
  const f = model.toFile();
  const bf = f.boxes.find((x: BoxFile, _i: i32) => x.id === b.id);
  if (bf === undefined) return '';
  const d = b.def, out: string[] = [`// ${d.title} "${b.title()}" [${b.id}] — built-in box, read only`, `// ${d.description}`, ''];
  if (d.setup !== '') { out.push('// state'); out.push(expand(d.setup, bf, d)); out.push(''); }
  for (const inp of d.inputs) { out.push(`// input ${inp.name}${inp.isSignal ? '' : ` (v: ${inp.type})`}`); out.push(expand(d.handler(inp.name), bf, d)); out.push(''); }
  if (d.start !== '') { out.push('// at startup'); out.push(expand(d.start, bf, d)); }
  return out.join('\n');
}

function ScriptEditor(b: Box): i32 {
  const editable = b.type === 'script';
  return <View className="flex-col grow">
    <View className="flex-row items-center gap-2 h-[36] px-4 bg-white">
      <Text className="text-[13] font-semibold text-zinc-900">{b.title()}</Text>
      <Badge label={b.id} />
      <View className="grow" />
      <Text className="text-[12] text-zinc-500">{editable ? 'Runs when onStart fires · onDone() continues the flow' : 'Read only: add a Script box to write your own code'}</Text>
    </View>
    <HSep />
    <TextArea className={CODE} lineNumbers wrap={false} readOnly={!editable} value={editable ? (b.rev() >= 0 ? b.script : '') : templateOf(b)}
      onInput={(v: string) => { if (editable) model.setScript(b, v); }} highlight={(l: string) => ui.tsHighlight(l)} />
  </View>;
}
function selected(): Box[] { const b = model.selectedBox(); if (b === null) return []; return [b as Box]; }

export function ScriptTab(): i32 {
  return <View className="flex-col grow bg-white">
    <For each={selected()}>{(b: Box, _i: i32) => ScriptEditor(b)}</For>
    <Show when={selected().length === 0}>
      <View className="grow items-center justify-center flex-col gap-1">
        <Text className="text-sm font-medium text-zinc-500">No box selected</Text>
        <Text className="text-[12] text-zinc-400">Select a Script box to edit its code, or any box to read its template</Text>
      </View>
    </Show>
  </View>;
}

/** The whole generated program (regenerated when the diagram changes while this tab is shown). */
function code(): string { model.revision(); return generate(model.toFile(), 'project.json').code; }
export function CodeTab(): i32 {
  return <View className="flex-col grow bg-white">
    <View className="flex-row items-center gap-2 h-[36] px-4">
      <Text className="text-[13] font-semibold text-zinc-900">build/src/main.ts</Text>
      <Badge label="generated" color="blue" />
      <View className="grow" />
      <Text className="text-[12] text-zinc-500">Written on every run; edit the diagram, not this file</Text>
    </View>
    <HSep />
    <TextArea className={CODE} lineNumbers wrap={false} readOnly value={code()} highlight={(l: string) => ui.tsHighlight(l)} />
  </View>;
}

export function DocsTab(): i32 {
  return <View className="flex-col grow bg-white">
    <Canvas className="grow" onDraw={(x: i32, y: i32, w: i32, h: i32) => docs.follow(x, y, w, h)} />
  </View>;
}
