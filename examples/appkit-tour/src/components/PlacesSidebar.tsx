// The sidebar: the places as a source list (an NSOutlineView under the AppKit host, a drawn tree elsewhere). Picking a place shows its files.
import { Sidebar, Outline } from 'zinc:appkit';
import { PLACES, RECENTS, holdsFiles } from '../places';
import { openPlace } from '../state';

export function PlacesSidebar(): i32 {
  return <Sidebar width={200} minWidth={150} maxWidth={320}>
    <Outline items={PLACES} expanded={['favorites', 'projects']} className="flex-1" accessibilityLabel="Places"
      onSelect={(id: string) => { if (holdsFiles(id)) openPlace(id); else if (id === '') openPlace(RECENTS); }} />
  </Sidebar>;
}
