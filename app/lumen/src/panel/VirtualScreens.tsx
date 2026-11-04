// Displays with no screen behind them: room to work in, a target for screen sharing, a source to mirror on a monitor.
import * as M from 'zinc:monitors';
import { createSignal } from 'zinc:ui/solid';
import { CheckList, Choice, Segmented } from '../components/GlassChoice';
import { GlassSwitch } from '../components/GlassSwitch';
import { GlassButton } from '../components/GlassButton';
import { TEXT_ROW, TEXT_SMALL, palette } from '../theme';
import { addVirtual, displays, removeVirtual } from '../state';

interface Size { width: number; height: number }
const SIZES: Size[] = [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 2560, height: 1440 }, { width: 3840, height: 2160 }, { width: 1080, height: 1920 }];
const SIZE_CHOICES: Choice[] = SIZES.map((s: Size, i: i32) => ({ value: i, label: `${s.width} × ${s.height}` }));
const RATE_CHOICES: Choice[] = [{ value: 30, label: '30 Hz' }, { value: 60, label: '60 Hz' }, { value: 120, label: '120 Hz' }];

function nextVirtualName(): string {
  const taken = displays().map((d: M.Display) => d.name);
  let n = 1;
  while (taken.indexOf(`Lumen Virtual ${n}`) >= 0) n++;
  return `Lumen Virtual ${n}`;
}

export function VirtualScreens(): i32 {
  const [sizeIndex, setSizeIndex] = createSignal<number>(1);
  const [rate, setRate] = createSignal<number>(60);
  const [hidpi, setHidpi] = createSignal<boolean>(true);
  const create = (): void => {
    const size = SIZES[sizeIndex()];
    addVirtual({ name: nextVirtualName(), width: size.width, height: size.height, refresh: rate(), hidpi: hidpi() });
  };
  return <View className="gap-1">
    <CheckList choices={() => SIZE_CHOICES} value={sizeIndex} onChange={setSizeIndex} />
    <Segmented choices={() => RATE_CHOICES} value={rate} onChange={setRate} />
    <GlassSwitch label="HiDPI" value={hidpi} onChange={setHidpi} />
    <View className="flex-row justify-end"><GlassButton label="Create" onPress={create} /></View>
    <For each={displays().filter((d: M.Display) => d.virtual)}>{(d: M.Display) =>
      <View className="flex-row items-center justify-between">
        <View className="shrink">
          <Text className={`${TEXT_ROW} ${palette().label}`}>{d.name}</Text>
          <Text className={`${TEXT_SMALL} ${palette().secondary}`}>{`${d.width} × ${d.height} · ${Math.round(d.refresh)} Hz`}</Text>
        </View>
        <GlassButton label="Remove" onPress={() => removeVirtual(d.id)} />
      </View>}
    </For>
    <Text className={`${TEXT_SMALL} ${palette().secondary}`}>They live while Lumen runs and come back at its next launch.</Text>
  </View>;
}
