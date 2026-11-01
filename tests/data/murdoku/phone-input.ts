import '../../../examples/murdoku/src/main';
import { puzzle } from '../../../examples/murdoku/src/state';
import { center, cellCenter } from './geometry';
const p = puzzle(), cell = p.solution[p.castOrder[0]];
console.log('2 touch 1 '+cellCenter(cell)+'\n3 touchup 1\n6 touch 1 '+center('Placer A')+'\n7 touchup 1\n8 touch 1 '+center('Témoins')+'\n9 touchup 1\n10 key r\n12 key h\n14 key q');
