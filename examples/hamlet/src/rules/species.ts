// The wild animals as data: one row per species, read by engine/deer.ts. A new species is a new row (and a model); `kind` picks its movement style.
// Distances are world units (a tile is 2), times are seconds, ages and cooldowns are village days (a day is DAY_SECONDS, a year 9 days).
export const KIND_GRAZER = 0, KIND_HOPPER = 1, KIND_BOAR = 2;
export class Species {
  id: string = ''; label: string = ''; kind: number = KIND_GRAZER;
  walk: number = 1; flee: number = 3.4;       // speeds: walking, running (trot is walk * trot)
  trot: number = 1.8;                         // catching up with the herd or the water: walk * trot
  turn: number = 3.2; accel: number = 2.5;    // heading change (radians per second) and speed change (units per second squared)
  alert: number = 7; fear: number = 4;        // a person within `alert` makes it freeze and look, within `fear` it runs
  start: number = 0;                          // how many on the 12 x 12 reference map at the start (the deer have their own constant)
  perArea: number = 9;                        // population cap on the 12 x 12 reference map (scaled by area)
  adultDays: number = 4; lifeDays: number = 50;   // grown at this age; dies of old age from lifeDays (+ up to a quarter more)
  breedSeasons: number[] = [0, 1];            // seasons of the year it breeds in (rules/season.ts)
  breedChance: number = .4; cooldownDays: number = 9; herdGap: number = 6;
  group: number = 8;                          // the most it gathers in one herd
  shy: number = 2;                            // keeps this many tiles from buildings unless it panics
  cover: number = 1;                          // how much it likes the edge of the trees (1: by day, -: open ground at dawn and dusk)
  homeR: number = 8;                          // tiles it wanders from its home
  drinkEvery: number = 70;                    // seconds of thirst before it walks to the water
  restEvery: number = 3;                      // a long rest after this many moves
}
function row(id: string, label: string): Species { const s = new Species(); s.id = id; s.label = label; return s; }
function rabbit(): Species {
  const s = row('rabbit', 'Lapin');
  s.kind = KIND_HOPPER; s.walk = 1.1; s.flee = 4.6; s.trot = 1.5; s.turn = 8; s.accel = 8; s.alert = 5; s.fear = 3; s.start = 4; s.perArea = 5;
  s.adultDays = 2; s.lifeDays = 22; s.breedSeasons = [0, 1, 2]; s.breedChance = .5; s.cooldownDays = 3; s.herdGap = 4; s.group = 3; s.shy = 2; s.cover = .6; s.homeR = 5;
  s.drinkEvery = 140; s.restEvery = 4;
  return s;
}
function boar(): Species {
  const s = row('boar', 'Sanglier');
  s.kind = KIND_BOAR; s.walk = 1.1; s.flee = 3.3; s.trot = 1.6; s.turn = 2.4; s.accel = 3; s.alert = 5; s.fear = 2.6; s.start = 2; s.perArea = 2;
  s.adultDays = 5; s.lifeDays = 45; s.breedSeasons = [0, 1]; s.breedChance = .3; s.cooldownDays = 9; s.herdGap = 5; s.group = 5; s.shy = 4; s.cover = 1.4; s.homeR = 9;
  s.drinkEvery = 90; s.restEvery = 2;
  return s;
}
export const SPECIES: Species[] = [row('deer', 'Cerf'), rabbit(), boar()];
export const SP_DEER = 0, SP_RABBIT = 1, SP_BOAR = 2;
