// The investigation as an A4 sheet at 300 dpi, to play with a pencil: page 1 the plan and the testimonies, page 2 (the back) the solution and its reasoning.
// authoring/print_sheet.py captures both pages into a PDF.
import { onFrame, clear, rect, rrect, polygon, setTransform, loadFont, drawText, textWidth, lineHeight } from 'zinc:gfx';
import { env } from 'zinc:sys';
import { generate, room, occupiable, labelRun, personLetter, Puzzle } from './puzzle';
import { letterColor } from './characters';
import { drawPlan } from './components/plan';
import { paragraph, portrait, wrap } from './paper';

const W = 2480, H = 3508, M = 142, K: u32 = 0x000000, WHITE: u32 = 0xffffff, GREY: u32 = 0x8a8a8a;
const LEVELS = ['Découverte','Enquête','Expert'];
const seed = parseInt(env('MURDOKU_SEED') || '7919'), level = parseInt(env('MURDOKU_LEVEL') || '0'), mono = env('MURDOKU_MONO') === '1';
const p: Puzzle = generate(seed,level);
const title = loadFont('Caveat.ttf',190), name = loadFont('sans-bold',48), body = loadFont('sans',40), small = loadFont('sans',32), label = loadFont('sans-bold',28), step = loadFont('sans',29), stepBold = loadFont('sans-bold',29);

function centered(f: i32, s: string, y: number): void { drawText(f,(W-textWidth(f,s,0))/2,y,s,K,255,0); }
function badge(a: number, x: number, y: number, size: number): void {
 const letter = personLetter(p,a), f = size > 60 ? name : label;
 rrect(x,y,size,size,size/6,mono ? K : letterColor(letter),255);
 drawText(f,x+(size-textWidth(f,letter,0))/2,y+(size-lineHeight(f))/2,letter,WHITE,255,0);
}
/** The plan with its coordinates and room names, `cell` pixels to a square; returns the y under it. */
function plan(top: number, cell: number, labels: boolean): number {
 const x0 = Math.floor((W-cell*p.columns)/2), y0 = top+50;
 for (let x = 0; x < p.columns; x++) drawText(small,x0+x*cell+cell/2-9,top,String(x+1),K,255,0);
 for (let r = 0; r < p.rows; r++) drawText(small,x0-50,y0+r*cell+cell/2-20,String(r+1),K,255,0);
 setTransform(cell/80,0,0,cell/80,x0,y0); drawPlan(p,mono,0,'print-',70); setTransform(1,0,0,1,0,0);
 for (let c = 0; c < p.columns*p.rows; c++) if (room(p,c) >= 0 && !occupiable(p,c)) {
  const x = x0+(c%p.columns+1)*cell-26, y = y0+Math.floor(c/p.columns)*cell+26;
  polygon([x,y-12,x+12,y,x,y+12,x-12,y],K,255);
 }
 if (labels) for (let r = 0; r < 4; r++) {
  const run = labelRun(p,r), text = p.roomNames[r].toUpperCase(), tw = textWidth(label,text,0);
  const x = x0+(run[0]%p.columns)*cell+(run[1]*cell-tw)/2, y = y0+(Math.floor(run[0]/p.columns)+1)*cell-58;
  rrect(x-16,y-5,tw+32,46,23,K,255); rrect(x-13,y-2,tw+26,40,20,WHITE,255);
  drawText(label,x,y+1,text,K,255,0);
 }
 return y0+p.rows*cell;
}
const CARD = (W-2*M-50)/2, PICTURE = 190;
function cardHeight(a: number): number {
 let lines = 0;
 for (const c of p.clues) if (c.person === a) lines += wrap(body,c.text,CARD-PICTURE-40).length;
 return Math.max(PICTURE+20,76+lines*lineHeight(body)+16);
}
function card(a: number, x: number, y: number): void {
 portrait(p,a,x,y,PICTURE,mono,'print-');
 const tx = x+PICTURE+20;
 badge(a,tx,y,60);
 drawText(name,tx+74,y+2,p.personNames[a],K,255,0);
 let ty = y+76;
 if (a === p.victim) { drawText(body,tx,ty,'La victime. Plus un mot.',K,255,0); return; }
 for (const c of p.clues) if (c.person === a) ty = paragraph(body,c.text,tx,ty,x+CARD);
}
function page1(): void {
 let y = 70;
 centered(title,'Minuit au manoir',y); y += lineHeight(title)+6;
 centered(small,'ENQUÊTE N° '+seed+'  ·  '+LEVELS[level].toUpperCase(),y); y += 70;
 y = plan(y,Math.min(236,Math.floor((W-2*M-100)/p.columns)),true)+40;
 y = paragraph(small,'Placez les six personnes : une seule par ligne et par colonne. Personne sur les décors marqués ◆. Le meurtrier est la seule personne dans la pièce de la victime.',M,y,W-M)+24;
 const globals = p.clues.filter((c) => c.person < 0);
 for (const c of globals) y = paragraph(body,c.text,M,y,W-M);
 rect(M,y+10,W-2*M,3,GREY); y += 40;
 const cast = p.castOrder;
 for (let i = 0; i < cast.length; i += 2) {
  card(cast[i],M,y); card(cast[i+1],M+CARD+50,y);
  y += Math.max(cardHeight(cast[i]),cardHeight(cast[i+1]))+24;
 }
 if (y > H-60) throw new Error('page 1 overflows A4: '+y);
}
function page2(): void {
 let y = 90;
 centered(name,'Solution de l’enquête n° '+seed,y); y += 80;
 const cell = 150, bottom = plan(y,cell,false), x0 = Math.floor((W-cell*p.columns)/2), y0 = y+50;
 for (const a of p.castOrder) {
  const c = p.solution[a], x = x0+c%p.columns*cell, yy = y0+Math.floor(c/p.columns)*cell;
  portrait(p,a,x+18,yy+10,cell-36,mono,'print-'); badge(a,x+6,yy+6,44);
 }
 y = bottom+40;
 centered(name,'Coupable : '+p.personNames[p.killer]+', dans la même pièce que '+p.personNames[p.victim]+'.',y); y += 90;
 rect(M,y,W-2*M,3,GREY); y += 24;
 // The reasoning the solver followed, in two columns; a step that places someone in bold.
 const gap = 50, width = (W-2*M-gap)/2; let x = M; const top = y;
 for (const s of p.walkthrough) {
  const f = s.cell >= 0 ? stepBold : step, lines = wrap(f,s.reason,width), height = lines.length*lineHeight(f)+8;
  if (y+height > H-M) { if (x > M) throw new Error('the reasoning overflows page 2'); x = M+width+gap; y = top; }
  y = paragraph(f,s.reason,x,y,x+width)+8;
 }
}
let frame = 0;
onFrame((_dt: number) => { frame++; clear(WHITE); if (frame <= 2) page1(); else page2(); });
