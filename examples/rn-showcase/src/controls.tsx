// Form controls React Native leaves to libraries (a slider, a segmented control, checkboxes, radios, a stepper, a select and a date picker), built from
// View, Text, Pressable, Modal and PanResponder, controlled like React Native's own: they show `value` and report changes.
import { useState, useRef } from 'zinc:ui/react';
import { View, Text, Pressable, Modal, TextInput, PanResponder, StyleSheet } from 'zinc:react-native';
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';
import { theme, SP, R_CONTROL, R_CARD, T_BODY, T_SMALL, T_TINY } from './theme';
import { tr } from './i18n';

/** A labelled text field with its error line. */
export function Field(p: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; keyboardType?: string; secure?: boolean;
  error?: string; multiline?: boolean; maxLength?: number; onSubmit?: () => void }) {
  const c = theme();
  const err = p.error ?? '';
  return <View style={{ gap: SP }}>
    <Text style={[s.label, { color: c.ink }]}>{p.label}</Text>
    <TextInput style={[s.input, { backgroundColor: c.surface, color: c.ink, borderColor: err !== '' ? c.danger : c.line, height: p.multiline === true ? 96 : 46 }]}
      value={p.value} onChangeText={p.onChange} placeholder={p.placeholder ?? ''} keyboardType={p.keyboardType ?? 'default'} secureTextEntry={p.secure === true}
      multiline={p.multiline === true} maxLength={p.maxLength ?? -1} onSubmitEditing={p.onSubmit} accessibilityLabel={p.label} />
    {err !== '' && <View style={s.err}><Icon name="circle-alert" size={14} color={() => theme().danger} /><Text style={[s.small, { color: c.danger }]}>{err}</Text></View>}
  </View>;
}

/** A square checkbox with its label. */
export function Checkbox(p: { label: string; on: boolean; onToggle: () => void }) {
  const c = theme();
  return <Pressable style={s.choice} onPress={p.onToggle} accessibilityLabel={p.label}>
    <View style={[s.box, { borderColor: p.on ? c.accent : c.faint, backgroundColor: p.on ? c.accent : c.surface }]} role="checkbox" aria-checked={p.on}>
      {p.on && <Icon name="check" size={14} color={() => theme().accentInk} strokeWidth={3} />}
    </View>
    <Text style={[s.body, { color: c.ink }]}>{p.label}</Text>
  </Pressable>;
}

/** One option of a radio group. */
export function Radio(p: { label: string; sub?: string; on: boolean; onPress: () => void }) {
  const c = theme();
  return <Pressable style={[s.radio, { borderColor: p.on ? c.accent : c.line, backgroundColor: p.on ? c.accentSoft : c.surface }]} onPress={p.onPress} accessibilityLabel={p.label}>
    <View style={[s.dot, { borderColor: p.on ? c.accent : c.faint }]} role="radio" aria-checked={p.on}>{p.on && <View style={[s.dotIn, { backgroundColor: c.accent }]} />}</View>
    <View style={{ flex: 1 }}>
      <Text style={[s.body, { color: c.ink, fontWeight: '600' }]}>{p.label}</Text>
      {p.sub !== undefined && <Text style={[s.small, { color: c.muted }]}>{p.sub as string}</Text>}
    </View>
  </Pressable>;
}

/** A segmented control: one of a few options. */
export function Segmented(p: { options: string[]; value: number; onChange: (i: number) => void }) {
  const c = theme();
  return <View style={[s.seg, { backgroundColor: c.raised }]} role="tablist">
    {p.options.map((o: string, i: number) => <Pressable style={[s.segItem, { backgroundColor: i === p.value ? c.surface : c.raised }]} onPress={() => p.onChange(i)} accessibilityLabel={o}>
      <Text style={[s.small, { color: i === p.value ? c.ink : c.muted, fontWeight: i === p.value ? '600' : '400' }]}>{o}</Text>
    </Pressable>)}
  </View>;
}

/** A − value + stepper between min and max. */
export function Stepper(p: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  const c = theme();
  return <View style={[s.stepper, { borderColor: c.line }]}>
    <Pressable style={s.stepBtn} onPress={() => p.onChange(Math.max(p.min, p.value - 1))} disabled={p.value <= p.min} accessibilityLabel="minus">
      <Icon name="minus" size={18} color={() => p.value <= p.min ? theme().faint : theme().ink} />
    </Pressable>
    <Text style={[s.body, { color: c.ink, width: 36, textAlign: 'center', fontWeight: '600' }]}>{`${p.value}`}</Text>
    <Pressable style={s.stepBtn} onPress={() => p.onChange(Math.min(p.max, p.value + 1))} disabled={p.value >= p.max} accessibilityLabel="plus">
      <Icon name="plus" size={18} color={() => p.value >= p.max ? theme().faint : theme().ink} />
    </Pressable>
  </View>;
}

