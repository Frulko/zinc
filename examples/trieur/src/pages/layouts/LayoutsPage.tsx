// trieur's zones page: the same pile, six arrangements of its tiles, and as many zones as you like (up to sixteen).
import { Icon } from 'zinc:icons';
import { createSignal } from 'zinc:ui/solid';
import { createDeck, Deck, THEME } from 'zinc:trieur';
import { flick } from '@trieur/core/flick';
import { t } from '../../i18n';
import { shuffled, type Link } from '@trieur/data/links';
import { LinkCard } from '../../components/LinkCard';

const POOL = [
  { id: 'dev', label: 'dev', icon: 'code', color: '#4a54f2' },
  { id: 'ai', label: 'ai', icon: 'brain', color: '#8b5cf6' },
  { id: 'design', label: 'design', icon: 'palette', color: '#ec4899' },
  { id: 'home', label: 'home', icon: 'house', color: '#f59e0b' },
  { id: 'watch', label: 'watch', icon: 'tv', color: '#10b981' },
  { id: 'to read', label: 'to read', icon: 'book-open', color: '#64748b' },
  { id: 'rust', label: 'rust', icon: 'cog', color: '#b45309' },
  { id: 'papers', label: 'papers', icon: 'pen-line', color: '#0ea5e9' },
  { id: 'music', label: 'music', icon: 'music', color: '#d946ef' },
  { id: 'travel', label: 'travel', icon: 'plane', color: '#14b8a6' },
  { id: 'food', label: 'food', icon: 'utensils', color: '#f43f5e' },
  { id: 'money', label: 'money', icon: 'wallet', color: '#22c55e' },
  { id: 'games', label: 'games', icon: 'gamepad-2', color: '#6366f1' },
  { id: 'shop', label: 'shop', icon: 'shopping-bag', color: '#eab308' },
  { id: 'health', label: 'health', icon: 'heart-pulse', color: '#ef4444' },
  { id: 'archive', label: 'archive', icon: 'archive', color: '#94a3b8' },
];
const LAYOUTS = ['auto', 'circle', 'radial', 'voronoi', 'grid', 'dock'] as const;

export function LayoutsPage(): any {
  const [layout, setLayout] = createSignal<string>('auto');
  const [count, setCount] = createSignal(6);
  const deck = createDeck<Link>({ items: shuffled(4), zones: POOL.slice(0, 6), multi: true, tapZones: false, plugins: [flick()], cardW: 300, cardH: 210 });
  const pick = (l: string): void => { setLayout(l); deck.setLayout(l as any); };
  const resize = (d: number): void => { const n = Math.max(2, Math.min(POOL.length, count() + d)); setCount(n); deck.setZones(POOL.slice(0, n)); };
  const seg = (on: boolean) => ({ backgroundColor: on ? THEME.accent : THEME.chip });
  return <View className="grow flex-col">
    <View className="h-[56] shrink-0 flex-row items-center gap-2 px-4">
      {LAYOUTS.map((l) => <Button onClick={() => pick(l)} className="h-[32] px-3 rounded-[9] items-center justify-center" style={seg(layout() === l)}>
        <Text className="text-[13px] font-medium" style={{ color: THEME.ink }}>{l}</Text>
      </Button>)}
      <View className="grow" />
      <Button onClick={() => resize(-1)} className="w-[32] h-[32] rounded-[9] items-center justify-center" style={{ backgroundColor: THEME.chip }}><Icon name="minus" size={15} color={() => THEME.ink} /></Button>
      <Text className="text-[13px] font-semibold w-[70] text-center" style={{ color: THEME.ink }}>{t.zones(count())}</Text>
      <Button onClick={() => resize(1)} className="w-[32] h-[32] rounded-[9] items-center justify-center" style={{ backgroundColor: THEME.chip }}><Icon name="plus" size={15} color={() => THEME.ink} /></Button>
    </View>
    <Deck deck={deck} renderCard={(l: Link) => <LinkCard link={l} />} />
  </View>;
}
