// The investigation as a till receipt: 576 dots wide (80 mm paper at 203 dpi), black on white, drawn for a pen. authoring/print_ticket.py captures it and sends it to the printer.
import { onFrame, clear, rect, setTransform, image, imageWidth, imageHeight, drawImageRect, loadFont, drawText, textWidth, lineHeight } from 'zinc:gfx';
import { env } from 'zinc:sys';
import { generate, room, occupiable, labelRun, personLetter, Puzzle, EMPTY } from './puzzle';
import { neighbors } from './architecture';

const W = 576, M = 8, K: u32 = 0x000000, WHITE: u32 = 0xffffff;
const LEVELS = ['Découverte','Enquête','Expert'];
const seed = parseInt(env('MURDOKU_SEED') || '7919'), level = parseInt(env('MURDOKU_LEVEL') || '0');
const p: Puzzle = generate(seed,level);
const title = loadFont('Caveat.ttf',64), body = loadFont('sans',24), small = loadFont('sans',18), bold = loadFont('sans-bold',26);
const objects = image('ink-objects.png'), cast = [image('ink-cast-man.png'),image('ink-cast-woman.png')];

function centered(f: i32, s: string, y: number): void { drawText(f,(W-textWidth(f,s,0))/2,y,s,K,255,0); }
function rule(y: number): void { for (let x = M; x < W-M; x += 12) rect(x,y,7,2,K); }
function wrap(f: i32, s: string, width: number): string[] {
 const lines: string[] = []; let line = '';
 for (const word of s.replace('« ','«\u00a0').replace(' »','\u00a0»').split(' ')) {
  const next = line === '' ? word : line+' '+word;
  if (textWidth(f,next,0) > width && line !== '') { lines.push(line); line = word; } else line = next;
 }
 if (line !== '') lines.push(line);
 return lines;
}
function paragraph(f: i32, s: string, x: number, y: number): number {
 for (const l of wrap(f,s,W-M-x)) { drawText(f,x,y,l,K,255,0); y += lineHeight(f); }
 return y;
}
function portrait(a: number, x: number, y: number, size: number): void {
 const c = p.characters[a], atlas = cast[c.sex], sw = imageWidth(atlas)/4, sh = imageHeight(atlas)/4;
 drawImageRect(atlas,c.hair*sw,c.skin*sh,sw,sh,x,y,size,size,255);
}
function plan(y: number): number {
 const cell = Math.min(84,Math.floor((W-2*M-24)/p.columns)), x0 = Math.floor((W-cell*p.columns+24)/2);
 for (let x = 0; x < p.columns; x++) drawText(small,x0+x*cell+cell/2-5,y,String(x+1),K,255,0);
 for (let r = 0; r < p.rows; r++) drawText(small,x0-24,y+24+r*cell+cell/2-11,String(r+1),K,255,0);
 const y0 = y+24;
 for (let c = 0; c < p.columns*p.rows; c++) {
  if (room(p,c) < 0) continue;
  const x = x0+c%p.columns*cell, yy = y0+Math.floor(c/p.columns)*cell, d = p.decor[c];
  rect(x,yy,cell,1,K); rect(x,yy,1,cell,K); rect(x+cell-1,yy,1,cell,K); rect(x,yy+cell-1,cell,1,K);
  if (d !== EMPTY) drawImageRect(objects,(d%6)*192,Math.floor(d/6)*192,192,192,x+3,yy+3,cell-6,cell-6,255);
  if (!occupiable(p,c)) rect(x+cell-11,yy+3,8,8,K);   // solid decor: nobody stands here
 }
 for (let c = 0; c < p.columns*p.rows; c++) {
  const r = room(p,c); if (r < 0) continue;
  const x = x0+c%p.columns*cell, yy = y0+Math.floor(c/p.columns)*cell, ns = neighbors(p,c);
  for (let s = 0; s < 4; s++) if (room(p,ns[s]) !== r && (ns[s] < 0 || room(p,ns[s]) < 0 || c < ns[s])) {
   const vertical = s === 1 || s === 3, wx = x+(s === 1 ? cell : 0), wy = yy+(s === 2 ? cell : 0);
   if (vertical) rect(wx-3,wy-3,6,cell+6,K); else rect(wx-3,wy-3,cell+6,6,K);
   if ((p.windows[c] & (1 << s)) !== 0) {
    const a = Math.floor(cell/4);
    if (vertical) { rect(wx-5,wy+a,10,cell-2*a,K); rect(wx-3,wy+a+2,6,cell-2*a-4,WHITE); }
    else { rect(wx+a,wy-5,cell-2*a,10,K); rect(wx+a+2,wy-3,cell-2*a-4,6,WHITE); }
   }
  }
 }
 for (let r = 0; r < 4; r++) {
  const run = labelRun(p,r), name = p.roomNames[r].toUpperCase(), tw = textWidth(small,name,0);
  const x = x0+(run[0]%p.columns)*cell+(run[1]*cell-tw)/2, yy = y0+(Math.floor(run[0]/p.columns)+1)*cell-26;
  rect(x-4,yy,tw+8,22,WHITE); drawText(small,x,yy,name,K,255,0);
 }
 return y0+p.rows*cell;
}
function draw(): void {
 clear(WHITE);
 let y = 6;
 centered(title,'Minuit au manoir',y); y += lineHeight(title);
 centered(small,'REÇU D’ENQUÊTE N° '+seed+' · '+LEVELS[level].toUpperCase(),y); y += 30; rule(y); y += 12;
 y = plan(y)+10;
 y = paragraph(small,'■ décor plein : personne dessus. Une personne par ligne et par colonne. Le meurtrier est seul avec la victime dans sa pièce.',M,y)+8;
 rule(y); y += 12;
 for (const a of p.castOrder) if (a !== p.victim) {
  portrait(a,M,y,84);
  rect(M+96,y,34,34,K); drawText(bold,M+105,y+1,personLetter(p,a),WHITE,255,0);
  drawText(bold,M+140,y+1,p.personNames[a],K,255,0);
  let bottom = y+40;
  for (const c of p.clues) if (c.person === a) bottom = paragraph(body,c.text,M+96,bottom);
  y = Math.max(bottom,y+84)+14;
 }
 const globals = p.clues.filter((c) => c.person < 0);
 if (globals.length > 0) { rule(y); y += 10; for (const c of globals) y = paragraph(body,c.text,M,y); y += 8; }
 rule(y); y += 12;
 portrait(p.victim,M,y,84); rect(M+96,y,34,34,K); drawText(bold,M+105,y+1,'V',WHITE,255,0);
 drawText(bold,M+140,y+1,p.personNames[p.victim],K,255,0); drawText(body,M+96,y+42,'La victime. Plus un mot.',K,255,0); y += 96;
 rule(y); y += 10;
 drawText(body,M,y,'TOTAL',K,255,0); const t = '1 meurtre'; drawText(bold,W-M-textWidth(bold,t,0),y,t,K,255,0); y += 32;
 drawText(body,M,y,'Coupable',K,255,0); const q = '? ? ?'; drawText(bold,W-M-textWidth(bold,q,0),y,q,K,255,0); y += 40;
 centered(small,'Merci de ne pas quitter le manoir.',y); y += 40;
 rule(y); y += 8; centered(small,'solution (ligne-colonne), à plier',y); y += 34;
 // The solution upside down, so it does not catch the eye while playing.
 const lines = ['Coupable : '+p.personNames[p.killer]];
 let places = ''; for (const a of p.castOrder) places += personLetter(p,a)+' '+(Math.floor(p.solution[a]/p.columns)+1)+'-'+(p.solution[a]%p.columns+1)+'   ';
 lines.push(places.trim());
 setTransform(-1,0,0,-1,W,2*y+lines.length*30);
 for (let i = 0; i < lines.length; i++) drawText(body,M,y+i*30,lines[i],K,255,0);
 setTransform(1,0,0,1,0,0);
}
onFrame((_dt: number) => { draw(); });
