// Detail: a hero header with the title over the cover, stats pills, the text and two buttons.
import { styles, Button } from '../parts';
import { t } from '../theme';
import { cover } from '../art';
import { Story } from './Discover';

function Stat(p: { value: string; label: string }): i32 {
  return <view style={{ flexDirection: 'column', alignItems: 'center', gap: 2, flexGrow: 1, paddingVertical: 12, borderRadius: 16, backgroundColor: t().surface }}>
    <text style={[styles.title, { color: t().ink }]}>{p.value}</text>
    <text style={[styles.tiny, { color: t().muted }]}>{p.label}</text>
  </view>;
}

export function Detail(s: () => Story, back: () => void): i32 {
  return <view style={{ flexDirection: 'column' }}>
    <view style={{ height: 300 }}>
      <canvas style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => cover(x, y, w, h, s().seed, s().c1, s().c2, t())} />
      <view style={[styles.pill, { position: 'absolute', top: 20, left: 20, backgroundColor: 0xFFFFFF }]} onClick={back}>
        <text style={[styles.small, styles.bold, { color: 0x1C1917 }]}>‹ Back</text>
      </view>
      <view style={{ position: 'absolute', left: 20, right: 20, bottom: 22, flexDirection: 'column', gap: 6 }}>
        <text style={[styles.tiny, styles.bold, { color: 0xFFFFFF }]}>{s().tag.toUpperCase()}</text>
        <text style={[styles.display, { color: 0xFFFFFF }]}>{s().title}</text>
      </view>
    </view>
    <view style={styles.screen}>
      <view style={{ flexDirection: 'row', gap: 10 }}>
        <Stat value={`${s().minutes}m`} label="READ" />
        <Stat value={`${Math.round(s().likes / 100) / 10}k`} label="LIKES" />
        <Stat value="4.9" label="RATING" />
      </view>
      <text style={[styles.body, { color: t().ink }]}>{`By ${s().author}. Light moves slowly here: the walls warm up first, then the floor, and the shadows lengthen until the room is mostly amber. This page is laid out by Yoga and styled with plain objects, the way a React Native screen is.`}</text>
      <view style={{ flexDirection: 'column', gap: 10 }}>
        <Button label="Save to library" primary={true} press={() => {}} />
        <Button label="Share" primary={false} press={() => {}} />
      </view>
    </view>
  </view>;
}
