// Video: Big Buck Bunny decoded natively (zinc:video, FFmpeg, V4L2 hardware decode on the Pi when available).
// The file is an asset next to the binary (media/bbb.mp4), read at runtime: it is not embedded in the executable.
import { createSignal, onCleanup, Show } from 'zinc:ui/solid';
import { theme, Card, CardContent, Button, Progress, Badge, heading, mutedText } from 'zinc:ui/kit';
import { Player } from 'zinc:video';

const PATHS: string[] = ['media/bbb.mp4', 'examples/hero/media/bbb.mp4'];
const [pos, setPos] = createSignal<number>(0);         // 0..100
const [clockText, setClockText] = createSignal<string>('0:00 / 0:00');
const [paused, setPaused] = createSignal<boolean>(false);
let player: Player | null = null;

function fmt(s: number): string {
  const t = Math.max(0, Math.floor(s));
  const sec = t % 60;
  return `${Math.floor(t / 60)}:${sec < 10 ? '0' : ''}${sec}`;
}

/** Called every frame: publishes the playback position while the Video screen is mounted. */
export function stepVideo(): void {
  const p = player;
  if (p === null) return;
  const d = p.duration;
  setPos(d > 0 ? 100 * p.position / d : 0);
  setClockText(`${fmt(p.position)} / ${fmt(d)}`);
}

/** The video, aspect kept, centred in its box. */
function drawVideo(p: Player, x: i32, y: i32, w: i32, h: i32): void {
  const s = Math.min(w / 640, h / 360);
  const fw = 640 * s, fh = 360 * s;
  p.draw(x + (w - fw) / 2, y + (h - fh) / 2, fw, fh);
}

export function Video(): i32 {
  const p = new Player(640, 360);
  let found = false;
  for (const path of PATHS) if (!found) found = p.add(path);
  if (found) p.play();
  setPaused(false);
  player = p;
  onCleanup(() => { player = null; p.close(); });
  return <ScrollView class="grow">
    <View class="flex-col gap-4 p-4 lg:p-8">
      <View class="flex-col gap-1">
        <Text class={heading(2)}>Video</Text>
        <Text class={mutedText()}>Big Buck Bunny (Blender Foundation, CC BY 3.0), 640x360 H.264.</Text>
      </View>
      <Show when={found}>
        <Card>
          <CardContent>
            <View class="h-[300] rounded-xl overflow-hidden bg-black">
              <Canvas class="grow" onDraw={(x: i32, y: i32, w: i32, h: i32) => drawVideo(p, x, y, w, h)} />
            </View>
            <Progress value={pos} />
            <View class="flex-row items-center gap-3">
              <Button label={paused() ? 'Play' : 'Pause'} onClick={() => { setPaused(!paused()); p.pause(paused()); }} />
              <Button label="Restart" variant="outline" onClick={() => p.jump(0)} />
              <Text class={`text-sm grow text-${theme().mutedForeground}`}>{clockText()}</Text>
              <Badge label={p.decoder} variant="outline" />
            </View>
          </CardContent>
        </Card>
      </Show>
      <Show when={!found}>
        <Card>
          <CardContent>
            <Text class={`text-sm text-${theme().foreground}`}>media/bbb.mp4 not found next to the program.</Text>
            <Text class={mutedText()}>See examples/hero/README.md to fetch it.</Text>
          </CardContent>
        </Card>
      </Show>
    </View>
  </ScrollView>;
}
