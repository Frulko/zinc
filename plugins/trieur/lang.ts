// The language of the deck's labels: the computer's at start (zinc:sys locale()), changed with setLanguage. A signal, so labels follow.
import { locale } from 'zinc:sys';
import { createSignal } from 'zinc:ui/solid';

export type Language = 'en' | 'fr';
const [language, set] = createSignal<Language>(locale().startsWith('fr') ? 'fr' : 'en');
export { language };
export function setLanguage(l: Language): void { set(l); }
