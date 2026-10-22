// A program written before 0.7, when <Button> drew a slate fill with padding and <Input>/<TextArea> a dark slate field.
import { render, createSignal } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
const SMALL = 'h-6 w-6 bg-transparent';
const FIELD = 'bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-100';
function fieldClass(): string { return 'h-9'; }
function App(): i32 {
  const [on, setOn] = createSignal(false);
  const p = ui.PanResponder.create({ onStartShouldSetPanResponder: (e: ui.ResponderEvent, g: ui.GestureState): boolean => true });
  return <View className="flex-col gap-2 p-4">
    <Button className="bg-slate-700 px-2 py-1" onClick={() => setOn(!on())}><Text>bare</Text></Button>
    <Button className="px-2 py-1 bg-blue-600 pl-3"><Text>fill and one side</Text></Button>
    <Button className="bg-blue-600 px-4 py-2 rounded"><Text>all set</Text></Button>
    <Button className="bg-slate-700 hover:bg-red-500 px-4 py-2 md:bg-red-700"><Text>variants only</Text></Button>
    <Button className={on() ? 'px-3 py-1 bg-red-600' : 'py-1 px-3 bg-slate-800'}><Text>ternary</Text></Button>
    <Button className={'px-2 py-1 ' + SMALL}><Text>constant</Text></Button>
    <Button className={`grow ${on() ? 'bg-sky-600' : 'bg-white'} p-1`}><Text>template</Text></Button>
    <Input className="text-[14px] py-1.5 grow h-11 px-3 rounded-lg bg-white border border-slate-300" placeholder="light fill: no light text" />
    <Input className={'border border-slate-600 rounded-md text-[14px] px-2 py-1.5 text-slate-100 h-8 ' + (on() ? 'bg-white' : 'bg-black')} />
    <Input className={`w-full ${FIELD}`} />
    <Input className="border border-slate-600 rounded-md text-[14px] px-2 py-1.5" bg={0xffffff} />
    <TextArea className="bg-slate-800 border border-slate-600 rounded-md text-[14px] px-2 py-1.5 text-slate-100" rows={3} />
    <Input className={fieldClass()} />
    <Button {...p.panHandlers}><Text>spread</Text></Button>
  </View>;
}
render(App, 0xffffff, null);
