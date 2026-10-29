// The first demo of trieur's site: links to file into folders, and a model that learns where the next one goes.
import { createDeck, Deck, kvStore } from 'zinc:trieur';
import { createRecommender } from '@trieur/learn';
import { flick } from '@trieur/core/flick';
import { shuffled, meta, type Link } from '@trieur/data/links';
import { LinkCard } from '../../components/LinkCard';

const ZONES = [
  { id: 'dev', label: 'dev', icon: 'code', color: '#4a54f2' },
  { id: 'ai', label: 'ai', icon: 'brain', color: '#8b5cf6' },
  { id: 'design', label: 'design', icon: 'palette', color: '#ec4899' },
  { id: 'home', label: 'home', icon: 'house', color: '#f59e0b' },
  { id: 'watch', label: 'watch', icon: 'tv', color: '#10b981' },
  { id: 'to read', label: 'to read', icon: 'book-open', color: '#64748b' },
];

export function LinksPage(): any {
  const deck = createDeck<Link>({
    items: shuffled(3),
    zones: ZONES,
    meta,
    multi: true,
    layout: 'circle',
    advisor: createRecommender({ key: 'demo-links', store: kvStore() }),
    plugins: [flick()],
    cardW: 300,
    cardH: 210,
  });
  return <Deck deck={deck} renderCard={(l: Link) => <LinkCard link={l} />} />;
}
