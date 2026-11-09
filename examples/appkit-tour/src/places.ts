// The sidebar's places: a source list as Finder's (Favorites, Projects, the Trash). 'recents' shows every file outside the Trash.
import type { OutlineItem } from 'zinc:appkit';

export const RECENTS = 'recents';
export const TRASH = 'trash';

export const PLACES: OutlineItem[] = [
  { id: 'favorites', label: 'Favorites', children: [
    { id: RECENTS, label: 'Recents' },
    { id: 'documents', label: 'Documents' },
    { id: 'downloads', label: 'Downloads' },
    { id: 'pictures', label: 'Pictures' },
    { id: 'music', label: 'Music' },
  ] },
  { id: 'projects', label: 'Projects', children: [
    { id: 'zinc', label: 'zinc' },
    { id: 'site', label: 'site' },
  ] },
  { id: TRASH, label: 'Trash' },
];

/** Whether a sidebar item holds files (a group heading does not). */
export function holdsFiles(id: string): boolean { return id !== 'favorites' && id !== 'projects' && id !== ''; }
