import { For } from 'zinc:ui/solid';
import { compact, setMobileTab } from '../layout';
import { puzzle, selected, choosePerson, placements, draft, setDraft, toggleElimination, activeCell, eliminated, undo, verify, hint, message } from '../state';
import { personLetter } from '../puzzle';
import { witnessColor } from './LetterBadge';
import { ToolButton } from './ToolButton';
export function GameControls(): i32 {
 return <View className={compact() ? 'w-full p-2 gap-2 border-t border-[#cccccc] bg-[#f2f0f7] shrink-0' : 'w-[88] p-3 gap-3 items-center bg-[#f2f0f7] shrink-0'}>
  {compact() && <Text className="text-[11px] text-[#6e6e73] text-center" numberOfLines={2}>{message()}</Text>}
  {compact() && <View className="flex-row gap-2 justify-center"><For each={puzzle().castOrder}>{(a: number) => <Button aria-label={'Placer '+personLetter(puzzle(),a)} onClick={() => { choosePerson(a); setMobileTab('plan'); }} style={{ borderColor: witnessColor(a), backgroundColor: selected() === a ? witnessColor(a) : 0xffffff }} className={(selected() === a ? 'border-[3] ' : 'border ')+'min-w-[44] h-[44] rounded-[7] items-center justify-center'}><Text style={{ color: selected() === a ? 0xffffff : witnessColor(a) }} className="text-[14px] font-bold">{personLetter(puzzle(),a)+(placements()[a] >= 0 ? ' ✓' : '')}</Text></Button>}</For></View>}
  {!compact() && <Text className="self-start text-[11px] font-semibold text-[#191922]">Outils</Text>}
  <View className={compact() ? 'flex-row w-full gap-2' : 'gap-3'}>
   <ToolButton icon="x" label={activeCell() >= 0 && eliminated()[activeCell()] === 1 ? 'Rétablir' : 'Éliminer'} onClick={toggleElimination}/>
   <ToolButton icon="pencil" label={draft() ? 'Brouillon ✓' : 'Brouillon'} active={draft()} onClick={() => setDraft(!draft())}/>
   <ToolButton icon="undo-2" label="ANNULER" onClick={undo}/>
   <ToolButton icon="lightbulb" label="INDICE" onClick={() => { hint(); setMobileTab('aide'); }}/>
   <ToolButton icon="check" label="VALIDER" primary={true} onClick={verify}/>
  </View>
 </View>;
}
