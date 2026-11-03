import { cellSize, boardWidth } from '../layout';
import { Cell } from './Cell';
import { drawManor, MANOR_BLEED } from './Manor';
import { For } from 'zinc:ui/solid';
import { puzzle } from '../state';
import { room, labelRun } from '../puzzle';
import { INK } from '../skin';
import { penDraw } from '../pen';
const rows = [0,1,2,3,4,5];
const columns = [0,1,2,3,4,5,6,7];
export function Board(): i32 {
 return <View style={{ width: boardWidth() }} className="p-[16] shrink-0">
  <Canvas aria-label="Plan du manoir" style={{ lazy: 1, left: 16-MANOR_BLEED, top: 16-MANOR_BLEED, width: cellSize()*puzzle().columns+2*MANOR_BLEED, height: cellSize()*puzzle().rows+2*MANOR_BLEED }} className="absolute" onDraw={drawManor} />
  <For each={columns.slice(0,puzzle().columns)}>{(x: number) => <View className="absolute items-center" style={{ left: 16+x*cellSize(), top: -6, width: cellSize() }}><Text className="text-[10px] text-[#777a82]">{x+1}</Text></View>}</For>
  <For each={rows}>{(y: number) => <View className="absolute justify-center" style={{ left: 0, top: 16+y*cellSize(), height: cellSize() }}><Text className="text-[10px] text-[#777a82]">{y+1}</Text></View>}</For>
  <For each={rows}>{(y: number) => <View className="flex-row"><For each={columns.slice(0,puzzle().columns)}>{(x: number) => room(puzzle(),y*puzzle().columns+x) >= 0 ? <Cell cell={y*puzzle().columns+x} /> : <View style={{ width: cellSize(), height: cellSize() }} />}</For></View>}</For>
  <For each={[0,1,2,3]}>{(r: number) => {
   const run = labelRun(puzzle(),r);
   return <View className="absolute pointer-events-none items-center" style={{ left: 16+(run[0]%puzzle().columns)*cellSize(), top: 16+(Math.floor(run[0]/puzzle().columns)+1)*cellSize()-26, width: run[1]*cellSize() }}><View className="px-3 py-[1] rounded-full bg-[#ffffff] border-[2] border-[#191922]"><Text className="text-[13px] font-black text-[#000000] whitespace-nowrap">{puzzle().roomNames[r].toUpperCase()}</Text></View></View>;
  }}</For>
  {INK && <Canvas aria-label="Écriture au stylet" style={{ left: 16, top: 16, width: cellSize()*puzzle().columns, height: cellSize()*puzzle().rows }} className="absolute pointer-events-none" onDraw={penDraw} />}
 </View>;
}
