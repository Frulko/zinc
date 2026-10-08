// Settings: grouped lists with switches (the knobs slide), a row that opens a bottom sheet, and the colour scheme.
import { styles, Switch } from '../parts';
import { t, isDark } from '../theme';

export class Toggle {
  label: string; on: boolean; pos: number;   // pos: the knob, 0..1, eased towards on by the app each frame
  constructor(label: string, on: boolean) { this.label = label; this.on = on; this.pos = on ? 1 : 0; }
}

function Row(p: { label: string; last: boolean; children: () => i32 }): i32 {
  return <view style={[styles.listRow, { borderBottomWidth: p.last ? 0 : 1, borderColor: t().line }]}>
    <text style={[styles.body, { color: t().ink }]}>{p.label}</text>
    {p.children()}
  </view>;
}

export function Settings(toggles: Toggle[], pos: (i: i32) => number, flip: (i: i32) => void, openSheet: () => void, dark: () => number, flipDark: () => void): i32 {
  return <view style={styles.screen}>
    <text style={[styles.display, { color: t().ink }]}>Settings</text>
    <view style={{ flexDirection: 'column', gap: 8 }}>
      <text style={[styles.tiny, { color: t().muted }]}>READING</text>
      <view style={[styles.group, { backgroundColor: t().surface }]}>
        <Row label={toggles[0].label} last={false}><Switch pos={() => pos(0)} press={() => flip(0)} /></Row>
        <Row label={toggles[1].label} last={false}><Switch pos={() => pos(1)} press={() => flip(1)} /></Row>
        <Row label={toggles[2].label} last={true}><Switch pos={() => pos(2)} press={() => flip(2)} /></Row>
      </view>
    </view>
    <view style={{ flexDirection: 'column', gap: 8 }}>
      <text style={[styles.tiny, { color: t().muted }]}>APPEARANCE</text>
      <view style={[styles.group, { backgroundColor: t().surface }]}>
        <Row label="Dark mode" last={false}><Switch pos={dark} press={flipDark} /></Row>
        <view style={styles.listRow} onClick={openSheet}>
          <text style={[styles.body, { color: t().ink }]}>Text size</text>
          <text style={[styles.body, { color: t().muted }]}>Comfortable ›</text>
        </view>
      </view>
    </view>
    <text style={[styles.small, { color: t().faint }]}>{isDark() ? 'Dark scheme: warm blacks, softer accent.' : 'Light scheme: warm paper, coral accent.'}</text>
  </view>;
}

/** The bottom sheet: a backdrop and a panel; `at` is 0 (hidden) .. 1 (open), eased by the app. */
export function Sheet(p: { at: () => number; close: () => void; choose: (s: string) => void; current: () => string }): i32 {
  const at = p.at, current = p.current, choose = p.choose;
  return <view style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, at() < 0.01 && styles.hidden]}>
    <view style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 0x000000, opacity: at() * 0.45 }} onClick={p.close} />
    <view style={{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'column', gap: 6, padding: 20, paddingBottom: 34, borderRadius: 26, backgroundColor: t().surface, translateY: (1 - at()) * 320 }}>
      <view style={{ alignItems: 'center' }}><view style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: t().line }} /></view>
      <text style={[styles.title, { color: t().ink }]}>Text size</text>
      <Option name="Compact" current={current} choose={choose} />
      <Option name="Comfortable" current={current} choose={choose} />
      <Option name="Large" current={current} choose={choose} />
    </view>
  </view>;
}
function Option(p: { name: string; current: () => string; choose: (s: string) => void }): i32 {
  const on = (): boolean => p.current() === p.name;
  return <view style={[styles.listRow, { borderRadius: 14, backgroundColor: on() ? t().accentSoft : t().surface }]} onClick={() => p.choose(p.name)}>
    <text style={[styles.body, { color: on() ? t().accent : t().ink }, on() && styles.bold]}>{p.name}</text>
    <view style={[{ width: 10, height: 10, borderRadius: 5, backgroundColor: t().accent }, !on() && styles.hidden]} />
  </view>;
}