/** A slider 0..1: drag the knob (PanResponder) or press − and +. `width` is the track's width in pixels. */
export function Slider(p: { value: number; width: number; onChange: (v: number) => void; label: string }) {
  const c = theme();
  const from = useRef<number>(0);
  const cb = useRef<(v: number) => void>(p.onChange);
  const now = useRef<number>(p.value);
  cb.current = p.onChange; now.current = p.value;
  const w = p.width;
  const pan = useRef<ui.PanResponderInstance | null>(null);
  if (pan.current === null) pan.current = PanResponder.create({
    onStartShouldSetPanResponder: (e: ui.ResponderEvent, g: ui.GestureState): boolean => true,
    onPanResponderGrant: (e: ui.ResponderEvent, g: ui.GestureState): void => { from.current = now.current; },
    onPanResponderMove: (e: ui.ResponderEvent, g: ui.GestureState): void => cb.current(Math.max(0, Math.min(1, from.current + g.dx / (w - 24)))),
  });
  const x = p.value * (w - 24);
  return <View style={{ width: w, height: 32, justifyContent: 'center' }} role="slider" aria-label={p.label}>
    <View style={[s.rail, { backgroundColor: c.raised }]}><View style={{ width: x + 12, height: 6, borderRadius: 3, backgroundColor: c.accent }} /></View>
    <View {...(pan.current as ui.PanResponderInstance).panHandlers} style={[s.knob, { transform: [{ translateX: x }], backgroundColor: 0xFFFFFF, borderColor: c.line }]} />
  </View>;
}

/** A field that opens a sheet of options. */
export function Select(p: { label: string; options: string[]; value: number; onChange: (i: number) => void; placeholder: string }) {
  const c = theme();
  const [open, setOpen] = useState(false);
  return <View style={{ gap: SP }}>
    <Text style={[s.label, { color: c.ink }]}>{p.label}</Text>
    <Pressable style={[s.input, s.between, { backgroundColor: c.surface, borderColor: c.line }]} onPress={() => setOpen(true)} accessibilityLabel={p.label}>
      <Text style={[s.body, { color: p.value >= 0 ? c.ink : c.faint }]}>{p.value >= 0 ? p.options[p.value] : p.placeholder}</Text>
      <Icon name="chevron-down" size={18} color={() => theme().muted} />
    </Pressable>
    <Modal visible={open} transparent={true} animationType="slide" onRequestClose={() => setOpen(false)}>
      <Pressable style={s.shade} onPress={() => setOpen(false)}>
        <View style={[s.sheet, { backgroundColor: c.surface }]}>
          <Text style={[s.body, { color: c.muted, fontWeight: '600', marginBottom: SP * 2 }]}>{p.label}</Text>
          {p.options.map((o: string, i: number) => <Pressable style={[s.option, { borderColor: c.line }]} onPress={() => { p.onChange(i); setOpen(false); }} accessibilityLabel={o}>
            <Text style={[s.body, { color: c.ink }]}>{o}</Text>{i === p.value && <Icon name="check" size={18} color={() => theme().accent} />}
          </Pressable>)}
        </View>
      </Pressable>
    </Modal>
  </View>;
}

const MONTHS: string[] = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function daysIn(y: number, m: number): number { return new Date(y, m + 1, 0).getDate(); }
export class Day { y: number; m: number; d: number; constructor(y: number, m: number, d: number) { this.y = y; this.m = m; this.d = d; } }
export function formatDay(d: Day | null): string { if (d === null) return ''; const v = d as Day; return `${v.d} ${MONTHS[v.m].substring(0, 3)} ${v.y}`; }

