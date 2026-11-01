import { Puzzle, N, domains, feasible, compatible } from './model';
function available(p: Puzzle, placed: number[], a: number, cell: number, rows: number, cols: number): boolean {
 if ((rows & (1 << Math.floor(cell/p.columns))) || (cols & (1 << (cell%p.columns)))) return false;
 for (let b = 0; b < N; b++) if (placed[b] >= 0 && !compatible(p,a,cell,b,placed[b])) return false;
 return true;
}
function search(p: Puzzle, ds: number[][], placed: number[], rows: number, cols: number, depth: number, found: number[][]): void {
 if (found.length >= 2 || !feasible(p,placed,depth)) return;
 if (depth === N) { found.push(placed.slice()); return; }
 let who = -1, best = p.columns*p.rows+1;
 for (let a = 0; a < N; a++) if (placed[a] < 0) {
  let count = 0; for (const cell of ds[a]) if (available(p,placed,a,cell,rows,cols)) count++;
  if (count < best) { best = count; who = a; }
 }
 if (best === 0) return;
 for (const cell of ds[who]) if (available(p,placed,who,cell,rows,cols)) {
  placed[who] = cell;
  search(p,ds,placed,rows | (1 << Math.floor(cell/p.columns)),cols | (1 << (cell%p.columns)),depth+1,found);
  placed[who] = -1; if (found.length >= 2) return;
 }
}
export function solve(p: Puzzle): number[][] { const found: number[][] = []; search(p,domains(p),[-1,-1,-1,-1,-1,-1],0,0,0,found); return found; }
export function solutions(p: Puzzle): number { return solve(p).length; }
