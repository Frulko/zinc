// The forms of the editor on a schema kept here, with a field of every kind: what the generated form draws for each, whatever the
// pinball format becomes. tests/t1/pinball3d_editor.sh takes its pixels; the forms of the real format are checked there by what they
// write, not by how many lines they have.
//   zinc run examples/pinball3d-editor/src/formcheck.tsx
import { createSignal, render } from 'zinc:ui/solid';
import { Schema, Field } from '../../pinball3d/src/format/schema';
import { valueAt, fieldIn } from './doc';
import { Source, Fields, Help } from './form';

const sounds = new Schema('gadget sounds', 'The sound of each event of a gadget.');
sounds.ref('hit', 'sounds', 'When the ball hits it.');
const step = new Schema('step', 'One step.');
step.text('text', '', 'What it asks for.');

const gadget = new Schema('gadget', 'A thing with a field of every kind.');
gadget.id('gadgets', 'Its name: required, so it has no way back to a default.');
gadget.text('group', '', 'A text.');
gadget.num('speed', 120, 'A number with limits and a unit.').range(0, 500).withUnit('cm/s');
gadget.int('count', 3, 'A whole number that holds its default.').range(1, 10);
gadget.num('rest', 25, 'An angle.').range(-360, 360).withRole('direction').withUnit('degrees');
gadget.bool('closed', false, 'Yes or no.');
gadget.color('color', '#b0b8c0', 'A colour.');
gadget.choice('kind', ['standup', 'drop'], 'One of two words: both are shown.');
gadget.choice('wave', ['sine', 'square', 'triangle', 'sawtooth', 'noise'], 'One of many words: a list.');
gadget.ref('look', 'looks', 'The name of one of the looks, or none.');
gadget.tuple('at', [0, 0], 'A point.').must().withRole('point').withUnit('cm');
gadget.tuple('scale', [1, 1, 1], 'Three numbers.');
gadget.asset('file', 'sound', 'A file of the folder.');
gadget.rows('points', 2, 3, 2, 'A path.').withRole('path').withUnit('cm');
gadget.texts('ranks', 'Texts, one per line.');
gadget.obj('sounds', sounds, 'An object: a heading and its own fields.');
gadget.list('steps', step, 'A list of objects.');

const [rev, setRev] = createSignal<i32>(0);
const data: any = {
  id: 'gadget1', group: 'pops', speed: 240, count: 3, rest: -155, closed: true, color: '#ff7a33', kind: 'drop', wave: 'triangle', look: 'steel', at: [23.85, 41], scale: [4, 4, 3.2],
  file: 'clack.wav', points: [[1, 92], [1, 27, 1], [50, 27]], ranks: ['Deckhand', 'Rigger', 'Tug Pilot'], sounds: { hit: '' }, steps: [{ text: 'one' }, { text: 'two' }],
};
/** The fixture as a form reads it: no check but the kinds of the controls. */
class Fixture extends Source {
  get(path: string): any { rev(); return valueAt(data, path); }
  isDefault(path: string): boolean { const f = fieldIn(gadget, path); return f !== null && JSON.stringify(valueAt(data, path)) === JSON.stringify(f.def); }
  names(space: string): string[] { return space === 'looks' ? ['steel', 'rubber', 'glass'] : space === 'sounds' ? ['clack', 'hum'] : []; }
  set(path: string, value: any): void { data[path] = value; setRev(rev() + 1); }   // the fields of the gadget itself: enough to see a control answer
  field(path: string): Field | null { return fieldIn(gadget, path); }
  summary(path: string): string { return `${valueAt(data, path).text}`; }
  files(kind: string): string[] { return kind === 'sound' ? ['clack.wav', 'thud.wav'] : []; }
  fileNote(name: string): string { return name === 'clack.wav' ? '0.3 s' : ''; }
}
const fixture = new Fixture();

function App(): i32 {
  return <view class="w-full h-full flex-col bg-zinc-900">
    <scroll class="grow basis-0 min-h-0 flex-col py-2"><Fields src={fixture} schema={gadget} path="" whole={true} /></scroll>
    <Help src={fixture} />
  </view>;
}
render(App, 0x18181b, null);
