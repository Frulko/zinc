import '../../../examples/murdoku/src/main';
import { puzzle } from '../../../examples/murdoku/src/state';
import { personLetter } from '../../../examples/murdoku/src/puzzle';
import { center, cellCenter } from './geometry';
const p = puzzle(), a = p.victim, b = (a+1)%6;
console.log('2 move '+cellCenter(p.solution[a])+'\n3 down\n4 up\n6 key v\n8 move '+cellCenter(p.solution[b])+'\n9 down\n10 up\n12 key '+personLetter(p,b).toLowerCase()+' shift\n14 key h\n16 key x\n18 key q\n20 move '+center('Éliminer')+'\n21 down\n22 up\n24 key w');
