export class Character { sex = 0; skin = 0; hair = 0; }
// Atlas recipes compose registered body, clothing and hair layers offline.
export function character(seed: number, person: number): Character {
 const c = new Character(); c.sex = person === 1 || person === 3 || person === 4 ? 0 : 1;
 const slot = c.sex === 0 ? (person === 1 ? 0 : person === 3 ? 1 : 2) : (person === 0 ? 0 : person === 2 ? 1 : 2);
 const base = Math.floor(((seed+1)*48271)%2147483647/4096)%16, tile = (base+slot*5)%16;
 c.skin = Math.floor(tile/4); c.hair = tile%4; return c;
}
export function characterSignature(c: Character): string { return c.sex+':'+c.skin+':'+c.hair; }
/** The stable colour of a witness's letter, the victim's in red. */
export function letterColor(letter: string): i32 { return [0xa95e4b,0x40815c,0x3e929d,0x667db8,0x9978a5,0xc0392b][letter === 'V' ? 5 : letter.charCodeAt(0)-65]; }
