// The wild animals as data: one row per species, read by engine/deer.ts. A new species is a new row (and a model); the behaviour stays the same state machine.
// Distances are world units (a tile is 2), times are seconds, ages and cooldowns are village days (a day is DAY_SECONDS, a year 9 days).
export class Species {
  id: string = ''; label: string = '';
  walk: number = 1; flee: number = 3.4;       // speeds
  alert: number = 7; fear: number = 4;        // a person within `alert` makes it freeze and look, within `fear` it runs
  perArea: number = 9;                        // population cap on the 12 x 12 reference map (scaled by area)
  adultDays: number = 4; lifeDays: number = 50;   // grown at this age; dies of old age from lifeDays (+ up to a quarter more)
  breedSeasons: number[] = [0, 1];            // seasons of the year it breeds in (rules/season.ts)
  breedChance: number = .4; cooldownDays: number = 9; herdGap: number = 6;
  drinkEvery: number = 70;                    // seconds of thirst before it walks to the water
  restEvery: number = 3;                      // a long rest after this many moves
}
function row(id: string, label: string): Species { const s = new Species(); s.id = id; s.label = label; return s; }
export const SPECIES: Species[] = [row('deer', 'Cerf')];
export const SP_DEER = 0;
