import * as ui from 'zinc:ui';
import { puzzle } from '../../../examples/murdoku/src/state';
export function center(label: string): string {
 for (let i = 0; i < 3000; i++) {
  const node = ui.inspectNode(i);
  if (node !== null && node.label === label) {
   const box = ui.screenBox(i);
   return (box[0]+box[2]/2)+' '+(box[1]+box[3]/2);
  }
 }
 throw new Error('Missing control: '+label);
}
export function cellCenter(cell: number): string {
 return center('Case ligne '+(Math.floor(cell/puzzle().columns)+1)+' colonne '+(cell%puzzle().columns+1));
}
