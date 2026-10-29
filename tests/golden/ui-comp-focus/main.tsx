// A field whose value comes from its component's props (the component renders again at each character) keeps the focus, its caret and
// what it holds: typing goes on in it.
import * as ui from 'zinc:ui';
import { render, createSignal } from 'zinc:ui/solid';
import { quit } from 'zinc:gfx';
function Field(props: { value: string; onInput: (v: string) => void }): i32 {
  return <View className="flex-row w-60 h-8 border">
    <Input className="grow" value={props.value} onInput={props.onInput} placeholder="search" />
    {props.value !== '' ? <View className="w-4 h-4 bg-red-300" /> : <View />}
  </View>;
}
const [q, setQ] = createSignal<string>('');
function App(): i32 {
  return <View className="flex-col w-full h-full bg-white"><Field value={q()} onInput={(v: string) => setQ(v)} /><Text>{'q=' + q()}</Text></View>;
}
let n = 0, field = -1;
render(App, 0xffffff, (dt: number) => {
  n++;
  if (n === 3) ui.pointerAt(30, 16, true);
  if (n === 4) { ui.pointerAt(30, 16, false); }
  if (n === 5) { console.log('clicked: focused field', ui.focusedField() >= 0); ui.insertText('j'); }
  if (n === 7) { console.log('after j: focused field', ui.focusedField() >= 0, 'q', q()); ui.insertText('a'); }
  if (n === 10) { console.log('after a: focused field', ui.focusedField() >= 0, 'q', q()); quit(); }
});
