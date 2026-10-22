import { createSignal, render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';

const [dotX, setDotX] = createSignal<number>(150);
const [dotY, setDotY] = createSignal<number>(100);
const [pressed, setPressed] = createSignal<boolean>(false);
const [over, setOver] = createSignal<boolean>(false);
const [news, setNews] = createSignal<string>('Press in the box, drag, or use the arrow keys.');

function moveTo(x: number, y: number): void {
  setDotX(Math.max(0, Math.min(300, x)));
  setDotY(Math.max(0, Math.min(200, y)));
}

function down(e: ui.PointerEvent): void {
  setPressed(true);
  moveTo(e.x, e.y);
  setNews(`Pressed at ${Math.round(e.x)}, ${Math.round(e.y)} inside the box.`);
  console.log(news());
}

function drag(e: ui.PointerEvent): void {
  if (pressed()) moveTo(e.x, e.y);
}

function up(e: ui.PointerEvent): void {
  setPressed(false);
  setNews(`Let go at ${Math.round(e.x)}, ${Math.round(e.y)}.`);
  console.log(news());
}

ui.onKey((e: ui.KeyEvent) => {
  if (e.key === 'ArrowLeft') moveTo(dotX() - 10, dotY());
  else if (e.key === 'ArrowRight') moveTo(dotX() + 10, dotY());
  else if (e.key === 'ArrowUp') moveTo(dotX(), dotY() - 10);
  else if (e.key === 'ArrowDown') moveTo(dotX(), dotY() + 10);
  else return;
  e.preventDefault();   // this key is used: it does not also move the keyboard focus
  setNews(`Key ${e.key}: the dot is at ${dotX()}, ${dotY()}.`);
  console.log(news());
});

function reset(): void {
  moveTo(150, 100);
  setNews('Back to the middle.');
  console.log(news());
}

function App(): i32 {
  return <View className="w-full h-full items-center justify-center gap-4">
    <View className={`w-[300px] h-[200px] rounded-xl bg-white border-2 ${over() ? 'border-[#5746e0]' : 'border-[#e9e6df]'}`}
      onPointerDown={down} onPointerMove={drag} onPointerUp={up}
      onPointerEnter={(e: ui.PointerEvent) => setOver(true)} onPointerLeave={(e: ui.PointerEvent) => setOver(false)}>
      <View className="absolute w-6 h-6 rounded-full bg-[#f27aa6]" style={{ left: dotX() - 12, top: dotY() - 12 }} />
    </View>
    <Text className="text-base text-[#625d55]">{news()}</Text>
    <Button className="h-10 px-5 rounded-full bg-[#5746e0]" onClick={reset}>
      <Text className="text-base text-white">Reset</Text>
    </Button>
  </View>;
}

render(App, 0xf3f1ec, null);
