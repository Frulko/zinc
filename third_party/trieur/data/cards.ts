// A deck of flashcards, in the shape spaced repetition wants them: one question, one answer,
// and a scheduling state that the review updates. Mixed subjects on purpose — a real deck is
// whatever you happened to be learning that month.

export interface Flashcard {
  id: number;
  deck: string;
  front: string;
  back: string;
  note?: string;
  /** SM-2 state: ease factor, current interval in days, and how many times it has been right */
  ease: number;
  interval: number;
  reps: number;
  lapses: number;
  /** days from now until it is due; 0 means today */
  due: number;
}

const raw: Array<[string, string, string, string?]> = [
  ['Japanese', '木', 'tree · き / モク', 'The radical for wood is the same character, flattened.'],
  ['Japanese', '雨', 'rain · あめ / ウ', ''],
  ['Japanese', '駅', 'station · えき / エキ', 'Horse + measure: where horses were counted.'],
  ['Japanese', '早い', 'early, fast · はやい', ''],
  ['Japanese', '静か', 'quiet · しずか', ''],
  ['Piano', 'Relative minor of C major', 'A minor', 'Three semitones down from the tonic, always.'],
  ['Piano', 'Notes of a Dm7 chord', 'D · F · A · C', ''],
  ['Piano', 'Circle of fifths, two flats', 'B♭ major / G minor', ''],
  ['Piano', 'Italian for "gradually louder"', 'crescendo', ''],
  ['Rust', 'What does `?` do in a function returning Result', 'Returns early with the error, converted via From', ''],
  ['Rust', 'Difference between String and &str', 'Owned, growable heap buffer vs a borrowed view', ''],
  ['Rust', 'What makes a type Send', 'It is safe to move to another thread', ''],
  ['Rust', 'Cost of a Box<dyn Trait> call', 'One pointer indirection plus a vtable lookup', ''],
  ['Geography', 'Capital of Kyrgyzstan', 'Bishkek', ''],
  ['Geography', 'Longest river in Asia', 'The Yangtze — 6,300 km', ''],
  ['Geography', 'Country with the most time zones', 'France — twelve, counting overseas', 'Russia has eleven.'],
  ['Geography', 'The strait between Sicily and mainland Italy', 'The Strait of Messina', ''],
  ['Chemistry', 'Symbol for tungsten', 'W — from wolfram', ''],
  ['Chemistry', 'What Avogadro’s number counts', 'Particles in one mole · 6.022 × 10²³', ''],
  ['Chemistry', 'pH of a neutral solution at 25 °C', '7', ''],
];

export const cards: Flashcard[] = raw.map(([deck, front, back, note], i) => ({
  id: i + 1,
  deck,
  front,
  back,
  ...(note ? { note } : {}),
  ease: 2.5,
  interval: 0,
  reps: 0,
  lapses: 0,
  due: 0,
}));

/** The four answers of SM-2, in the order a hand expects them. */
export const grades = [
  { id: 'again', label: 'Again', icon: '↺', color: '#ef4444', q: 0 },
  { id: 'hard', label: 'Hard', icon: '△', color: '#f59e0b', q: 3 },
  { id: 'good', label: 'Good', icon: '◎', color: '#10b981', q: 4 },
  { id: 'easy', label: 'Easy', icon: '✦', color: '#0ea5e9', q: 5 },
];

/**
 * SM-2, the algorithm behind every spaced-repetition app since 1987.
 *
 * The ease factor moves with the answer and never falls below 1.3; the interval is the
 * previous one multiplied by that ease, except for the first two reviews, which are fixed at
 * one and six days. A lapse sends the card back to the start of the ladder but keeps most of
 * what it learned about how hard it is.
 */
export function schedule(card: Flashcard, q: number): Flashcard {
  const next = { ...card };
  if (q < 3) {
    next.reps = 0;
    next.lapses++;
    next.interval = 0; // again, in this session
    next.ease = Math.max(1.3, card.ease - 0.2);
    next.due = 0;
    return next;
  }
  next.reps = card.reps + 1;
  next.ease = Math.max(1.3, card.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  // SM-2 fixes the first two intervals at one and six days; Anki's learning steps give the
  // first answer a little more range, and four buttons that all say "1 day" tell you nothing
  next.interval =
    next.reps === 1 ? (q >= 5 ? 4 : q >= 4 ? 1 : 1) : next.reps === 2 ? (q >= 5 ? 9 : 6) : Math.round(card.interval * next.ease);
  next.due = next.interval;
  return next;
}

/** What the next interval would be for each grade — the numbers Anki prints on its buttons. */
export const preview = (card: Flashcard) =>
  grades.map((g) => {
    const s = schedule(card, g.q);
    return { id: g.id, days: s.interval, label: s.interval === 0 ? 'now' : s.interval === 1 ? '1 day' : `${s.interval} days` };
  });
