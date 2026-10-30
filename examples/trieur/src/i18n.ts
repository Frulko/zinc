// The demo's words in the language shown: the computer's at start, then the sidebar's FR / EN (zinc:trieur's language signal, which the
// deck's own labels follow too). trieur's sample data stays as trieur writes it.
import { language } from 'zinc:trieur';

const en = {
  links: 'Links', linksHint: 'a model that learns',
  layouts: 'Layouts', layoutsHint: 'six ways to place zones',
  mail: 'Inbox', mailHint: 'triage the morning mail',
  study: 'Flashcards', studyHint: 'spaced repetition',
  zones: (n: number) => `${n} zones`,
  learnt: (n: number) => `${n} learnt · tap the card to see the answer`,
  showAnswer: 'Show answer',
  dark: 'Dark', light: 'Light', language: 'Language',
  grades: { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' } as Record<string, string>,
  days: (label: string) => label,
};
type Words = typeof en;
const fr: Words = {
  links: 'Liens', linksHint: 'un modèle qui apprend',
  layouts: 'Dispositions', layoutsHint: 'six façons de placer les zones',
  mail: 'Boîte de réception', mailHint: 'trier le courrier du matin',
  study: 'Cartes mémoire', studyHint: 'répétition espacée',
  zones: (n) => `${n} zones`,
  learnt: (n) => `${n} apprise${n > 1 ? 's' : ''} · touchez la carte pour voir la réponse`,
  showAnswer: 'Voir la réponse',
  dark: 'Sombre', light: 'Clair', language: 'Langue',
  grades: { again: 'À revoir', hard: 'Difficile', good: 'Bien', easy: 'Facile' },
  days: (label) => label === 'now' ? 'maintenant' : label.replace('days', 'jours').replace('day', 'jour'),
};
/** Reads the words of the language shown: what reads them follows a change. */
export const t = {} as Words;
for (const k of Object.keys(en) as Array<keyof Words>) Object.defineProperty(t, k, { get: () => (language() === 'fr' ? fr : en)[k], enumerable: true });
