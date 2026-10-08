// Discover: a large title, category chips and a feed of cards with generative covers.
import { createSignal, For } from 'zinc:ui/solid';
import { styles, Chip, Avatar } from '../parts';
import { t } from '../theme';
import { cover } from '../art';
import { Icon } from 'zinc:icons';

export class Story {
  title: string; author: string; initials: string; minutes: i32; likes: i32; seed: i32; c1: i32; c2: i32; tag: string;
  constructor(title: string, author: string, initials: string, minutes: i32, likes: i32, seed: i32, c1: i32, c2: i32, tag: string) {
    this.title = title; this.author = author; this.initials = initials; this.minutes = minutes; this.likes = likes; this.seed = seed; this.c1 = c1; this.c2 = c2; this.tag = tag;
  }
}
export const STORIES: Story[] = [
  new Story('Desert light at golden hour', 'Ana Ruiz', 'AR', 6, 1284, 3, 0xFF8A5B, 0xFFD3A5, 'Travel'),
  new Story('A quiet kitchen in Kyoto', 'Kenji Mori', 'KM', 4, 862, 11, 0x2DD4BF, 0x0F766E, 'Food'),
  new Story('Designing calm interfaces', 'Lea Martin', 'LM', 9, 2210, 27, 0x8B5CF6, 0x312E81, 'Design'),
];
const TAGS = ['All', 'Travel', 'Food', 'Design'];
const [tag, setTag] = createSignal<string>('All');

function Card(s: Story, open: (s: Story) => void): i32 {
  return <view style={[styles.card, { backgroundColor: t().surface }, tag() !== 'All' && tag() !== s.tag && styles.hidden]} onClick={() => open(s)}>
    <canvas style={{ height: 180 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => cover(x, y, w, h, s.seed, s.c1, s.c2, t())} />
    <view style={styles.cardBody}>
      <text style={[styles.tiny, styles.bold, { color: t().accent }]}>{s.tag.toUpperCase()}</text>
      <text style={[styles.title, { color: t().ink }]}>{s.title}</text>
      <view style={styles.between}>
        <view style={styles.row}>
          <Avatar initials={s.initials} bg={() => s.c2} />
          <text style={[styles.small, { color: t().muted }]}>{`${s.author} · ${s.minutes} min`}</text>
        </view>
        <view style={[styles.row, { gap: 4 }]}>
          <Icon name="heart" size={16} color={() => t().accent} />
          <text style={[styles.small, { color: t().muted }]}>{`${s.likes}`}</text>
        </view>
      </view>
    </view>
  </view>;
}

export function Discover(open: (s: Story) => void): i32 {
  return <view style={styles.screen}>
    <view style={{ flexDirection: 'column', gap: 4 }}>
      <text style={[styles.tiny, { color: t().muted }]}>THURSDAY, OCTOBER 8</text>
      <text style={[styles.display, { color: t().ink }]}>Discover</text>
    </view>
    <view style={styles.row}>
      <For each={TAGS}>{(g: string, i: i32) => <Chip label={g} on={() => tag() === g} press={() => setTag(g)} />}</For>
    </view>
    <For each={STORIES}>{(s: Story, i: i32) => Card(s, open)}</For>
  </view>;
}
