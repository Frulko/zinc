// The app's words in the language shown (zinc:trieur's language signal: the computer's at start, then the FR / EN switch).
import { language } from 'zinc:trieur';

const en = {
  title: 'Photo sorter',
  tagline: 'Pick folders, then file each picture with a gesture, a key, or the suggestion of a model that learns your habits.',
  sources: 'Source folders', addFolder: 'Add a folder', noSource: 'No folder yet: add the ones that hold your pictures.',
  output: 'Where the albums go', inSource: 'Inside each source folder', otherFolder: 'Another folder', choose: 'Choose…',
  mode: 'The pictures are', moved: 'Moved', copied: 'Copied',
  albums: 'Albums', newAlbum: 'New album', add: 'Add',
  start: (n: number) => n === 0 ? 'No picture found' : `Sort ${n} picture${n > 1 ? 's' : ''}`,
  scanning: 'Looking for pictures…',
  trash: 'Trash',
  finish: 'Finish',
  back: 'Settings',
  sorted: (n: number) => `${n} sorted`,
  done: 'All sorted',
  summary: (n: number) => `${n} picture${n > 1 ? 's' : ''} filed this session.`,
  open: 'Open',
  trashTitle: (n: number) => `${n} picture${n !== 1 ? 's' : ''} in the trash`,
  trashHint: 'They wait in a .trieur-trash folder next to where they were.',
  emptyTrash: 'Move to the system trash', restore: 'Put them back',
  trashed: (n: number) => `${n} moved to the system trash.`,
  again: 'Sort more',
  moveHint: 'Moved into album folders: the sources are left with what you did not sort.',
  copyHint: 'Copied into album folders: the sources stay as they are.',
  date: (d: number, m: number, y: number) => `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m]} ${d}, ${y}`,
};
type Words = typeof en;
const fr: Words = {
  title: 'Trieur photos',
  tagline: 'Choisissez des dossiers, puis rangez chaque photo d’un geste, d’une touche, ou en suivant un modèle qui apprend vos habitudes.',
  sources: 'Dossiers sources', addFolder: 'Ajouter un dossier', noSource: 'Aucun dossier : ajoutez ceux qui contiennent vos photos.',
  output: 'Où créer les albums', inSource: 'Dans chaque dossier source', otherFolder: 'Un autre dossier', choose: 'Choisir…',
  mode: 'Les photos sont', moved: 'Déplacées', copied: 'Copiées',
  albums: 'Albums', newAlbum: 'Nouvel album', add: 'Ajouter',
  start: (n) => n === 0 ? 'Aucune photo trouvée' : `Trier ${n} photo${n > 1 ? 's' : ''}`,
  scanning: 'Recherche des photos…',
  trash: 'Corbeille',
  finish: 'Terminer',
  back: 'Réglages',
  sorted: (n) => `${n} rangée${n > 1 ? 's' : ''}`,
  done: 'Tout est rangé',
  summary: (n) => `${n} photo${n > 1 ? 's' : ''} rangée${n > 1 ? 's' : ''} pendant cette séance.`,
  open: 'Ouvrir',
  trashTitle: (n) => `${n} photo${n > 1 ? 's' : ''} dans la corbeille`,
  trashHint: 'Elles attendent dans un dossier .trieur-trash, à côté de leur emplacement d’origine.',
  emptyTrash: 'Mettre à la corbeille du système', restore: 'Tout restaurer',
  trashed: (n) => `${n} mise${n > 1 ? 's' : ''} à la corbeille du système.`,
  again: 'Trier encore',
  moveHint: 'Déplacées dans des dossiers d’albums : il ne reste dans les sources que ce qui n’est pas trié.',
  copyHint: 'Copiées dans des dossiers d’albums : les sources restent intactes.',
  date: (d, m, y) => `${d === 1 ? '1er' : d} ${['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'][m]} ${y}`,
};
/** Reads the words of the language shown: what reads them follows a change. */
export const t = {} as Words;
for (const k of Object.keys(en) as Array<keyof Words>) Object.defineProperty(t, k, { get: () => (language() === 'fr' ? fr : en)[k], enumerable: true });

/** The albums a first run starts with (trieur's photo demo: keep, print, edit, archive), in the language of that run. */
export function defaultAlbums(): Array<{ id: string; label: string; icon: string; color: string }> {
  const fr_ = language() === 'fr';
  return [
    { id: 'keep', label: fr_ ? 'À garder' : 'Keep', icon: 'star', color: '#f59e0b' },
    { id: 'print', label: fr_ ? 'À imprimer' : 'Print', icon: 'printer', color: '#4a54f2' },
    { id: 'edit', label: fr_ ? 'À retoucher' : 'Edit', icon: 'wand-sparkles', color: '#8b5cf6' },
    { id: 'family', label: fr_ ? 'Famille' : 'Family', icon: 'heart', color: '#ec4899' },
    { id: 'travel', label: fr_ ? 'Voyages' : 'Travel', icon: 'plane', color: '#14b8a6' },
    { id: 'archive', label: fr_ ? 'Archives' : 'Archive', icon: 'archive', color: '#10b981' },
  ];
}
