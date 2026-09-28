// System: the backlight, the theme and the auto tour, then live figures from the chip and the runtime
// (zinc:device): memory, frame time, draw commands.
import { createSignal } from 'zinc:ui/solid';
import { Slider, Switch, Progress } from 'zinc:ui/kit';
import * as device from 'zinc:device';
import { Panel, Caption, InfoRow, tk } from '../components/ui';
import { brightness, setBrightness, dark, setDark, tour, setTour, fps, frameMs, uptime, clockText } from '../app/state';

// figures refreshed twice a second (one signal, so each row re-reads the device once per refresh)
const [refresh, setRefresh] = createSignal<i32>(0);
let clock: number = 0;
let mem: device.Memory = device.memory();
export function stepSystem(dt: number): void {
  clock += dt;
  if (clock < 0.5) return;
  clock = 0;
  mem = device.memory();
  setRefresh(refresh() + 1);
}

function kib(bytes: i32): string {
  if (bytes < 0) return 'n/a';
  return bytes >= 16 << 20 ? `${Math.round(bytes / 1048576)} MiB` : `${Math.round(bytes / 1024)} KiB`;
}
const CHIP: string = device.chip();
const MHZ: i32 = device.cpuMhz();

export function System(): i32 {
  const live = (f: () => string): (() => string) => (): string => { refresh(); return f(); };
  return <ScrollView class="grow">
    <View class="flex-col gap-3 p-2 pb-4">
      <Panel class="p-3 gap-2">
        <Caption text="DISPLAY" />
        <View class="flex-row items-center gap-2">
          <Image src="sun.svg" class="w-4 h-4" />
          <Slider value={() => brightness() * 100} onChange={(v: number) => setBrightness(v / 100)} min={5} max={100} step={5} class="w-[134]" />
          <Text class={`w-8 text-xs font-semibold text-${tk().foreground}`}>{`${Math.round(brightness() * 100)}%`}</Text>
        </View>
        <Switch checked={dark} onChange={setDark} label="Dark theme" />
        <Switch checked={tour} onChange={setTour} label="Auto tour" />
      </Panel>

      <Panel class="py-2">
        <View class="px-3 pb-1"><Caption text="ZINC HEAP" /></View>
        <View class="px-3 gap-1">
          <Progress value={() => { refresh(); return mem.zincSize > 0 ? mem.zincUsed * 100 / mem.zincSize : 0; }} accent={true} />
        </View>
        <InfoRow label="In use" value={live(() => `${kib(mem.zincUsed)} of ${kib(mem.zincSize)}`)} />
        <InfoRow label="Chip RAM free (min)" value={live(() => mem.chipFree < 0 ? 'n/a' : `${kib(mem.chipFree)} (${kib(mem.chipMinFree)})`)} />
      </Panel>

      <Panel class="py-2">
        <View class="px-3 pb-1"><Caption text="RUNTIME" /></View>
        <InfoRow label="Frame rate" value={() => `${fps()} fps`} />
        <InfoRow label="Slowest frame (0.5 s)" value={() => `${frameMs().toFixed(1)} ms`} />
        <InfoRow label="Draw commands" value={live(() => `${device.drawCmds()} / 256`)} />
        <InfoRow label="Uptime" value={() => clockText(uptime())} />
      </Panel>

      <Panel class="py-2">
        <View class="px-3 pb-1"><Caption text="HARDWARE" /></View>
        <InfoRow label="Chip" value={() => CHIP} />
        <InfoRow label="CPU" value={() => MHZ > 0 ? `${MHZ} MHz` : 'host'} />
        <InfoRow label="Display" value={() => 'ST7789 240×320 i80'} />
        <InfoRow label="Touch" value={() => 'CST820 I2C'} />
        <InfoRow label="Board" value={() => 'ESP32-2432S022'} />
      </Panel>
    </View>
  </ScrollView>;
}
