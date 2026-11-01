export const ROOM = 0, ROW = 1, COLUMN = 2, ON = 3, NEAR = 5, NOT_NEAR = 6, WALL = 7, WINDOW = 8, CORNER = 9, ALONE = 10, SAME_ROOM = 11, LEFT_OF = 12, ABOVE = 13, ROOM_COUNT = 14, FURNITURE_COUNT = 15, EVERY_ROOM = 16, DIFFERENT_ROOM = 17;
export class Clue { person = 0; kind = 0; value = 0; other = -1; text = ''; family = ''; variant = 0; exclusive = false; negative = false; }
export function fact(person: number, kind: number, value: number, text: string, other: number = -1): Clue {
 const c = new Clue(); c.person = person; c.kind = kind; c.value = value; c.other = other; c.text = text; return c;
}
export const NOT_ROOM = 19, NOT_ON = 20, NOT_WINDOW = 21, NOT_CORNER = 22, COMPANY = 23, RIGHT_OF = 24, BELOW = 25, EITHER_ROOM = 26, ROOM_WITH = 27, ROOM_WITHOUT = 28, ONLY_NEAR = 29, ONLY_ON = 30, EMPTY_ROOMS = 31, NEAR_COUNT = 32, POPULATION_ROOMS = 33;
export function relational(kind: number): boolean { return kind === SAME_ROOM || kind === DIFFERENT_ROOM || kind === LEFT_OF || kind === RIGHT_OF || kind === ABOVE || kind === BELOW; }
export function globalKind(kind: number): boolean { return kind === ROOM_COUNT || kind === FURNITURE_COUNT || kind === EVERY_ROOM || kind === EMPTY_ROOMS || kind === NEAR_COUNT || kind === POPULATION_ROOMS; }

export const ROW_WITH = 34, COLUMN_WITH = 35, NOT_ROW_WITH = 36, NOT_COLUMN_WITH = 37;
