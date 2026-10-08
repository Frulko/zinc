// Stats: a chart card drawn on a canvas, four KPI tiles in a wrapping grid, and goals as progress bars made of views.
import { For } from 'zinc:ui/solid';
import { styles } from '../parts';
import { pct } from 'zinc:ui';
import { t } from '../theme';
import { chart } from '../art';

const WEEK = [4.5, 6, 3.5, 7, 5.5, 9, 6.5];

function Kpi(p: { value: string; label: string; delta: string; up: boolean }): i32 {
  return <view style={{ flexDirection: 'column', gap: 4, width: '48%', padding: 16, borderRadius: 18, backgroundColor: t().surface }}>
    <text style={[styles.tiny, { color: t().muted }]}>{p.label}</text>
    <text style={[styles.title, { color: t().ink }]}>{p.value}</text>
    <text style={[styles.small, styles.bold, { color: p.up ? t().teal : t().accent }]}>{p.delta}</text>
  </view>;
}

function Goal(p: { label: string; done: number; color: () => i32 }): i32 {
  return <view style={{ flexDirection: 'column', gap: 8 }}>
    <view style={styles.between}>
      <text style={[styles.small, { color: t().ink }]}>{p.label}</text>
      <text style={[styles.small, { color: t().muted }]}>{`${Math.round(p.done * 100)}%`}</text>
    </view>
    <view style={{ height: 10, borderRadius: 5, backgroundColor: t().raised }}>
      <view style={{ width: pct(p.done * 100), height: 10, borderRadius: 5, backgroundColor: p.color() }} />
    </view>
  </view>;
}

export function Stats(): i32 {
  return <view style={styles.screen}>
    <text style={[styles.display, { color: t().ink }]}>This week</text>
    <view style={[styles.card, { backgroundColor: t().surface, padding: 18, gap: 12 }]}>
      <view style={styles.between}>
        <view style={{ flexDirection: 'column', gap: 2 }}>
          <text style={[styles.tiny, { color: t().muted }]}>READING TIME</text>
          <text style={[styles.title, { color: t().ink }]}>42 h 30 min</text>
        </view>
        <view style={[styles.pill, { backgroundColor: t().accentSoft, height: 28 }]}><text style={[styles.tiny, styles.bold, { color: t().accent }]}>+18%</text></view>
      </view>
      <canvas style={{ height: 170 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => chart(x, y, w, h, WEEK, t())} />
    </view>
    <view style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
      <Kpi value="28" label="STORIES" delta="+6 this week" up={true} />
      <Kpi value="3.2k" label="LIKES" delta="+12%" up={true} />
      <Kpi value="11" label="SAVED" delta="-2" up={false} />
      <Kpi value="97" label="STREAK" delta="days in a row" up={true} />
    </view>
    <view style={[styles.card, { backgroundColor: t().surface, padding: 18, gap: 16 }]}>
      <Goal label="Read 5 stories" done={0.8} color={() => t().accent} />
      <Goal label="Save 3 for later" done={0.45} color={() => t().teal} />
      <Goal label="Share one" done={1} color={() => t().violet} />
    </view>
  </view>;
}
