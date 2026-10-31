// An animated picture (a GIF attachment, a GIF or APNG sticker, a Tenor GIF): its file from the CDN's disk cache, its frames decoded at the
// size drawn (zinc:imageio, off the program's thread) when it is shown, played while it stays on screen and the app is in front. A row of
// the history exists only while it is in view (the virtual list), so a GIF scrolled away frees its frames. The still picture shows until
// the frames are in, and when there is only one.
import { useState, useEffect } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
import { destroyImage, pixelScale } from 'zinc:gfx';
import { frames, Frames } from 'zinc:imageio';
import { cdnFile } from '../services/cdn';

const IDLE_MS = 250;   // in the background: how often the timer looks whether the app is back
let playing: i32 = 0, decoded: i32 = 0;
/** Animations on screen now, and frames shown since the start (the tests). */
export function animationsPlaying(): i32 { return playing; }
export function animationFrames(): i32 { return decoded; }

export function Animated(p: { file: string; url: string; still: i32; w: i32; h: i32; className: string; label: string }) {
  const [at, setAt] = useState<i32>(-1);
  const [anim, setAnim] = useState<Frames | null>(null);
  useEffect((): (() => void) => {
    let gone = false, timer = -1, i = 0, mine: Frames | null = null;
    const step = (): void => {
      const f = mine as Frames;
      if (ui.appState() !== 'active') { timer = setTimeout(step, IDLE_MS); return; }   // minimized or hidden: nothing drawn, nothing advanced
      i = (i + 1) % f.images.length;
      decoded++;
      setAt(i);
      timer = setTimeout(step, f.delays[i]);
    };
    const s = pixelScale();
    cdnFile(p.file, p.url).then((path: string) => frames(path, p.w * s, p.h * s)).then((f: Frames) => {
      if (gone || f.images.length < 2) { for (const img of f.images) destroyImage(img); return; }   // one frame: the still picture is it
      mine = f;
      setAnim(f); setAt(0);
      playing++; timer = setTimeout(step, f.delays[0]);
    }).catch((e: Error) => { /* the still picture stays */ });
    return (): void => {
      gone = true;
      if (timer >= 0) clearTimeout(timer);
      const f = mine;
      if (f !== null) { playing--; for (const img of f.images) destroyImage(img); }
    };
  }, []);   // a row keeps its picture: a new url is a new row
  const a = anim;
  return <Image image={a !== null && at >= 0 ? a.images[at] : p.still} className={p.className} aria-label={p.label} />;
}
