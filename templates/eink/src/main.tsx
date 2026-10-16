// Two pages for e-paper: Today (a list ticked with the pen) and Sketch (ink). Black on white, large targets, nothing moves unless touched.
import { createSignal, render, Show } from 'zinc:ui/solid';
import { Ink, InkCanvas, parseStrokes } from 'zinc:ink';
import { TodoList } from './todo';
import { loadTodo, saveTodo, loadSketch, saveSketch } from './store';

const todo = loadTodo();
const [version, setVersion] = createSignal<i32>(0);   // bumped when the list changes: the list re-renders
const [page, setPage] = createSignal<string>('Today');
const ink = new Ink();
ink.width = 3;
const saved = loadSketch();
if (saved !== '') { ink.strokes = parseStrokes(saved); ink.stale = true; }
let savedVersion = ink.version;

function changed(): void { saveTodo(todo); setVersion(version() + 1); }

function renderTab(name: string): i32 {
  return <Button className={`grow h-[88px] items-center justify-center ${page() === name ? 'bg-black' : 'bg-white'} focus:outline-none`} onClick={() => setPage(name)}>
    <Text className={`text-[34px] font-bold ${page() === name ? 'text-white' : 'text-black'}`}>{name}</Text>
  </Button>;
}

function renderItem(i: i32): i32 {
  const t = todo.items[i];
  return <Button className="flex-row items-center gap-6 px-8 h-[96px] border-b-2 border-black bg-white focus:bg-white" onClick={() => { todo.toggle(i); changed(); }}>
    <View className={`w-[44px] h-[44px] border-[4px] border-black rounded-[6px] items-center justify-center ${t.done ? 'bg-black' : 'bg-white'}`}>
      <Text className="text-[30px] font-bold text-white">{t.done ? '✓' : ''}</Text>
    </View>
    <Text className={`grow text-[32px] text-black ${t.done ? 'line-through' : ''}`}>{t.text}</Text>
  </Button>;
}

function Today(): i32 {
  return <View className="flex-col grow">
    <View className="flex-row items-center justify-between px-8 py-6">
      <Text className="text-[40px] font-bold text-black">{version() >= 0 ? `${todo.left()} left` : ''}</Text>
      <Button className="px-6 py-3 border-[3px] border-black rounded-[8px] bg-white focus:bg-white" onClick={() => { if (todo.clearDone() > 0) changed(); }}>
        <Text className="text-[28px] text-black">Clear ticked</Text>
      </Button>
    </View>
    <View className="h-[3px] bg-black" />
    <For each={version() >= 0 ? todo.items.map((t, i: i32): i32 => i) : []}>{(i: i32) => renderItem(i)}</For>
  </View>;
}

function Sketch(): i32 {
  return <View className="flex-col grow">
    <View className="flex-row items-center gap-4 px-8 py-4">
      <Button className="px-6 py-3 border-[3px] border-black rounded-[8px] bg-white focus:bg-white" onClick={() => { ink.eraser = !ink.eraser; setVersion(version() + 1); }}>
        <Text className="text-[28px] text-black">{version() >= 0 && ink.eraser ? 'Eraser' : 'Pen'}</Text>
      </Button>
      <Button className="px-6 py-3 border-[3px] border-black rounded-[8px] bg-white focus:bg-white" onClick={() => ink.undo()}><Text className="text-[28px] text-black">Undo</Text></Button>
      <Button className="px-6 py-3 border-[3px] border-black rounded-[8px] bg-white focus:bg-white" onClick={() => ink.clear()}><Text className="text-[28px] text-black">Clear</Text></Button>
    </View>
    <View className="h-[3px] bg-black" />
    <InkCanvas ink={ink} className="grow" />
  </View>;
}

function App(): i32 {
  return <View className="flex-col w-full h-full bg-white">
    <View className="flex-row items-center px-8 h-[96px]"><Text className="text-[44px] font-bold text-black">{'{{name}}'}</Text></View>
    <View className="flex-row border-y-[3px] border-black">{renderTab('Today')}{renderTab('Sketch')}</View>
    <Show when={page() === 'Today'}><Today /></Show>
    <Show when={page() === 'Sketch'}><Sketch /></Show>
  </View>;
}

render(App, 0xffffff, (dt: number) => { if (ink.version !== savedVersion) { savedVersion = ink.version; saveSketch(ink.toJSON()); } });
