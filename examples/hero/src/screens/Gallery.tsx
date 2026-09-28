// Gallery: eight live generative artworks on cards. Hovering lifts a card on a spring and the artwork follows the
// pointer; a click opens the detail, the artwork growing out of its card (screens/Detail.tsx).
import { createSignal, createMemo, createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { theme, Tabs, heading, mutedText } from 'zinc:ui/kit';
import { entrances, GALLERY, openDetail } from '../app/router';
import { Spring } from '../app/motion';
import { seconds } from '../app/clock';
import { ARTWORKS, Artwork, drawArt } from '../app/art';
import { stageRef } from '../components/Shell';

const enter = entrances[GALLERY];
const CARD_W: i32 = 236, ART_H: i32 = 168;

const [onlyLiked, setOnlyLiked] = createSignal<i32>(0);
const shown = createMemo<Artwork[]>(() => ARTWORKS.filter((a: Artwork) => onlyLiked() === 0 || a.liked()), ARTWORKS);

function ArtCard(props: { art: Artwork }): i32 {
  const a = props.art, i = ARTWORKS.indexOf(a);
  const lift = new Spring(0, 260, 18);
  const canvas = createNodeRef();
  let px: number = -1, py: number = -1;
  const open = (): void => {
    const b = ui.screenBox(canvas.node), s = ui.screenBox(stageRef.node);
    openDetail(i, b[0] - s[0], b[1] - s[1], b[2], b[3]);
  };
  const d = 0.05 + i * 0.05;
  return <View class={`flex-col rounded-xl border overflow-hidden cursor-pointer bg-${theme().card} border-${theme().border} hover:border-${theme().mutedForeground}`}
    style={{ width: CARD_W, translateY: Math.round(lift.get() + (1 - enter.at(d)) * 20), opacity: enter.at(d) }}
    onPointerEnter={(e: ui.PointerEvent) => lift.to(-8)}
    onPointerLeave={(e: ui.PointerEvent) => { lift.to(0); px = -1; py = -1; }}
    onClick={open}>
    <Canvas ref={canvas} style={{ height: ART_H }}
      onDraw={(x: i32, y: i32, w: i32, h: i32) => drawArt(i, x, y, w, h, seconds(), px, py)}
      onPointerMove={(e: ui.PointerEvent) => { px = e.x / CARD_W; py = e.y / ART_H; }} />
    <View class="flex-row items-center p-3 gap-2">
      <View class="flex-col grow gap-0.5">
        <Text class={`text-sm font-semibold text-${theme().foreground}`}>{a.title}</Text>
        <Text class={`text-xs text-${theme().mutedForeground}`}>{`${a.artist} · ${a.year}`}</Text>
      </View>
      <Text class={`text-lg ${a.liked() ? 'text-rose-500' : `text-${theme().border}`}`}>♥</Text>
    </View>
  </View>;
}

export function Gallery(): i32 {
  return <ScrollView class="grow">
    <View class="flex-col gap-6 p-8">
      <View class="flex-row items-end justify-between" style={{ opacity: enter.at(0) }}>
        <View class="flex-col gap-1">
          <Text class={heading(2)}>Gallery</Text>
          <Text class={mutedText()}>Generative pieces drawn every frame. Hover to play with them, click to open.</Text>
        </View>
        <Tabs items={['All', 'Liked']} selected={onlyLiked} onSelect={(i: i32) => setOnlyLiked(i)} />
      </View>
      <View class="flex-row flex-wrap gap-5">
        {shown().map((a: Artwork) => <ArtCard art={a} />)}
      </View>
      {shown().length === 0 ? <Text class={mutedText()}>No liked artwork yet: open one and press the heart.</Text> : <View />}
    </View>
  </ScrollView>;
}
