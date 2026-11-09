import * as ui from 'zinc:ui';
import { render, createSignal } from 'zinc:ui/solid';
import { Calendar, RangeCalendar, DatePicker, DateRangePicker, WheelPicker, TimePicker, TimeDial, ColorPicker, EmojiPicker, RulerSlider, HistogramSlider, Knob, Fader, useQuietTheme } from 'zinc:ui/kit';
import { equal, ok } from 'zinc:assert';
import { emojiCatalog } from '../../../lib/std/kit/picker-emoji';
import { validDate, moveDate, moveMonth } from '../../../lib/std/kit/picker-date';
useQuietTheme();
const catalog = emojiCatalog();
equal(catalog.length, 1914); equal(new Set(catalog.map((entry) => entry.group)).size, 9);
const astronaut = catalog.find((entry) => entry.name === 'astronaut');
ok(astronaut !== undefined && astronaut.tones !== undefined && astronaut.tones[2] === '🧑🏽‍🚀', 'compound tone catalog');
equal(validDate('2024-02-29'), true); equal(validDate('2023-02-29'), false); equal(validDate('0000-01-01'), false);
equal(moveDate('2026-03-29', 1), '2026-03-30'); equal(moveMonth('2024-01-31', 1), '2024-02-29'); equal(moveMonth('2024-02-29', 12), '2025-02-28');
equal(moveMonth('0001-01-31', -1), '0001-01-01'); equal(moveMonth('9999-12-31', 1), '9999-12-31');
const [date, setDate] = createSignal('2024-01-31');
const [start, setStart] = createSignal('2026-11-10'), [end, setEnd] = createSignal('2026-11-15');
const [wheel, setWheel] = createSignal(2), [time, setTime] = createSignal(14 * 60 + 30);
const [color, setColor] = createSignal('#ff000080'), [emoji, setEmoji] = createSignal('');
const [recent, setRecent] = createSignal<string[]>([]), [tone, setTone] = createSignal(3);
const [offset, setOffset] = createSignal(7), [otherPan, setOtherPan] = createSignal(50);
const [number, setNumber] = createSignal(40), [low, setLow] = createSignal(20), [high, setHigh] = createSignal(80);
let frame = 0;
function App(): i32 {
  return <View className="flex-row flex-wrap gap-2 w-[1400px]">
    <Calendar label="Calendar" value={date} onChange={setDate} today="2024-01-30" disabledDate={(value: string) => value === '2024-02-01'} />
    <Calendar label="Future calendar" value={() => '2024-01-31'} onChange={(value: string) => {}} month="2024-06-01" />
    <RangeCalendar label="Range" value={start} end={end} onRangeChange={(first: string, last: string) => { setStart(first); setEnd(last); }} months={2} today="2026-11-09" />
    <View><DatePicker label="Date popup" value={date} onChange={setDate} /><DateRangePicker today="2026-11-09" value={start} end={end} onRangeChange={(first: string, last: string) => { setStart(first); setEnd(last); }} /><TimePicker label="Time popup" value={time} onChange={setTime} twelveHour={true} minuteStep={5} /></View>
    <WheelPicker label="Wheel" items={['One', 'Two', 'Three', 'Four']} value={wheel} onChange={setWheel} loop={true} />
    <TimeDial label="Dial" value={time} onChange={setTime} minuteStep={5} size={180} />
    <ColorPicker label="Ink" value={color} onChange={setColor} alpha={true} />
    <EmojiPicker label="Emoji search" value={emoji} onChange={setEmoji} tone={tone} onToneChange={setTone} recent={recent} onRecentChange={setRecent} />
    <RulerSlider accessibilityLabel="Ruler" value={number} onChange={setNumber} min={0} max={100} step={5} />
    <RulerSlider accessibilityLabel="Offset ruler" value={offset} onChange={setOffset} min={3} max={12} step={2} />
    <HistogramSlider accessibilityLabel="Levels" bins={[1, 5, 10, 5, 1]} low={low} high={high} onChange={(first: number, last: number) => { setLow(first); setHigh(last); }} />
    <Knob label="Pan" value={number} onChange={setNumber} min={0} max={100} step={5} reset={25} />
    <View aria-label="Other pan"><Knob label="Pan" value={otherPan} onChange={setOtherPan} min={0} max={100} step={5} /></View>
    <Fader label="Fader" ticks={[0, 50, 100]} value={number} onChange={setNumber} min={0} max={100} step={5} reset={30} />
    <Knob label="Fixed" value={() => 0} onChange={(value: number) => equal(value, 0)} min={0} max={0} bipolar={true} />
    <Knob label="Locked" value={() => 10} onChange={(value: number) => { throw new Error('disabled knob'); }} disabled={true} />
  </View>;
}
function named(h: i32, label: string): i32 {
  const node = ui.inspectNode(h); if (node === null) return -1;
  for (const child of node.children) { const found = named(child, label); if (found >= 0) return found; }
  return node.label === label ? h : -1;
}
function pointerClick(h: i32): void {
  const box = ui.screenBox(h);
  ui.pointerAt(box[0] + box[2] / 2, box[1] + box[3] / 2, true);
  ui.pointerAt(box[0] + box[2] / 2, box[1] + box[3] / 2, false);
}
function find(label: string): i32 { const found = named(ui.rootNode(), label); ok(found >= 0, 'missing ' + label); return found; }
render(App, 0xf2f2f2, (dt: number) => {
  frame++;
  if (frame === 2) {
    equal(ui.inspectNode(named(find('Future calendar'), '2024-06-01'))!.hs!.tabIndex, 0, 'explicit month must retain a reachable day');
    equal(wheel(), 2, 'wheel initial selection changed before input');
    ok(ui.scrollTop(find('Wheel')) > 0, 'wheel did not open at the selected row');
    equal(number(), 40, 'ruler initial selection changed before input');
    equal(offset(), 7, 'offset ruler initial selection changed before input');
    ok(ui.scrollLeft(find('Ruler')) > 0, 'ruler did not open at the selected tick');
    ok(ui.scrollLeft(find('Offset ruler')) > 0, 'offset ruler did not open at the selected tick');
    ui.keyDown(find('2024-01-31'), 'ArrowRight');
    equal(ui.inspectNode(ui.focused())!.label, '2024-02-02');
    ui.keyDown(-1, 'ArrowLeft'); equal(ui.inspectNode(ui.focused())!.label, '2024-01-31');
    ui.keyDown(-1, 'PageDown');
    equal(ui.inspectNode(ui.focused())!.label, '2024-02-29'); ui.keyDown(-1, 'Enter');
  }
  if (frame === 3) {
    equal(date(), '2024-02-29'); ui.keyDown(find('2024-02-29'), 'PageUp'); ui.keyDown(-1, 'ArrowRight');
    equal(ui.inspectNode(ui.focused())!.label, '2024-01-30');
    ui.click(find('2026-11-20')); ui.click(find('2026-11-12'));
    equal(start(), '2026-11-12'); equal(end(), '2026-11-20');
    ui.keyDown(find('Wheel'), 'End'); equal(wheel(), 3); ui.keyDown(find('Wheel'), 'ArrowDown'); equal(wheel(), 0);
    ui.keyDown(find('Offset ruler'), 'End'); equal(offset(), 12); ui.keyDown(find('Offset ruler'), 'ArrowLeft'); equal(offset(), 11);
    ui.keyDown(find('Ruler'), 'End'); equal(number(), 100); ui.keyDown(find('Ruler'), 'ArrowLeft'); equal(number(), 95);
    ui.keyDown(find('Pan'), 'Delete'); equal(number(), 25); ui.keyDown(find('Pan'), 'ArrowUp', ui.SHIFT); equal(number(), 75);
    const secondPan = named(find('Other pan'), 'Pan'), secondBox = ui.screenBox(secondPan);
    ui.wheelAt(secondBox[0] + secondBox[2] / 2, secondBox[1] + secondBox[3] / 2, 1);
    equal(otherPan(), 50, 'wheel must not change a same-named unfocused knob');
    ui.focusNode(secondPan); ui.wheelAt(secondBox[0] + secondBox[2] / 2, secondBox[1] + secondBox[3] / 2, 1); equal(otherPan(), 55);
    ui.keyDown(find('Fixed'), 'End'); ui.keyDown(find('Locked'), 'End'); ui.keyDown(find('Fader'), 'Backspace'); equal(number(), 30);
    const faderBox = ui.screenBox(find('Fader'));
    ui.wheelAt(faderBox[0] + faderBox[2] / 2, faderBox[1] + faderBox[3] / 2, 1); equal(number(), 35, 'focused fader wheel must reuse slider stepping');
    ui.focusNode(find('Pan')); ui.wheelAt(faderBox[0] + faderBox[2] / 2, faderBox[1] + faderBox[3] / 2, 1); equal(number(), 35, 'unfocused fader must ignore the wheel');
    ui.keyDown(find('Levels minimum'), 'End'); equal(low(), 80); ui.keyDown(find('Levels maximum'), 'Home'); equal(high(), 80);
    ui.keyDown(find('Dial'), 'ArrowUp'); equal(time(), 15 * 60 + 30);
    ui.keyDown(find('Ink saturation and brightness'), 'ArrowLeft'); ok(color() !== '#ff000080'); equal(color().slice(-2), '80');
    ui.focusNode(find('Emoji search')); ui.typeText(-1, 'astronaut');
  }
  if (frame === 4) {
    ui.keyDown(find('Emoji search'), 'ArrowDown'); equal(ui.inspectNode(ui.focused())!.label, 'Emoji search choices'); ui.keyDown(-1, 'Enter');
  }
  if (frame === 5) {
    equal(emoji(), '🧑🏽‍🚀'); equal(recent().join(','), '🧑‍🚀');
    ui.focusNode(find('Emoji search')); ui.select(find('Emoji search'), 0, 100); ui.typeText(-1, 'black cat');
    ui.systemSignal('reducemotion 1'); ui.keyDown(find('Wheel'), 'Home'); equal(wheel(), 0);
    ui.keyDown(find('Dial'), 'm');
  }
  if (frame === 6) { ui.keyDown(find('Emoji search'), 'Enter'); ui.keyDown(find('Dial'), 'ArrowUp'); equal(time(), 15 * 60 + 35); }
  if (frame === 7) {
    equal(emoji(), '🐈‍⬛');
    pointerClick(find('black cat'));
    equal(ui.focused(), find('Emoji search choices'), 'emoji pointer choice must retain the grid Tab stop');
    ui.keyDown(-1, 'Tab');
  }
  if (frame === 8) { equal(ui.focused(), find('Ruler'), 'Tab after emoji choice must reach the next control'); }
  if (frame === 9) ui.keyDown(find('Time popup'), 'Enter');
  if (frame === 10) {
    ui.keyUp('Enter');
    ok(ui.scrollTop(find('Time popup hour')) > 0, 'hidden hour wheel lost its initial selection');
    ok(ui.scrollTop(find('Time popup minute')) > 0, 'hidden minute wheel lost its initial selection');
    ok(ui.scrollTop(find('Time popup period')) > 0, 'hidden period wheel lost its initial selection');
    ui.keyDown(find('Time popup minute'), 'End'); equal(time(), 15 * 60 + 55);
    ui.keyDown(-1, 'Escape');
  }
  if (frame === 11) { equal(ui.focused(), find('Time popup')); ui.keyDown(find('Date popup'), 'Enter'); }
  if (frame === 12) { ui.keyUp('Enter'); pointerClick(find('2024-02-20')); equal(date(), '2024-02-20'); ui.keyDown(-1, 'Escape'); }
  if (frame === 13) { equal(ui.focused(), find('Date popup')); ui.keyDown(find('Choose date range'), 'Enter'); }
  if (frame === 14) { ui.keyUp('Enter'); pointerClick(find('Last 7 days')); equal(start(), '2026-11-03'); equal(end(), '2026-11-09'); ui.keyDown(-1, 'Escape'); }
  if (frame === 15) console.log('pickers: ok');
});
