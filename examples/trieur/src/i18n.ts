// The demo's words in the computer's language (zinc:sys locale()): French or English. trieur's sample data stays as trieur writes it.
import { locale } from 'zinc:sys';

const en = {
  links: 'Links', linksHint: 'a model that learns',
  layouts: 'Layouts', layoutsHint: 'six ways to place zones',
  mail: 'Inbox', mailHint: 'triage the morning mail',
  study: 'Flashcards', studyHint: 'spaced repetition',
  zones: (n: number) => `${n} zones`,
  learnt: (n: number) => `${n} learnt · tap the card to see the answer`,
  showAnswer: 'Show answer',
  dark: 'Dark', light: 'Light',
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
  dark: 'Sombre', light: 'Clair',
  grades: { again: 'À revoir', hard: 'Difficile', good: 'Bien', easy: 'Facile' },
  days: (label) => label === 'now' ? 'maintenant' : label.replace('days', 'jours').replace('day', 'jour'),
};
export const t: Words = locale().startsWith('fr') ? fr : en;