/** A date field: a month calendar in a sheet, with the previous and next month, and an hour stepper for the time. */
export function DateField(p: { label: string; value: Day | null; onChange: (d: Day) => void; error?: string }) {
  const c = theme();
  const [open, setOpen] = useState(false);
  const start = p.value !== null ? (p.value as Day) : new Day(2000, 0, 1);
  const [ym, setYm] = useState(start.y * 12 + start.m);
  const y = Math.floor(ym / 12), m = ym % 12;
  const first = new Date(y, m, 1).getDay();   // 0 = Sunday
  const cells: number[] = [];
  for (let i = 0; i < (first + 6) % 7; i++) cells.push(0);   // weeks start on Monday
  for (let d = 1; d <= daysIn(y, m); d++) cells.push(d);
  const err = p.error ?? '';
  return <View style={{ gap: SP }}>
    <Text style={[s.label, { color: c.ink }]}>{p.label}</Text>
    <Pressable style={[s.input, s.between, { backgroundColor: c.surface, borderColor: err !== '' ? c.danger : c.line }]} onPress={() => setOpen(true)} accessibilityLabel={p.label}>
      <Text style={[s.body, { color: p.value !== null ? c.ink : c.faint }]}>{p.value !== null ? formatDay(p.value) : 'DD MMM YYYY'}</Text>
      <Icon name="calendar" size={18} color={() => theme().muted} />
    </Pressable>
    {err !== '' && <View style={s.err}><Icon name="circle-alert" size={14} color={() => theme().danger} /><Text style={[s.small, { color: c.danger }]}>{err}</Text></View>}
    <Modal visible={open} transparent={true} animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={s.center}>
        <View style={[s.calendar, { backgroundColor: c.surface }]}>
          <View style={s.between}>
            <Pressable style={s.stepBtn} onPress={() => setYm(ym - 1)} accessibilityLabel="previous month"><Icon name="chevron-left" size={20} color={() => theme().ink} /></Pressable>
            <Text style={[s.body, { color: c.ink, fontWeight: '700' }]}>{`${MONTHS[m]} ${y}`}</Text>
            <Pressable style={s.stepBtn} onPress={() => setYm(ym + 1)} accessibilityLabel="next month"><Icon name="chevron-right" size={20} color={() => theme().ink} /></Pressable>
          </View>
          <View style={s.grid}>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d: string) => <View style={s.cell}><Text style={[s.tiny, { color: c.muted }]}>{d}</Text></View>)}
            {cells.map((d: number) => {
              const on = p.value !== null && (p.value as Day).y === y && (p.value as Day).m === m && (p.value as Day).d === d;
              return <Pressable style={[s.cell, { backgroundColor: on ? c.accent : c.surface }]} disabled={d === 0} onPress={() => { p.onChange(new Day(y, m, d)); setOpen(false); }}
                accessibilityLabel={`${d}`}><Text style={[s.small, { color: on ? c.accentInk : c.ink }]}>{d === 0 ? '' : `${d}`}</Text></Pressable>;
            })}
          </View>
          <Pressable style={[s.option, { justifyContent: 'center', borderColor: c.surface }]} onPress={() => setOpen(false)}><Text style={[s.body, { color: c.accent }]}>{tr('Close')}</Text></Pressable>
        </View>
      </View>
    </Modal>
  </View>;
}

const s = StyleSheet.create({
  label: { fontSize: T_SMALL, fontWeight: '600' },
  input: { height: 46, borderRadius: R_CONTROL, borderWidth: 1, paddingHorizontal: SP * 3, fontSize: T_BODY },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  err: { flexDirection: 'row', alignItems: 'center', gap: SP },
  body: { fontSize: T_BODY },
  small: { fontSize: T_SMALL },
  tiny: { fontSize: T_TINY },
  choice: { flexDirection: 'row', alignItems: 'center', gap: SP * 3, minHeight: 36 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radio: { flexDirection: 'row', alignItems: 'center', gap: SP * 3, padding: SP * 3, borderRadius: R_CONTROL, borderWidth: 1 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dotIn: { width: 10, height: 10, borderRadius: 5 },
  seg: { flexDirection: 'row', padding: 3, borderRadius: 10, gap: 3 },
  segItem: { flex: 1, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: R_CONTROL, height: 40 },
  stepBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  rail: { height: 6, borderRadius: 3, overflow: 'hidden' },
  knob: { position: 'absolute', left: 0, top: 4, width: 24, height: 24, borderRadius: 12, borderWidth: 1, shadowColor: '#000000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  shade: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.35)', justifyContent: 'flex-end' },
  sheet: { padding: SP * 5, paddingBottom: SP * 8, borderTopLeftRadius: R_CARD, borderTopRightRadius: R_CARD },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 48, borderBottomWidth: 1 },
  center: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.35)', alignItems: 'center', justifyContent: 'center' },
  calendar: { width: 340, borderRadius: R_CARD, padding: SP * 4, gap: SP * 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: 44, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
