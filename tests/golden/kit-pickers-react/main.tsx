import * as ui from 'zinc:ui';
import { render, useState } from 'zinc:ui/react';
import { RangeCalendar, Calendar, WheelPicker, EmojiPicker, ColorPicker, Knob, TimeDial, useQuietTheme } from 'zinc:ui/kit';
import { equal, ok } from 'zinc:assert';
useQuietTheme();
let dateValue = '2024-01-31', startValue = '2026-11-10', endValue = '2026-11-15', emojiValue = '', timeValue = 60, numberValue = 10, colorValue = '#ff0000';
let force = (): void => {}, changeMonths = (): void => {}, frame = 0;
function App(): i32 {
  const [date, setDate] = useState(dateValue), [start, setStart] = useState(startValue), [end, setEnd] = useState(endValue);
  const [wheel, setWheel] = useState(2), [emoji, setEmoji] = useState(''), [color, setColor] = useState('#ff0000');
  const [time, setTime] = useState(60), [number, setNumber] = useState(10), [months, setMonths] = useState(1), [tick, setTick] = useState(0);
  force = () => setTick(tick + 1); changeMonths = () => setMonths(months === 1 ? 2 : 1);
  return <View className="flex-row flex-wrap w-[1200px]">
    <Calendar value={() => date} onChange={(next: string) => { dateValue = next; setDate(next); }} />
    <RangeCalendar value={() => start} end={() => end} onRangeChange={(first: string, last: string) => { startValue = first; endValue = last; setStart(first); setEnd(last); }} months={months} />
    <WheelPicker label="Wheel" value={() => wheel} onChange={setWheel} items={['One', 'Two', 'Three', 'Four']} />
    <EmojiPicker label="Emoji search" value={() => emoji} onChange={(next: string) => { emojiValue = next; setEmoji(next); }} />
    <ColorPicker label="Ink" value={() => color} onChange={(next: string) => { colorValue = next; setColor(next); }} />
    <Knob label="Knob" value={() => number} onChange={(next: number) => { numberValue = next; setNumber(next); }} />
    <TimeDial label="Dial" value={() => time} onChange={(next: number) => { timeValue = next; setTime(next); }} minuteStep={5} size={180} />
    <Text>{String(tick)}</Text>
  </View>;
}
function named(h: i32, label: string): i32 { const node = ui.inspectNode(h); if (node === null) return -1; for (const child of node.children) { const found = named(child, label); if (found >= 0) return found; } return node.label === label ? h : -1; }
function find(label: string): i32 { const found = named(ui.rootNode(), label); ok(found >= 0, 'missing ' + label); return found; }
render(App, 0xf2f2f2, (dt: number) => {
  frame++;
  if (frame === 2) { ui.keyDown(find('2024-01-31'), 'PageDown'); force(); }
  if (frame === 3) { ui.click(find('2024-02-29')); changeMonths(); }
  if (frame === 4) { equal(dateValue, '2024-02-29'); ui.click(find('2026-11-20')); }
  if (frame === 5) { force(); }
  if (frame === 6) { ui.click(find('2026-12-20')); }
  if (frame === 7) {
    equal(startValue, '2026-11-20'); equal(endValue, '2026-12-20');
    ui.focusNode(find('Emoji search')); ui.typeText(-1, 'astronaut');
  }
  if (frame === 8) { force(); }
  if (frame === 9) { ui.keyDown(find('Emoji search'), 'ArrowDown'); equal(ui.inspectNode(ui.focused())!.label, 'Emoji search choices'); ui.keyDown(-1, 'Enter'); ui.keyDown(find('Dial'), 'm'); }
  if (frame === 10) {
    equal(emojiValue, '🧑‍🚀'); ui.keyDown(find('Dial'), 'ArrowUp');
    const box = ui.screenBox(find('astronaut'));
    ui.pointerAt(box[0] + box[2] / 2, box[1] + box[3] / 2, true);
    ui.pointerAt(box[0] + box[2] / 2, box[1] + box[3] / 2, false);
    equal(ui.focused(), find('Emoji search choices'));
    ui.keyDown(-1, 'Tab');
  }
  if (frame === 11) { equal(ui.focused(), find('Ink saturation and brightness')); equal(timeValue, 65); ui.keyDown(find('Ink saturation and brightness'), 'ArrowLeft'); ui.keyDown(find('Knob'), 'End'); }
  if (frame === 12) { ok(colorValue !== '#ff0000'); equal(numberValue, 100); changeMonths(); }
  if (frame === 13) { ui.systemSignal('reducemotion 1'); force(); }
  if (frame === 14) { equal(startValue, '2026-11-20'); equal(endValue, '2026-12-20'); console.log('pickers react: ok'); }
});
