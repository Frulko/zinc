export class Character { sex = 0; skin = 0; hair = 0; }
// Atlas recipes compose registered body, clothing and hair layers offline.
export function character(seed: number, person: number): Character {
 const c = new Character(); c.sex = person === 1 || person === 3 || person === 4 ? 0 : 1;
 const slot = c.sex === 0 ? (person === 1 ? 0 : person === 3 ? 1 : 2) : (person === 0 ? 0 : person === 2 ? 1 : 2);
 const base = Math.floor(((seed+1)*48271)%2147483647/4096)%16, tile = (base+slot*5)%16;
 c.skin = Math.floor(tile/4); c.hair = tile%4; return c;
}
export function characterSignature(c: Character): string { return c.sex+':'+c.skin+':'+c.hair; }
