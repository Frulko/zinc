import { cellSize } from '../layout';
import { Portrait } from './Portrait';
import { puzzle, placements, notes, activeCell, selectCell, blocked, automaticallyBlocked, eliminated } from '../state';
import { personLetter, occupiable } from '../puzzle';
export function Cell(props: { cell: number }): i32 {
  const noteText = (): string => { let s = ''; for (let a = 0; a < 6; a++) if (notes()[props.cell] & (1 << a)) s += personLetter(puzzle(),a) + ' '; return s; };
  const occupant = (): number => placements().indexOf(props.cell);
  return <Button aria-label={'Case ligne ' + (Math.floor(props.cell / puzzle().columns) + 1) + ' colonne ' + (props.cell % puzzle().columns + 1) + (eliminated()[props.cell] === 1 ? ' · éliminée manuellement, X pour rétablir' : '')} disabled={automaticallyBlocked(props.cell)} onClick={() => selectCell(props.cell)} style={{ width: cellSize(), height: cellSize() }} className={'outline-none items-center justify-center ' + (activeCell() === props.cell ? 'bg-[#ffe278]/50 border-[3] border-[#d4a000]' : blocked(props.cell) ? 'bg-[#242529]/15' : 'bg-transparent')}>
    {occupant() >= 0 && <Portrait person={occupant()} size={Math.min(50,cellSize()-12)} />}
    {blocked(props.cell) && occupiable(puzzle(),props.cell) && <Text className={eliminated()[props.cell] === 1 ? "absolute text-[30px] font-bold text-[#963e48]" : "absolute text-[26px] text-[#766e61]"}>×</Text>}
    {!occupiable(puzzle(),props.cell) && <Text className="absolute bottom-[3] right-[4] text-[10px] text-[#565b5a]">◆</Text>}
    <Text className="absolute bottom-[2] text-[14px] font-bold text-[#7c3037]">{blocked(props.cell) ? '' : noteText()}</Text>
    {occupant() >= 0 && <View className="absolute top-[3] right-[3] w-[20] h-[20] rounded-full bg-[#007aff] items-center justify-center"><Text className="text-[12px] font-bold text-[#fff8e8]">{personLetter(puzzle(),occupant())}</Text></View>}
  </Button>;
}
