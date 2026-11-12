interface Props { onChange?: (values: string[]) => void; recent?: () => string[]; }
function choose(p: Props, item: string): void {
  if (p.onChange !== undefined) {
    const recent = p.recent !== undefined ? p.recent() : [];
    p.onChange([item].concat(recent.filter((value: string) => value !== item)).slice(0, 24));
  }
}
interface Sort { column: string; descending: boolean; }
interface Table { onSort?: (sort: Sort) => void; sort?: () => Sort; }
function sortColumn(p: Table): void {
  if (p.onSort === undefined) return;
  const previous = p.sort !== undefined ? p.sort() : { column: '', descending: false };
  p.onSort({ column: 'id', descending: !previous.descending });
}
interface Auto { count: () => number; autoAdvance?: number; }
function external(): boolean { return false; }
function schedule(p: Auto | null): number {
  if (p === null || p.count() < 2 || !(p.autoAdvance !== undefined && p.autoAdvance > 0) || external()) return 0;
  return Math.max(250, p.autoAdvance * 1000);
}
interface Card { id: string; disabled: boolean; }
interface BoardProps { onCardClick?: (id: string) => void; }
class Scope { phase: number = 0; props: BoardProps; constructor(props: BoardProps) { this.props = props; } }
interface Board { card: () => Card; scope: Scope; }
function click(p: Board): void {
  if (p.scope.phase === 0 && p.card().disabled !== true && p.scope.props.onCardClick !== undefined)
    p.scope.props.onCardClick(p.card().id);
}

function check(ok: boolean): void { if (!ok) throw new Error('guard flow'); }
let chosen = '';
choose({ onChange: (values: string[]): void => { chosen = values.join(','); }, recent: (): string[] => ['a', 'b'] }, 'a');
check(chosen === 'a,b');
let sorted = false;
sortColumn({ onSort: (value: Sort): void => { sorted = value.column === 'id' && value.descending; }, sort: (): Sort => ({ column: '', descending: false }) });
check(sorted);
check(schedule({ count: (): number => 2, autoAdvance: 1 }) === 1000 && schedule(null) === 0);
let clicked = '';
click({ card: (): Card => ({ id: 'a', disabled: false }), scope: new Scope({ onCardClick: (id: string): void => { clicked = id; } }) });
check(clicked === 'a');
interface Optional { value?: number; other: () => number; }
function dormant(p: Optional, flag: boolean): number {
  if (p.value === undefined) return 0;
  const later = flag ? (): void => { p.value = undefined; } : (): void => {};
  return p.value;
}
check(dormant({ value: 3, other: (): number => 1 }, true) === 3);
console.log('guard flow: pass');
