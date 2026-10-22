// The start view: what Zinc is and where the lessons are, the templates of real apps, then an empty sketch and the examples by
// level, one card each with a picture of what it draws. A card opens a copy in the sketchbook, so the examples themselves stay
// as they are. The examples are folders of examples/ beside this app, listed in examples/index.txt (`folder|Title|one line|level`,
// the levels of LEVELS); their pictures are thumbs/<folder>.png.
import { createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { imageFromBytes, drawImage, rrect, border } from 'zinc:gfx';
import { theme, bg, fg, bd } from '../app/theme';
import { newSketch, openCopy, sketchbook, say, APP_HOME } from '../app/workspace';
import { startOpen, setStartOpen, openDocs, fromTemplate, openPalette, PAL_TEMPLATES } from '../app/commands';
import { Glyph } from './Controls';
import { t, has } from '../app/text';
import { I_PLUS } from './icons';

/** The levels of the examples, easiest first; their headings are atelier.start.level.<id>. */
const LEVELS: string[] = ['first', 'input', 'apps'];
/** The templates of `zinc new` the start view offers (their names are atelier.template.<name>); the palette lists them all. */
const TEMPLATES: string[] = ['game', 'game-2d', 'desktop-app', 'dashboard', '3d', 'iot-board'];

export class Example {
  dir: string; title: string; text: string; level: string;
  image: i32 = -2;   // -2 not loaded yet, -1 no picture
  constructor(dir: string, title: string, text: string, level: string) { this.dir = dir; this.title = title; this.text = text; this.level = level; }
  /** Its title and its line in the language of the interface (atelier.example.<folder>.title, .text); index.txt's English otherwise. */
  name(): string { const k = `atelier.example.${this.dir}.title`; return has(k) ? t(k) : this.title; }
  line(): string { const k = `atelier.example.${this.dir}.text`; return has(k) ? t(k) : this.text; }
}
function load(): Example[] {
  const out: Example[] = [];
  if (APP_HOME === '') return out;
  try {
    for (const l of fs.readText(APP_HOME + '/examples/index.txt').split('\n')) {
      const p = l.split('|');
      if (p.length >= 3 && fs.exists(`${APP_HOME}/examples/${p[0]}`)) out.push(new Example(p[0], p[1], p[2], p.length > 3 ? p[3].trim() : LEVELS[0]));
    }
  } catch (e) { }
  return out;
}
export const EXAMPLES: Example[] = load();
/** Opens a copy of an example by its folder name; false when there is none. */
export function openExample(dir: string): boolean {
  for (const e of EXAMPLES) if (e.dir === dir) { if (openCopy(`${APP_HOME}/examples/${e.dir}`)) setStartOpen(false); return true; }
  say(t('atelier.example.none', ['name', dir]));
  return false;
}

function picture(e: Example): i32 {
  if (e.image === -2) {
    e.image = -1;
    try { e.image = imageFromBytes(fs.readBytes(`${APP_HOME}/thumbs/${e.dir}.png`)); } catch (x) { }
  }
  return e.image;
}
/** A path with the home folder as ~. */
function tilde(p: string): string { const h = sys.env('HOME'); return h !== '' && p.startsWith(h + '/') ? '~' + p.slice(h.length) : p; }
const CARD = 'flex-col w-[224] p-2 pb-3 gap-2.5 rounded-[16] border cursor-pointer';
/** The first examples, the Hello card and the templates (the tour points at them). */
export const examplesRef = createNodeRef(), helloRef = createNodeRef(), templatesRef = createNodeRef();
const noRef = createNodeRef();
function Card(props: { e: Example }): i32 {
  const e = props.e;
  return <View ref={e.dir === 'hello' ? helloRef : noRef} className={`${CARD} ${bg(theme().bg)} ${bd(theme().borderSoft)} hover:${bd(theme().accent)}`} onPointerDown={(p: ui.PointerEvent) => { if (p.button === 0) openExample(e.dir); }}>
    <Canvas className="w-full h-[130]" style={{ lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
      const img = picture(e), r = 10 * w / 208;
      if (img >= 0) drawImage(img, x, y, w, h, 255, r); else rrect(x, y, w, h, r, theme().chrome, 255);
      border(x, y, w, h, r, w / 208, theme().borderSoft, 255);
    }} />
    <View className="flex-col px-1.5 gap-0.5">
      <Text className={`text-[14px] font-semibold ${fg(theme().text)}`}>{e.name()}</Text>
      <Text className={`text-[12px] ${fg(theme().muted)}`}>{e.line()}</Text>
    </View>
  </View>;
}
function NewCard(): i32 {
  return <View className={`${CARD} ${bg(theme().bg)} ${bd(theme().borderSoft)} hover:${bd(theme().accent)}`} onPointerDown={(p: ui.PointerEvent) => { if (p.button === 0) { setStartOpen(false); newSketch(); } }}>
    <View className={`w-full h-[130] rounded-[10] items-center justify-center ${bg(theme().accentSoft)}`}>
      <Glyph kind={I_PLUS} size={30} color={() => theme().accent} back={() => theme().accentSoft} />
    </View>
    <View className="flex-col px-1.5 gap-0.5">
      <Text className={`text-[14px] font-semibold ${fg(theme().text)}`}>{t('atelier.start.empty')}</Text>
      <Text className={`text-[12px] ${fg(theme().muted)}`}>{t('atelier.start.empty_text')}</Text>
    </View>
  </View>;
}
function Chip(props: { label: () => string; onPress: () => void }): i32 {
  return <View className={`h-[30] px-3.5 rounded-full border items-center justify-center cursor-pointer ${bg(theme().bg)} ${bd(theme().borderSoft)} hover:${bd(theme().accent)}`}
    onPointerDown={(p: ui.PointerEvent) => { if (p.button === 0) props.onPress(); }}>
    <Text className={`text-[13px] font-medium ${fg(theme().text)}`}>{props.label()}</Text>
  </View>;
}

export function StartView(): i32 {
  return <View className={`absolute inset-0 ${bg(theme().chrome)}`} style={{ hidden: startOpen() ? 0 : 1 }}>
    <ScrollView className="grow flex-col px-[44] pt-[28] pb-[40]">
      <Text className={`text-[26px] font-bold ${fg(theme().text)}`}>{t('atelier.start.title')}</Text>
      <Text className={`max-w-[820] text-[14px] leading-[21] pt-2 ${fg(theme().text)}`}>{t('atelier.start.welcome', ['run', t('atelier.header.run')])}</Text>
      <View className="flex-row flex-wrap items-center gap-1.5 pt-2">
        <Text className={`text-[14px] ${fg(theme().text)}`}>{t('atelier.start.learn')}</Text>
        <Text className={`text-[14px] font-semibold cursor-pointer ${fg(theme().accent)}`}
          onPointerDown={(p: ui.PointerEvent) => { if (p.button === 0) openDocs('docs/learn/'); }}>{t('atelier.start.learn_link')}</Text>
      </View>
      <Text className={`text-[13px] pt-2 ${fg(theme().muted)}`}>{t('atelier.start.copies', ['path', tilde(sketchbook())])}</Text>
      <View ref={templatesRef} className="flex-row flex-wrap items-center gap-2 pt-4">
        <Text className={`text-[14px] pr-1 ${fg(theme().text)}`}>{t('atelier.start.templates')}</Text>
        {TEMPLATES.map((name: string) => <Chip label={() => t('atelier.template.' + name)} onPress={() => fromTemplate(name)} />)}
        <Chip label={() => t('atelier.start.all_templates')} onPress={() => { setStartOpen(false); openPalette(PAL_TEMPLATES); }} />
      </View>
      {LEVELS.map((level: string, i: i32) => <View className="flex-col">
        <Text className={`text-[15px] font-semibold pt-7 pb-3 ${fg(theme().text)}`}>{t('atelier.start.level.' + level)}</Text>
        <View ref={i === 0 ? examplesRef : noRef} className="flex-row flex-wrap gap-4">
          {i === 0 && <NewCard />}
          {EXAMPLES.filter((e: Example) => e.level === level).map((e: Example) => <Card e={e} />)}
        </View>
      </View>)}
    </ScrollView>
  </View>;
}
