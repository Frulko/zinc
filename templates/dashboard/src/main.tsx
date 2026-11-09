// The dashboard: four stat cards, the request rate as a line, errors as bars, the alerts; pause stops reading the source.
// The look is the kit's Quiet theme (docs/design.md): neutral surfaces, one accent, hairlines; useQuietTheme('blue') picks another accent.
import { createSignal, render } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { Card, CardHeader, CardContent, Button, theme, themeColor, useQuietTheme } from 'zinc:ui/kit';
import { Source, MockSource, Sample } from './source';
import { Series } from './series';
import { drawLine, drawBars } from './charts';

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
  const t = theme();
  return <Card className="grow basis-0">
    <CardContent className="gap-2">
      <View className="flex-row items-center gap-2">
        <Icon name={icon} size={16} strokeWidth={1.75} color={() => themeColor('mutedForeground')} />
        <Text className={`text-[13px] text-${t.mutedForeground}`}>{label}</Text>
      </View>
      <View className="flex-row items-end gap-2">
        <Text className={`text-[28px] font-medium tabular-nums text-${t.foreground}`}>{tick() >= 0 ? value() : ''}</Text>
        <Text className={`text-[13px] tabular-nums text-${t.mutedForeground}`}>{tick() >= 0 && !isNaN(change()) ? `${change() >= 0 ? '+' : ''}${Math.round(change())}% in 30 s` : ''}</Text>
      </View>
    </CardContent>
  </Card>;
}

function App(): i32 {
  const t = theme();
  return <View className={`flex-col gap-6 p-6 w-full h-full bg-${t.background}`}>
    <View className="flex-row items-center justify-between">
      <View className="flex-col gap-1">
        <Text className={`text-[22px] font-medium text-${t.foreground}`}>{'{{name}}'}</Text>
        <Text className={`text-[13px] text-${t.mutedForeground}`}>{tick() >= 0 ? `${requests.values.length} samples, mock source` : ''}</Text>
      </View>
      <Button label={paused() ? 'Resume reading' : 'Pause reading'} variant="outline" onClick={() => setPaused(!paused())} />
    </View>
    <View className="flex-row gap-4">
      {renderStat('CPU', () => `${Math.round(cpu.last())} %`, () => cpu.trend(), 'cpu')}
      {renderStat('Memory', () => `${Math.round(memory.last())} %`, () => memory.trend(), 'memory-stick')}
      {renderStat('Requests', () => `${Math.round(requests.last())}/s`, () => requests.trend(), 'activity')}
      {renderStat('Errors', () => `${errors.values.reduce((a: number, b: number): number => a + b, 0)}`, () => NaN, 'triangle-alert')}
    </View>
    <View className="flex-row gap-4 grow">
      <Card className="grow basis-0">
        <CardHeader title="Requests per second" description="The last 30 seconds." />
        <CardContent>
          <Canvas className="h-[220px]" onDraw={(x: i32, y: i32, w: i32, h: i32) => drawLine(requests.values, 400, x, y, w, h, themeColor('accent') as u32, themeColor('border') as u32)} />
        </CardContent>
      </Card>
      <Card className="w-[320px]">
        <CardHeader title="Errors" description="Per sample, the last 10 seconds." />
        <CardContent>
          <Canvas className="h-[220px]" onDraw={(x: i32, y: i32, w: i32, h: i32) => drawBars(errors.values, 4, x, y, w, h, themeColor('destructive') as u32, themeColor('border') as u32)} />
        </CardContent>
      </Card>
    </View>
    <Card>
      <CardHeader title="Alerts" description="CPU above 85 %." />
      <CardContent className="gap-1">
        <Text className={`text-[13px] text-${t.mutedForeground} ${alerts().length === 0 ? '' : 'hidden'}`}>Nothing to report.</Text>
        <For each={alerts()}>{(a: string, i: i32) => <Text className={`text-[13px] text-${t.foreground}`}>{a}</Text>}</For>
      </CardContent>
    </Card>
  </View>;
}

useQuietTheme();
let shown = 0;
render(App, 0xf2f2f2, (dt: number) => {
  if (paused()) return;
  for (const s of source.poll(dt)) take(s);
  shown += dt;
  if (shown >= 0.5) { shown = 0; setTick(tick() + 1); }   // the cards and labels follow twice a second; the charts every frame
});
