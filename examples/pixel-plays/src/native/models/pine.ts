import { Color, capsule, sphere, hash, castShadow } from '../renderer';

export function pine(x: number, y: number, height: number, green: Color, snow: boolean, seed: number): void {
  const bark: Color = [109, 86, 63];
  capsule([x,y,0],[x+.08,y,height],.16,.04,():Color=>bark,'rough');
  for (let layer = 0; layer < 6; layer++) {
    const z = 1.2 + layer * height * .125;
    const radius = (height - z) * .31;
    const count = 14 + layer * 2;
    for (let k = 0; k < count; k++) {
      const angle = k * Math.PI * 2 / count + layer * .4;
      const distance = radius * (.55 + hash(k + seed, layer) * .45);
      const px = x + Math.cos(angle) * distance, py = y + Math.sin(angle) * distance;
      sphere(px, py, z - distance * .2, .28 + radius * .16, green, 'rough');
      if (snow && k % 3 !== 0) sphere(px,py,z-distance*.2+.18,.24+radius*.12,[220,228,216],'rough');
    }
  }
  sphere(x,y,height-.35,.42, snow ? [228,233,218] : green,'rough');
  for (let z = 1; z < height; z += .4) castShadow(x,y,z,.7);
}
