import { DEFAULT_SIZE, MIN_SIZE, MAX_SIZE } from '../constants';

// A village is entirely decided by (seed, size): the same two give the same terrain, pond, forest, rocks, flowers and deer, on every machine.
// The seed is typed like in Minecraft: a number is used as is, any other text is hashed (Java's String.hashCode), "name@32" also sets the size.
export interface SeedRequest { seed: number; size: number; }
const SEED_RANGE = 1000000000;   // seeds stay under a billion: the generator's hash loses precision on huge numbers

export function seedFromText(text: string): number {
  const clean = text.trim();
  if (clean.length > 0 && /^-?[0-9]+$/.test(clean)) return Math.abs(Number(clean)) % SEED_RANGE;
  let h = 0;
  for (let i = 0; i < clean.length; i++) h = (Math.imul(h, 31) + clean.charCodeAt(i)) | 0;
  return Math.abs(h) % SEED_RANGE;
}

export function randomSeed(): number { return 1 + Math.floor(Math.random() * (SEED_RANGE - 1)); }

/** "", "7916", "montagne", "foret@32": empty means a random seed. The size is kept in [MIN_SIZE, MAX_SIZE]. */
export function parseSeedRequest(text: string): SeedRequest {
  const at = text.lastIndexOf('@');
  const name = at >= 0 ? text.slice(0, at) : text;
  let size = DEFAULT_SIZE;
  if (at >= 0 && /^[0-9]+$/.test(text.slice(at + 1).trim())) size = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Number(text.slice(at + 1).trim())));
  return { seed: name.trim() === '' ? randomSeed() : seedFromText(name), size };
}
