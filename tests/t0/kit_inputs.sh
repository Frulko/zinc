#!/bin/sh
# Quiet Inputs: real keyboard/edit paths, bounded numbers, tags, code paste and selection dismiss/record/restart.
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/src"
echo '{"name":"inputs","entry":"src/main.tsx","icons":["search","chevron-down","check"],"app":{"window":{"width":800,"height":1400}}}' > "$tmp/zinc.json"
cat > "$tmp/src/main.tsx" <<'P'
import * as ui from 'zinc:ui';
import { render, createSignal } from 'zinc:ui/solid';
import { useQuietTheme, Form, Input, PasswordField, SearchField, Textarea, NumberField, MoneyField, ScrubField, TagInput, OneTimeCode, Select, Combobox, MultiSelect, ShortcutRecorder } from 'zinc:ui/kit';
import { equal, ok } from 'zinc:assert';
useQuietTheme();
const [value, setValue] = createSignal('Ada');
const [n, setN] = createSignal(4);
const [money, setMoney] = createSignal(-1249.5);
const [tags, setTags] = createSignal<string[]>([]);
const [code, setCode] = createSignal('');
const [selected, setSelected] = createSignal('a');
const [many, setMany] = createSignal<string[]>([]);
const [shortcut, setShortcut] = createSignal('mod-k');
let submits = 0, complete = 0, globalKeys = 0, frame = 0;
const options = [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta', disabled: true }, { value: 'c', label: 'Cedar' }];
function App(): i32 {
  return <View className="w-[700px] flex-col gap-2">
    <Input label="Name" value={value} onInput={setValue} clearable={true} onSubmit={() => { submits++; }} />
    <PasswordField label="Secret" value={value} onInput={setValue} />
    <SearchField label="Search" value={value} onInput={setValue} />
    <Textarea label="Notes" onSubmit={() => { submits++; }} />
    <NumberField label="Seats" value={n} onChange={setN} min={1} max={12} />
    <MoneyField label="Budget" value={money} onChange={setMoney} />
    <ScrubField label="Opacity" value={n} onChange={setN} min={1} max={12} />
    <TagInput label="Tags" value={tags} onChange={setTags} />
    <OneTimeCode value={code} onChange={setCode} length={4} onComplete={(v: string) => { complete++; }} />
    <Select label="Country" items={options} value={selected} onChange={setSelected} />
    <Combobox label="Language" items={options} value={selected} onChange={setSelected} />
    <MultiSelect label="Tools" items={options} value={many} onChange={setMany} searchable={true} />
    <ShortcutRecorder label="Shortcut" value={shortcut} onChange={setShortcut} />
    <Form onSubmit={() => { submits++; }}><Input label="Form field" /></Form>
  </View>;
}
function named(h: i32, label: string): i32 {
  const n = ui.inspectNode(h);
  if (n === null) return -1;
  if (n.label === label) return h;
  for (const child of n.children) { const got = named(child, label); if (got >= 0) return got; }
  return -1;
}
const find = (label: string): i32 => named(ui.rootNode(), label);
ui.onKey((e: ui.KeyEvent) => { globalKeys++; });
render(App, 0xffffff, (dt: number) => {
  frame++;
  if (frame === 2) {
    equal(ui.getValue(find('Budget')), '-1,249.50');
    equal(ui.fieldMode(find('Search')), 6); equal(ui.fieldMode(find('Verification code')), 1);
    ui.click(find('Show or hide password')); equal(ui.getNumber(find('Secret'), 'password'), 0);
    ui.click(find('Show or hide password')); equal(ui.getNumber(find('Secret'), 'password'), 1);
    ui.click(find('Clear')); equal(value(), ''); ui.keyDown(find('Name'), 'z', ui.CTRL); equal(value(), 'Ada');
    ui.focusNode(find('Budget')); ui.select(find('Budget'), 0, 100); ui.typeText(-1, 'xx23.456'); equal(money(), 23.45);
    ui.keyDown(find('Name'), 'Enter'); equal(submits, 1);
    ui.keyDown(find('Notes'), 'Enter', ui.CTRL); equal(submits, 2);
    ui.keyDown(find('Form field'), 'Enter'); equal(submits, 3);
    ui.keyDown(find('Seats'), 'ArrowUp', ui.SHIFT); equal(n(), 12);
    ui.keyDown(find('Seats'), 'Home'); equal(n(), 1);
    ui.keyDown(find('Seats'), 'ArrowDown'); equal(n(), 1);
    setN(6);
    const scrub = ui.screenBox(find('Opacity')), x = scrub[0] + 20, y = scrub[1] + scrub[3] / 2;
    ui.pointerAt(x, y, true); ui.pointerAt(x + 20, y, true); ui.systemSignal('focus 0'); ui.systemSignal('focus 1'); ui.pointerAt(x + 20, y, false);
    const afterCancel = n(); ok(afterCancel > 6);
    ui.pointerAt(x, y, true); ui.pointerAt(x + 20, y, true); ui.pointerAt(x + 20, y, false); ok(n() > afterCancel);
    const validScrub = n(); ui.focusNode(find('Opacity')); ui.select(find('Opacity'), 0, 100); ui.typeText(-1, 'not-number'); ui.focusNode(find('Name')); equal(ui.getValue(find('Opacity')), String(validScrub)); equal(n(), validScrub);
    ui.focusNode(find('Tags')); ui.typeText(-1, 'Design'); ui.keyDown(-1, 'Enter');
    equal(tags().join(','), 'Design'); ui.typeText(-1, 'Design'); ui.keyDown(-1, 'Enter'); equal(tags().length, 1);
    ui.keyDown(-1, 'Backspace'); equal(tags().length, 0);
    ui.focusNode(find('Verification code')); ui.typeText(-1, '1x23456'); equal(code(), '1234'); equal(complete, 1);
    ui.keyDown(find('Country'), 'ArrowDown');
  }
  if (frame === 3) { ui.keyDown(-1, 'ArrowDown'); ui.keyDown(-1, 'Enter'); }
  if (frame === 4) { setMoney(1249.5); equal(selected(), 'c'); equal(ui.focused(), find('Country')); setSelected('a'); ui.keyDown(find('Language'), 'ArrowDown'); }
  if (frame === 5) { equal(ui.getValue(find('Budget')), '1,249.50'); ui.typeText(-1, 'Cedar'); ui.keyDown(-1, 'ArrowDown'); ui.keyDown(-1, 'Enter'); }
  if (frame === 6) { equal(selected(), 'c'); ui.keyDown(find('Tools'), 'ArrowDown'); }
  if (frame === 7) { ui.click(find('Select all Tools')); equal(many().join(','), 'a,c'); ui.click(find('Clear Tools')); equal(many().length, 0); setMany(['b']); ui.click(find('Select all Tools')); equal(many().join(','), 'a,b,c'); ui.click(find('Clear Tools')); equal(many().join(','), 'b'); ui.keyDown(-1, 'Escape'); }
  if (frame === 8) {
    ui.keyDown(find('Shortcut'), 'Enter'); const before = globalKeys;
    ui.keyDown(-1, 's', ui.CTRL | ui.SHIFT); equal(shortcut(), 'ctrl-shift-s'); equal(globalKeys, before);
    ui.keyDown(-1, 'Enter'); ui.keyDown(-1, 'Escape'); equal(shortcut(), 'ctrl-shift-s');
    ui.keyDown(-1, 'Enter'); ui.keyDown(-1, 'Backspace'); equal(shortcut(), '');
    ui.keyDown(-1, 'Enter'); ui.keyDown(-1, 'k', ui.META); equal(shortcut(), 'meta-k');
    ui.keyDown(-1, 'Enter'); ui.systemSignal('focus 0'); ui.systemSignal('focus 1'); ui.keyDown(-1, 's', ui.CTRL); equal(shortcut(), 'meta-k');
    ui.systemSignal('reducemotion 1'); ui.keyDown(find('Country'), 'ArrowDown'); ui.keyDown(-1, 'Escape');
  }
  if (frame === 10) console.log('inputs: ok');
});
P
log="$tmp/run.log"
ZINC_HEADLESS=1 ZINC_FRAMES=12 ZINC_SCALE=1 timeout 30 "$ZINC" run "$tmp" > "$log" 2>&1 || { cat "$log"; exit 1; }
grep -q '^inputs: ok$' "$log" || { cat "$log"; exit 1; }

# React parent renders must retain password visibility and an active scrub session.
cat > "$tmp/src/react.tsx" <<'P'
import { render, useState } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
import { PasswordField, ScrubField, MoneyField, ShortcutRecorder, MultiSelect, useQuietTheme } from 'zinc:ui/kit';
import { equal, ok } from 'zinc:assert';
useQuietTheme();
let numberValue = 10, afterFirstMove = 0, frame = 0, recorded = 'mod-k';
let selected: string[] = [];
let forceParentRender = (): void => {};
function App(): i32 {
  const [secret, setSecret] = useState('secret');
  const [value, setValue] = useState<number>(10);
  const [shortcut, setShortcut] = useState('mod-k');
  const [amount, setAmount] = useState(1249.5);
  const [choices, setChoices] = useState<string[]>([]);
  const [tick, setTick] = useState(0);
  forceParentRender = () => setTick(tick + 1);
  return <View className="flex-col gap-4 p-4 w-[500px]">
    <PasswordField label="Secret" value={() => secret} onInput={setSecret} />
    <ScrubField label="Amount" value={() => value} onChange={(v: number) => { numberValue = v; setValue(v); }} min={0} max={100} step={1} />
    <MoneyField label="Budget" value={() => amount} onChange={setAmount} />
    <ShortcutRecorder label="Shortcut" value={() => shortcut} onChange={(v: string) => { recorded = v; setShortcut(v); }} />
    <MultiSelect label="Tools" value={() => choices} onChange={(v: string[]) => { selected = v; setChoices(v); }} items={[{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }]} />
    <Text>{tick}</Text>
  </View>;
}
function named(h: i32, label: string): i32 {
  const n = ui.inspectNode(h);
  if (n === null) return -1;
  if (n.label === label) return h;
  for (const child of n.children) { const found = named(child, label); if (found >= 0) return found; }
  return -1;
}
const find = (label: string): i32 => named(ui.rootNode(), label);
function openList(h: i32): boolean {
  const n = ui.inspectNode(h);
  if (n === null || n.hidden) return false;
  if (n.role === 'listbox') return true;
  for (const child of n.children) if (openList(child)) return true;
  return false;
}
render(App, 0xffffff, (dt: number) => {
  frame++;
  if (frame === 2) {
    ui.click(find('Show or hide password')); equal(ui.getNumber(find('Secret'), 'password'), 0);
    ui.typeText(-1, 'x');
  }
  if (frame === 4) {
    equal(ui.getNumber(find('Secret'), 'password'), 0, 'parent update reset password visibility');
    const b = ui.screenBox(find('Amount'));
    ui.pointerAt(b[0] + 20, b[1] + b[3] / 2, true);
    ui.pointerAt(b[0] + 30, b[1] + b[3] / 2, true);
    afterFirstMove = numberValue;
  }
  if (frame === 6) {
    const b = ui.screenBox(find('Amount'));
    ui.pointerAt(b[0] + 40, b[1] + b[3] / 2, true);
    ui.pointerAt(b[0] + 40, b[1] + b[3] / 2, false);
    ok(numberValue > afterFirstMove, 'parent update reset active scrub');
    ui.keyDown(find('Shortcut'), 'Enter'); forceParentRender();
  }
  if (frame === 8) { ui.keyDown(find('Shortcut'), 'k', ui.CTRL | ui.SHIFT); equal(recorded, 'ctrl-shift-k', 'parent update reset recording'); }
  if (frame === 9) ui.keyDown(find('Tools'), 'ArrowDown');
  if (frame === 10) ui.keyDown(find('Alpha'), ' ');
  if (frame === 11) { ui.keyUp(' ');  }
  if (frame === 12) { equal(selected.join(','), 'a'); ok(openList(ui.rootNode()), 'parent update closed multi-select'); equal(ui.focused(), find('Alpha')); ui.keyDown(-1, 'ArrowDown'); ui.keyDown(-1, ' '); }
  if (frame === 13) ui.keyUp(' ');
  if (frame === 14) { equal(selected.join(','), 'a,b'); ok(openList(ui.rootNode())); equal(ui.focused(), find('Beta')); ui.keyDown(-1, 'Escape'); }
  if (frame === 17) { equal(ui.focused(), find('Tools')); ui.focusNode(find('Budget')); ui.select(find('Budget'), 0, 100); ui.typeText(-1, '2345.67'); }
  if (frame === 19) ui.focusNode(find('Secret'));
  if (frame === 21) { equal(ui.getValue(find('Budget')), '2,345.67', 'focus subscription lost blur after parent render'); console.log('inputs React state: ok'); }
});
P
echo '{"name":"inputs","entry":"src/react.tsx","icons":["chevron-down","check"],"app":{"window":{"width":800,"height":600}}}' > "$tmp/zinc.json"
for engine in interp quickjs; do
  case "$engine" in interp) set -- --interp;; quickjs) set -- --engine quickjs;; esac
  ZINC_HEADLESS=1 ZINC_FRAMES=23 ZINC_SCALE=1 timeout 30 "$ZINC" run "$tmp" "$@" > "$log" 2>&1 || { cat "$log"; exit 1; }
  grep -q '^inputs React state: ok$' "$log" || { cat "$log"; exit 1; }
done
echo 'kit inputs: ok'
