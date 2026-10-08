// The dashboard: four stat cards, the request rate as a line, errors as bars, the alerts; pause stops reading the source.
import { createSignal, render } from 'zinc:ui/solid';
import { theme, hex, Card, Badge, Button } from 'zinc:ui/nuxt';
import { Source, MockSource, Sample } from './source';
import { Series } from './series';
import { drawLine, drawBars, rgb } from './charts';

const WINDOW = 120;   // samples kept: 30 s at 4 a second
const cpu = new Series(WINDOW), memory = new Series(WINDOW), requests = new Series(WINDOW), errors = new Series(40);
const [tick, setTick] = createSignal<i32>(0);
const [paused, setPaused] = createSignal<boolean>(false);
const [alerts, setAlerts] = createSignal<string[]>([]);
let source: Source = new MockSource(7);

/** Feeds the dashboard from another source (see README). */
export function start(s: Source): void { source = s; }

function take(s: Sample): void {
  cpu.push(s.cpu); memory.push(s.memory); requests.push(s.requests); errors.push(s.errors);
  if (s.cpu > 85) setAlerts([`${s.t.toFixed(1)} s: CPU at ${Math.round(s.cpu)} %`].concat(alerts()).slice(0, 5));
}

function renderStat(label: string, value: () => string, change: () => number, icon: string): i32 {   // read again on every tick; change NaN: none
  return <Card class="grow basis-0">
    <View class="flex-row items-center gap-3">
      <Badge icon={icon} variant="soft" size="lg" />
      <View class="flex-col">
        <Text class={`text-xs text-${hex(theme().textMuted)}`}>{label}</Text>
        <View class="flex-row items-center gap-2">
          <Text class={`text-2xl font-semibold text-${hex(theme().textHighlighted)}`}>{tick() >= 0 ? value() : ''}</Text>
          <Text class={`text-sm text-${hex(theme().textMuted)}`}>{tick() >= 0 && !isNaN(change()) ? `${change() >= 0 ? '+' : ''}${Math.round(change())}% in 30 s` : ''}</Text>
        </View>
      </View>
    </View>
  </Card>;
}

function App(): i32 {
  return <View class={`flex-col gap-6 p-6 w-full h-full bg-${hex(theme().bg)}`}>
    <View class="flex-row items-center justify-between">
      <View class="flex-col">
        <Text class={`text-2xl font-semibold text-${hex(theme().textHighlighted)}`}>{'{{name}}'}</Text>
        <Text class={`text-sm text-${hex(theme().textMuted)}`}>{tick() >= 0 ? `${requests.values.length} samples, mock source` : ''}</Text>
      </View>
      <Button label={paused() ? 'Resume' : 'Pause'} icon={paused() ? 'play' : 'pause'} color="neutral" variant="outline" onClick={() => setPaused(!paused())} />
    </View>
    <View class="flex-row gap-4">
      {renderStat('CPU', () => `${Math.round(cpu.last())} %`, () => cpu.trend(), 'cpu')}
      {renderStat('Memory', () => `${Math.round(memory.last())} %`, () => memory.trend(), 'memory-stick')}
      {renderStat('Requests', () => `${Math.round(requests.last())}/s`, () => requests.trend(), 'activity')}
      {renderStat('Errors', () => `${errors.values.reduce((a: number, b: number): number => a + b, 0)}`, () => NaN, 'triangle-alert')}
    </View>
    <View class="flex-row gap-4 grow">
      <Card class="grow basis-0" title="Requests per second" description="The last 30 seconds.">
        <Canvas class="h-[220px]" onDraw={(x: i32, y: i32, w: i32, h: i32) => drawLine(requests.values, 400, x, y, w, h, rgb(theme().primary), rgb(theme().border))} />
      </Card>
      <Card class="w-[320px]" title="Errors" description="Per sample, the last 10 seconds.">
        <Canvas class="h-[220px]" onDraw={(x: i32, y: i32, w: i32, h: i32) => drawBars(errors.values, 4, x, y, w, h, rgb(theme().error), rgb(theme().border))} />
      </Card>
    </View>
    <Card title="Alerts" description="CPU above 85 %.">
      <View class="flex-col gap-1">
        <Text class={`text-sm text-${hex(theme().textMuted)} ${alerts().length === 0 ? '' : 'hidden'}`}>Nothing to report.</Text>
        <For each={alerts()}>{(a: string, i: i32) => <Text class={`text-sm text-${hex(theme().text)}`}>{a}</Text>}</For>
      </View>
    </Card>
  </View>;
}

let shown = 0;
render(App, 0xffffff, (dt: number) => {
  if (paused()) return;
  for (const s of source.poll(dt)) take(s);
  shown += dt;
  if (shown >= 0.5) { shown = 0; setTick(tick() + 1); }   // the cards and labels follow twice a second; the charts every frame
});
