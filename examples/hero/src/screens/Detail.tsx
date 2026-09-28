// Artwork detail, pushed over the Gallery. Shared-element transition: the artwork box is interpolated from the
// card it was opened from (router.fromX...) to its place here, while the page fades in behind it and the text
// slides in from the right. Closing plays it backwards into the card.
import { createEffect, createMemo, untrack } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { theme, Button, Badge, heading, mutedText } from 'zinc:ui/kit';
import { Lottie, Player } from 'zinc:lottie';
import { detail, detailT, closeDetail, stepDetail, fromX, fromY, fromW, fromH } from '../app/router';
import { lerp, clamp01, easeOut } from '../app/motion';
import { seconds } from '../app/clock';
import { ARTWORKS, Artwork, drawArt } from '../app/art';
import { toast } from '../app/overlays';
import { stageW, stageH, rgb } from '../components/Shell';
import { Icon } from '../components/Icon';
import { BACK_ICON } from '../components/icons';

const PAD: number = 32;
let heart: Player | null = null;
let px: number = -1, py: number = -1;

function art(): Artwork { return ARTWORKS[Math.max(0, detail())]; }
/** The artwork on display as a one-item list: a keyed .map() rebuilds its badges when it changes. */
const shownArt = createMemo<Artwork[]>(() => [art()], []);

/** Final artwork square: left side of the stage, as tall as it allows. */
function target(): number[] {
  const w = stageW(), h = stageH();
  const size = Math.max(160, Math.min(h - PAD * 2, w * 0.5));
  return [PAD, PAD, size, size, w, h];
}
/** Current artwork box: from the card (or a small square in the middle) to the target, along the transition. */
function box(k: i32): number {
  const t = target(), p = detailT.get();
  const from: number[] = fromX >= 0 ? [fromX, fromY, fromW, fromH] : [t[4] / 2 - 40, t[5] / 2 - 40, 80, 80];
  return Math.round(lerp(from[k], t[k], p));
}

function toggleLike(): void {
  const a = art();
  a.setLiked(!a.liked());
  const h = heart;
  if (h !== null) { if (a.liked()) { h.seek(0); h.play(); } else h.stop(); }
  toast(a.liked() ? `Liked "${a.title}"` : `Removed "${a.title}" from your likes`, a.liked() ? 'It now shows under Gallery › Liked.' : '', a.liked() ? 'success' : 'default');
}
/** Shows the heart filled (last frame) or empty for the artwork being displayed. */
function syncHeart(): void {
  const h = heart;
  // untracked: liking must not re-run the effect below (it would stop the heart animation it just started)
  if (h !== null) { h.pause(); h.seek(untrack(() => art().liked()) ? h.to : 0); }
}
export function browseDetail(dir: i32): void { stepDetail(dir, ARTWORKS.length); }

export function Detail(): i32 {
  createEffect(() => { if (detail() >= 0) syncHeart(); });   // the heart shows the state of the artwork on display
  const info = (): number => easeOut(clamp01((detailT.get() - 0.35) / 0.65));
  return <View class="absolute inset-0" style={{ hidden: detail() < 0 ? 1 : 0 }}>
    <View class={`absolute inset-0 bg-${theme().background}`} style={{ opacity: detailT.get() }} onClick={() => {}} />
    <View class="absolute overflow-hidden rounded-2xl shadow-xl"
      style={{ left: box(0), top: box(1), width: box(2), height: box(3) }}>
      <Canvas class="absolute inset-0"
        onDraw={(x: i32, y: i32, w: i32, h: i32) => drawArt(Math.max(0, detail()), x, y, w, h, seconds(), px, py)}
        onPointerMove={(e: ui.PointerEvent) => { px = e.x / Math.max(1, box(2)); py = e.y / Math.max(1, box(3)); }}
        onPointerLeave={(e: ui.PointerEvent) => { px = -1; py = -1; }} />
    </View>
    <View class="absolute flex-col gap-5"
      style={{ left: target()[2] + PAD * 2, top: PAD, width: Math.max(200, target()[4] - target()[2] - PAD * 3), opacity: info(), translateX: Math.round((1 - info()) * 40) }}>
      <View class={`flex-row items-center gap-2 h-9 px-2 rounded-lg cursor-pointer hover:bg-${theme().muted}`} onClick={() => closeDetail()}>
        <Icon kind={BACK_ICON} size={16} color={() => rgb(theme().mutedForeground)} />
        <Text class={`text-sm font-semibold text-${theme().mutedForeground}`}>Back to gallery</Text>
        <View class="grow" />
        <Text class={`text-xs text-${theme().mutedForeground}`}>{`${detail() + 1} / ${ARTWORKS.length}`}</Text>
      </View>
      <View class="flex-col gap-1">
        <Text class={heading(1)}>{art().title}</Text>
        <Text class={mutedText()}>{`${art().artist}, ${art().year}`}</Text>
      </View>
      {shownArt().map((a: Artwork) => <View class="flex-row gap-2">
        {a.tags.map((t: string) => <Badge label={t} variant="secondary" />)}
        <Badge label="live" variant="accent" />
      </View>)}
      <Text class={`text-base text-${theme().foreground}`}>{art().about}</Text>
      <View class="flex-row items-center gap-2">
        <View class={`flex-row items-center gap-1 pr-4 h-12 rounded-xl border cursor-pointer border-${theme().border} hover:bg-${theme().muted}`}
          onClick={() => toggleLike()}>
          <Lottie src="heart.json" class="w-14 h-14" player={(p: Player) => { p.loop = false; heart = p; }} />
          <Text class={`text-sm font-semibold text-${theme().foreground}`}>{art().liked() ? 'Liked' : 'Like'}</Text>
        </View>
        <View class="grow" />
        <Button label="← Previous" variant="outline" onClick={() => browseDetail(-1)} />
        <Button label="Next →" variant="outline" onClick={() => browseDetail(1)} />
      </View>
      <Text class={`text-xs text-${theme().mutedForeground}`}>Move the pointer over the artwork to change it. ← → browse, Esc goes back.</Text>
    </View>
  </View>;
}

