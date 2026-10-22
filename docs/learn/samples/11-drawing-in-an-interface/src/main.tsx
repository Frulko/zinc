import { createSignal, render } from 'zinc:ui/solid';
import { rrect, stroke } from 'zinc:gfx';

const [petals, setPetals] = createSignal<i32>(6);
let time = 0;   // seconds since the start, moved forward every frame

function change(by: i32): void {
  const next = petals() + by;
  if (next < 3 || next > 12) return;
  setPetals(next);
  console.log(`petals: ${petals()}`);
}

function flower(x: i32, y: i32, w: i32, h: i32): void {
  const cx = x + w / 2, cy = y + h / 2;          // the middle of the canvas
  const reach = Math.min(w, h) * 0.22;           // how far the petals are from the middle
  stroke([cx, cy, cx, y + h], 8, 0x2f8f57, 255, false);
  for (let i = 0; i < petals(); i++) {
    const angle = time * 0.5 + (i * 2 * Math.PI) / petals();
    const px = cx + Math.cos(angle) * reach, py = cy + Math.sin(angle) * reach;
    rrect(px - 40, py - 40, 80, 80, 40, 0xf27aa6, 220);
  }
  rrect(cx - 30, cy - 30, 60, 60, 30, 0xe8b06a, 255);
}

function App(): i32 {
  return <View className="w-full h-full flex-row">
    <View className="w-[200px] p-6 gap-4 bg-white">
      <Text className="text-2xl font-bold text-[#1d1b18]">Flower</Text>
      <Text className="text-base text-[#625d55]">{`${petals()} petals`}</Text>
      <Button className="h-10 rounded-full bg-[#e9e6df]" onClick={() => change(-1)}>
        <Text className="text-base text-[#1d1b18]">Fewer</Text>
      </Button>
      <Button className="h-10 rounded-full bg-[#5746e0]" onClick={() => change(1)}>
        <Text className="text-base text-white">More</Text>
      </Button>
    </View>
    <Canvas className="grow" onDraw={flower} />
  </View>;
}

render(App, 0xdff3e4, (dt: number) => { time += dt; });
