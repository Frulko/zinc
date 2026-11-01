import { For } from 'zinc:ui/solid';
import { clueSummary } from '../hint-summary';
import { Clue, relational } from '../clues';
import { personName, personLetter } from '../puzzle';
import { puzzle, placements, selected, choosePerson, accuse } from '../state';
import { compact, witnessWidth, setMobileTab } from '../layout';
import { Rich } from './Rich';
import { Portrait } from './Portrait';
import { LetterBadge, witnessColor, witnessTint } from './LetterBadge';
export function WitnessList(): i32 {
 return <View style={{ width: witnessWidth() }} className="gap-2 shrink-0 pb-3">
  <View className="flex-row items-center"><Text className="grow text-[14px] font-bold text-[#191922]">SUSPECTS</Text><Text className="text-[11px] text-[#777a82]">{placements().filter((c: number) => c >= 0).length+' / 6 placés'}</Text></View>
  <For each={[0,2,4]}>{(row: number) => <View className="flex-row gap-2 items-stretch"><For each={puzzle().castOrder.slice(row,row+2)}>{(a: number) => compact() ? <Button onClick={() => { choosePerson(a); setMobileTab('plan'); }} aria-label={personName(puzzle(),a)+(placements()[a] >= 0 ? ', déjà placé' : ', à placer')} style={{ width: (witnessWidth()-8)/2, borderColor: selected() === a ? witnessColor(a) : 0x191922, backgroundColor: witnessTint(a), shadowColor: witnessColor(a), shadowOpacity: selected() === a ? 0.55 : 0, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }} className={(selected() === a ? "scale-[1.03] " : "scale-100 ")+"border-[3] transition-transform duration-200 rounded-[10] overflow-hidden flex-row items-stretch justify-start p-0 gap-0"}>
   <View style={{ opacity: selected() === a ? 0 : 0.58 }} className="absolute inset-0 rounded-[10] bg-[#f2f0f7] pointer-events-none z-20 transition-opacity duration-200"/><View style={{ backgroundColor: witnessColor(a) }} className="w-[6]"/>
   <View className="grow min-w-0 p-2 gap-1"><View className="flex-row items-center gap-1"><Text style={{ color: witnessColor(a) }} className="text-[20px] font-bold">{personLetter(puzzle(),a)}</Text><Text className="text-[22px] font-bold font-[Caveat] text-[#000000]">{personName(puzzle(),a)+(placements()[a] >= 0 ? ' ✓' : '')}</Text></View>
    <For each={puzzle().clues.filter((c: Clue) => c.person === a)}>{(c: Clue) => <View className="flex-row items-center gap-1"><Rich text={clueSummary(puzzle(),c)} width={(witnessWidth()-8)/2-28} other={relational(c.kind) ? c.other : -1} className="text-[12px] text-[#191922]"/></View>}</For>
    {a === puzzle().victim && <Rich text="**La victime.** Seul le meurtrier partageait sa pièce." width={(witnessWidth()-8)/2-28} other={-1} className="text-[12px] text-[#191922]"/>}
   </View>
  </Button> : <View style={{ width: (witnessWidth()-8)/2 }} className="items-stretch">
   <View style={{ opacity: selected() === a ? 0 : 0.58 }} className="absolute inset-0 rounded-[10] bg-[#f2f0f7] pointer-events-none z-20 transition-opacity duration-200"/>
   <View className="items-center z-10"><Button onClick={() => { choosePerson(a); if (compact()) setMobileTab('plan'); }} aria-label={personName(puzzle(),a)+(placements()[a] >= 0 ? ', déjà placé' : ', à placer')} style={{ borderColor: selected() === a ? witnessColor(a) : 0x191922, shadowColor: witnessColor(a), shadowOpacity: selected() === a ? 0.55 : 0, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }} className={(selected() === a ? '-translate-y-[4] scale-105 ' : '')+'transition-transform duration-200 border-[4] shadow-md p-[5] pb-0 rounded-[6] bg-[#ffffff] items-center gap-0'}>
    <View><Portrait person={a} size={compact() ? 72 : 76}/><View className="absolute top-[3] left-[3]"><LetterBadge person={a}/></View>{placements()[a] >= 0 && <View className="absolute bottom-[3] right-[3] w-[20] h-[20] rounded-full bg-[#40815c] items-center justify-center"><Text className="text-[12px] font-bold text-[#ffffff]">✓</Text></View>}</View>
    <View className="h-[30] items-center justify-center"><Text className="text-[24px] font-bold font-[Caveat] text-[#000000]">{personName(puzzle(),a)}</Text></View>
   </Button></View>
   <View style={{ backgroundColor: witnessTint(a), borderColor: a === puzzle().victim || selected() === a ? witnessColor(a) : 0x191922 }} className="-mt-[12] pt-[22] px-2 pb-2 rounded-[10] border-[2] border-[#191922] gap-1 grow justify-center shadow-md">
    <For each={puzzle().clues.filter((c: Clue) => c.person === a)}>{(c: Clue) => <View className="flex-row items-center justify-center gap-1"><Rich text={clueSummary(puzzle(),c)} width={(witnessWidth()-8)/2-20} other={relational(c.kind) ? c.other : -1} className="text-[12px] text-[#191922] text-center"/></View>}</For>
    {a === puzzle().victim && <Rich text="**La victime.** Seul le meurtrier partageait sa pièce." width={(witnessWidth()-8)/2-20} other={-1} className="text-[12px] text-[#191922] text-center"/>}
   </View></View>}</For></View>}</For>
  <Button onClick={accuse} className="h-[44] bg-[#ffffff] rounded-[10] border-[2] border-[#191922] items-center justify-center"><Text className="text-[#303139] text-[12px] font-semibold">Accuser la personne choisie</Text></Button>
 </View>;
}
