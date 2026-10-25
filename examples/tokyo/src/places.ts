// The points of interest of Shiba the panel flies to. Where each stands: Pocket Tokyo's areas/shiba.json (latitude, longitude), in the
// city's metres (x east, z south of Tokyo Tower: its projection, web/src/shared/geo.js). Where the eye looks from: Pocket's own stills
// (tools/listing.ts: the tower, Zojo-ji, Hamamatsucho), else 350 m beyond the place from the tower and 150 to 200 m up, so the tower
// stands behind it.

export class Place {
  constructor(public name: string, public x: number, public z: number, public eye: number[], public target: number[]) {}
}

export const PLACES: Place[] = [
  new Place('Tokyo Tower', 0, 0, [330, 150, 330], [0, 150, 0]),
  new Place('Zojo-ji', 251, 131, [560, 95, 260], [0, 120, -10]),
  new Place('Shiba Park', 305, 386, [522, 160, 659], [305, 20, 386]),
  new Place('Hamamatsucho', 1057, 342, [1320, 150, 660], [900, 10, 250]),
  new Place('Shiodome', 1319, -646, [1634, 200, -800], [1319, 60, -646]),
  new Place('Takeshiba pier', 1500, 453, [1836, 120, 555], [1500, 5, 453]),
  new Place('Shinbashi', 1165, -868, [1445, 180, -1078], [1165, 30, -868]),
];
