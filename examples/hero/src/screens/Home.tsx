// Home: a greeting, four live metrics that count up when the screen appears, a streaming chart (hover it),
// goal rings and a recent-activity list whose rows slide in one after the other.
import * as ui from 'zinc:ui';
import { theme, Card, CardHeader, CardContent, Stat, Badge, Button, List, ListItem, heading, mutedText } from 'zinc:ui/kit';
import { entrances, HOME, go, TASKS, GALLERY } from '../app/router';
import { frameCount, uptime } from '../app/clock';
import { name, accentRgb } from '../app/prefs';
import { doneCount, totalCount } from '../app/tasks';
import { ARTWORKS, Artwork } from '../app/art';
import { toast } from '../app/overlays';
import { LiveSeries, drawArea, drawRings } from '../components/charts';
import { rgb } from '../components/Shell';

const enter = entrances[HOME];
export const series = new LiveSeries();

function likes(): i32 { return ARTWORKS.filter((a: Artwork) => a.liked()).length; }
function clock(s: i32): string { const m = Math.floor(s / 60), r = s % 60; return `${m}:${r < 10 ? '0' : ''}${r}`; }
/** A number counting up from 0 while the screen enters. */
function countUp(v: i32, delay: number): string { return `${Math.round(v * enter.at(delay, 1.1))}`; }

/** Wraps a block so it fades and rises in at `delay` after the screen appears. */
function Rise(props: { delay: number; class?: string; children: () => i32 }): i32 {
  return <View class={props.class ?? 'flex-col'} style={{ opacity: enter.at(props.delay), translateY: Math.round((1 - enter.at(props.delay)) * 14) }}>
    {props.children()}
  </View>;
}

const ACTIVITY: string[] = ['Compiled hero.tsx to C++', '42 ms', 'Baked 20 font sizes', '160 ms', 'Rendered 1 100 × 700 at 2×', '60 fps',
  'Synced the task list', 'just now', 'Liked an artwork in the Gallery', '2 min'];

function greeting(): string { const h = Math.floor(uptime() / 3600); return h < 1 ? 'Welcome back' : 'Still here'; }

export function Home(): i32 {
  return <ScrollView class="grow">
    <View class="flex-col gap-6 p-8">
      <Rise delay={0} class="flex-row items-end justify-between">
        <View class="flex-col gap-1">
          <Text class={heading(2)}>{`${greeting()}, ${name().split(' ')[0]}`}</Text>
          <Text class={mutedText()}>Everything on this page is drawn by the Zinc engine, live.</Text>
        </View>
        <View class="flex-row gap-2">
          <Button label="Gallery" variant="outline" onClick={() => go(GALLERY)} />
          <Button label="New task" onClick={() => go(TASKS)} />
        </View>
      </Rise>
      <View class="flex-row gap-4">
        <Rise delay={0.08} class="flex-col grow"><Stat label="Frames drawn" value={() => countUp(frameCount(), 0.08)} hint="since launch" /></Rise>
        <Rise delay={0.14} class="flex-col grow"><Stat label="Tasks done" value={() => `${countUp(doneCount(), 0.14)} / ${totalCount()}`} hint="Tasks screen" /></Rise>
        <Rise delay={0.2} class="flex-col grow"><Stat label="Liked artworks" value={() => countUp(likes(), 0.2)} hint={`of ${ARTWORKS.length}`} /></Rise>
        <Rise delay={0.26} class="flex-col grow"><Stat label="Uptime" value={() => clock(uptime())} hint="minutes:seconds" /></Rise>
      </View>
      <View class="flex-row gap-4">
        <Rise delay={0.32} class="flex-col grow">
          <Card>
            <CardHeader title="Requests" description="Streaming, 8 samples a second. Hover the chart.">
              <View class="flex-row"><Badge label="Live" variant="success" /></View>
            </CardHeader>
            <CardContent>
              <Canvas class="h-[200]"
                onDraw={(x: i32, y: i32, w: i32, h: i32) => drawArea(series, x, y, w, h, enter.at(0.35, 0.9), accentRgb(), rgb(theme().border), rgb(theme().foreground))}
                onPointerMove={(e: ui.PointerEvent) => { series.hoverX = e.x; }}
                onPointerLeave={(e: ui.PointerEvent) => { series.hoverX = -1; }} />
            </CardContent>
          </Card>
        </Rise>
        <Rise delay={0.38} class="flex-col w-[300]">
          <Card>
            <CardHeader title="Goals" description="Tasks, likes, uptime" />
            <CardContent>
              <Canvas class="h-[200]" onDraw={(x: i32, y: i32, w: i32, h: i32) => drawRings(
                [enter.at(0.45, 1.2) * (totalCount() > 0 ? doneCount() / totalCount() : 0), enter.at(0.5, 1.2) * likes() / ARTWORKS.length, enter.at(0.55, 1.2) * Math.min(1, uptime() / 300)],
                [accentRgb(), 0xf43f5e, 0x10b981], rgb(theme().muted), x, y, w, h)} />
            </CardContent>
          </Card>
        </Rise>
      </View>
      <Rise delay={0.44}>
        <Text class={`text-sm font-semibold pb-2 text-${theme().foreground}`}>Recent activity</Text>
        <List>
          {[0, 1, 2, 3, 4].map((i: i32) => <View style={{ opacity: enter.at(0.5 + i * 0.06), translateX: Math.round((1 - enter.at(0.5 + i * 0.06)) * 24) }}>
            <ListItem title={ACTIVITY[i * 2]} trailing={ACTIVITY[i * 2 + 1]} onClick={() => toast(ACTIVITY[i * 2], 'An entry of the activity feed.')} />
          </View>)}
        </List>
      </Rise>
    </View>
  </ScrollView>;
}
