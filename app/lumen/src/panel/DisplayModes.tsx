// The sizes the display offers and the resolution slider, which walks through the same sizes.
import * as M from 'zinc:monitors';
import { createSignal } from 'zinc:ui/solid';
import { CheckRow, Choice, Segmented } from '../components/GlassChoice';
import { GlassSlider } from '../components/GlassSlider';
import { GlassSwitch } from '../components/GlassSwitch';
import { chooseMode, modes, selected } from '../state';

function isHiDpi(m: M.Mode): boolean { return m.pixelWidth > m.width; }
function sizeKey(m: M.Mode): string { return `${m.width}x${m.height}x${isHiDpi(m) ? 1 : 0}`; }
function currentModeId(): number { const d = selected(); return d === null ? -1 : d.modeId; }

/** One mode per size, widest first: the current one for the current size, otherwise the highest refresh rate. */
function modesBySize(all: M.Mode[], hidpiOnly: boolean): M.Mode[] {
  const best: Map<string, M.Mode> = new Map<string, M.Mode>();
  const currentId = currentModeId();
  for (const m of all) {
    if (hidpiOnly && !isHiDpi(m)) continue;
    const key = sizeKey(m), held = best.get(key);
    if (held === undefined || (held.id !== currentId && (m.id === currentId || m.refresh > held.refresh))) best.set(key, m);
  }
  const sizes: M.Mode[] = [];
  best.forEach((m: M.Mode) => { sizes.push(m); });
  sizes.sort((a: M.Mode, b: M.Mode) => b.width - a.width);
  return sizes;
}

/** The current display's sizes that keep its sharpness, so the slider never jumps between sharp and blurred modes. */
function slidingSizes(): M.Mode[] {
  const d = selected();
  if (d === null) return [];
  const sizes = modesBySize(modes(), d.pixelWidth > d.width);
  sizes.reverse();
  return sizes;
}

export function ResolutionSlider(): i32 {
  const [heldIndex, setHeldIndex] = createSignal<number>(-1);
  const currentIndex = (): number => {
    const sizes = slidingSizes(), id = currentModeId();
    for (let i = 0; i < sizes.length; i++) if (sizes[i].id === id) return i;
    return 0;
  };
  const shownIndex = (): number => heldIndex() >= 0 ? heldIndex() : currentIndex();
  return <GlassSlider label="Resolution" icon="rectangle.expand.vertical" value={shownIndex} min={0} max={Math.max(1, slidingSizes().length - 1)}
    format={(v: number) => {
      const sizes = slidingSizes(), m = Math.round(v);
      return m < sizes.length ? `${sizes[m].width} × ${sizes[m].height}` : '';
    }}
    onChange={(v: number) => setHeldIndex(Math.round(v))}
    onRelease={() => {
      const sizes = slidingSizes(), i = heldIndex();
      setHeldIndex(-1);
      if (i >= 0 && i < sizes.length) chooseMode(sizes[i].id);
    }} />;
}

export function DisplayModeList(): i32 {
  const [hidpiOnly, setHidpiOnly] = createSignal<boolean>(false);
  return <View className="gap-1">
    <GlassSwitch label="HiDPI Only" value={hidpiOnly} onChange={setHidpiOnly} />
    <ScrollView className="max-h-[200px]">
      <For each={modesBySize(modes(), hidpiOnly())}>{(m: M.Mode) =>
        <CheckRow label={`${m.width} × ${m.height}`} detail={`${isHiDpi(m) ? 'HiDPI · ' : ''}${Math.round(m.refresh)} Hz`} on={() => currentModeId() === m.id} onPress={() => chooseMode(m.id)} />}
      </For>
    </ScrollView>
  </View>;
}

export function RefreshRates(): i32 {
  const rates = (): Choice[] => {
    let current: M.Mode | null = null;
    for (const m of modes()) if (m.id === currentModeId()) current = m;
    const out: Choice[] = [];
    if (current === null) return out;
    const key = sizeKey(current);
    for (const m of modes()) {
      const label = `${Math.round(m.refresh)} Hz`;
      if (sizeKey(m) === key && out.filter((c: Choice) => c.label === label).length === 0) out.push({ value: m.id, label: label });
    }
    return out;
  };
  return <Segmented choices={rates} value={currentModeId} onChange={chooseMode} />;
}
