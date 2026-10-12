// The start view: an empty sketch and the examples, one card each with a picture of what it draws. A card opens a copy
// in the sketchbook, so the examples themselves stay as they are. The examples are folders of examples/ beside this
// app, listed in examples/index.txt (`folder|Title|one line`); their pictures are thumbs/<folder>.png.
import * as ui from 'zinc:ui';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { imageFromBytes, drawImage, rrect } from 'zinc:gfx';
import { theme, bg, fg, bd } from '../app/theme';
import { newSketch, openCopy, sketchbook, say } from '../app/workspace';
import { startOpen, setStartOpen } from '../app/commands';
import { Glyph } from './Controls';
import { I_PLUS } from './icons';

export class Example {
  dir: string; title: string; text: string;
  image: i32 = -2;   // -2 not loaded yet, -1 no picture
  constructor(dir: string, title: string, text: string) { this.dir = dir; this.title = title; this.text = text; }
}
/** Where this app's own files are: the working directory when zinc runs the project, else found from the launch directory or the binary. */
function home(): string {
  const bin = sys.env('ZINC_BIN'), up = bin.lastIndexOf('/build/');
  const cands: string[] = ['.', sys.launchDir() + '/next/app/atelier', sys.launchDir() + '/app/atelier', sys.launchDir()];
  if (up > 0) cands.push(bin.slice(0, up) + '/app/atelier');
  if (bin !== '') cands.push(bin.slice(0, bin.lastIndexOf('/')) + '/../Resources/zinc/next/app/atelier');
  for (const c of cands) if (fs.exists(c + '/examples/index.txt')) return c;
  return '';
}
const HOME: string = home();
function load(): Example[] {
  const out: Example[] = [];
  if (HOME === '') return out;
  try {
    for (const l of fs.readText(HOME + '/examples/index.txt').split('\n')) {
      const p = l.split('|');
      if (p.length >= 3 && fs.exists(`${HOME}/examples/${p[0]}`)) out.push(new Example(p[0], p[1], p[2]));
    }
  } catch (e) { }
  return out;
}
export const EXAMPLES: Example[] = load();
/** Opens a copy of an example by its folder name; false when there is none. */
export function openExample(dir: string): boolean {
  for (const e of EXAMPLES) if (e.dir === dir) { if (openCopy(`${HOME}/examples/${e.dir}`)) setStartOpen(false); return true; }
  say(`No example named ${dir}`);
  return false;
}

function picture(e: Example): i32 {
  if (e.image === -2) {
    e.image = -1;
    try { e.image = imageFromBytes(fs.readBytes(`${HOME}/thumbs/${e.dir}.png`)); } catch (x) { }
  }
  return e.image;
}
const CARD = 'flex-col w-[272] p-2 pb-3 gap-2.5 rounded-[16] border cursor-pointer';
function Card(props: { e: Example }): i32 {
  const e = props.e;
  return <View class={`${CARD} ${bg(theme().bg)} ${bd(theme().borderSoft)} hover:${bd(theme().accent)}`} onPointerDown={(p: ui.PointerEvent) => { if (p.button === 0) openExample(e.dir); }}>
    <Canvas class="w-full h-[160]" style={{ lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
      const img = picture(e);
      if (img >= 0) drawImage(img, x, y, w, h, 255, 10 * w / 256); else rrect(x, y, w, h, 10 * w / 256, theme().chrome, 255);
    }} />
    <View class="flex-col px-1.5 gap-0.5">
      <Text class={`text-[14px] font-semibold ${fg(theme().text)}`}>{e.title}</Text>
      <Text class={`text-[12px] ${fg(theme().muted)}`}>{e.text}</Text>
    </View>
  </View>;
}

export function StartView(): i32 {
  return <View class={`absolute inset-0 ${bg(theme().chrome)}`} style={{ hidden: startOpen() ? 0 : 1 }}>
    <ScrollView class="grow flex-col px-[44] pt-[28] pb-[40]">
      <Text class={`text-[26px] font-bold ${fg(theme().text)}`}>Start a sketch</Text>
      <Text class={`text-[13px] pt-1 pb-6 ${fg(theme().muted)}`}>{`An example opens as a copy in ${sketchbook()}: change anything.`}</Text>
      <View class="flex-row flex-wrap gap-4">
        <View class={`${CARD} ${bg(theme().bg)} ${bd(theme().borderSoft)} hover:${bd(theme().accent)}`} onPointerDown={(p: ui.PointerEvent) => { if (p.button === 0) { setStartOpen(false); newSketch(); } }}>
          <View class={`w-full h-[160] rounded-[10] items-center justify-center ${bg(theme().accentSoft)}`}>
            <Glyph kind={I_PLUS} size={30} color={() => theme().accent} back={() => theme().accentSoft} />
          </View>
          <View class="flex-col px-1.5 gap-0.5">
            <Text class={`text-[14px] font-semibold ${fg(theme().text)}`}>Empty sketch</Text>
            <Text class={`text-[12px] ${fg(theme().muted)}`}>A few lines that draw, to begin from.</Text>
          </View>
        </View>
        {EXAMPLES.map((e: Example) => <Card e={e} />)}
      </View>
    </ScrollView>
  </View>;
}
