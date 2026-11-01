import { For } from 'zinc:ui/solid';
import { Clue, relational } from '../clues';
import { clueSummary, plain } from '../hint-summary';
import { compact, setMobileTab } from '../layout';
import { puzzle, freshAsync, busy, hint, hints, hintPerson, hintCell, hintRule, hintDependencies, hintError, message } from '../state';
import { LetterBadge } from './LetterBadge';
const levels = ['Découverte','Enquête','Expert'];
export function HelpPanel(): i32 {
 return <View className="w-full gap-3">
  <Text className="text-[11px] text-[#8e8e93]">Aide</Text>
  <View className="flex-row p-[2] gap-1 rounded-[8] bg-[#e9e9ee]"><For each={levels}>{(label: string, i: number) => <Button disabled={busy()} onClick={() => { freshAsync(i, () => setMobileTab('plan')); }} className={'grow px-2 h-[40] rounded-[4] justify-center '+(puzzle().level === i ? 'bg-[#ffffff] shadow-sm' : 'bg-transparent')}><Text className={'text-[11px] '+(puzzle().level === i ? 'font-semibold text-[#1d1d1f]' : 'text-[#6e6e73]')}>{label}</Text></Button>}</For></View>
  <For each={puzzle().clues.filter((c: Clue) => c.person < 0)}>{(c: Clue) => <View className="p-3 bg-[#eef5ff] border-l-[3] border-[#007aff]"><Text className="text-[10px] text-[#007aff]">Indice de la scène</Text><Text className="text-[13px] text-[#3a3a3c]">{c.text}</Text></View>}</For>
  <Button onClick={hint} className="h-[44] border border-[#d1d1d6] rounded-[5] items-center justify-center"><Text className="text-[13px] text-[#007aff]">{'Coup de pouce'+(compact() ? '' : ' · H')}</Text></Button>
  {hintPerson() >= 0 && <View className="p-3 gap-3 rounded-[8] bg-[#ffffff] border border-[#e5e5ea]">
   <View className="flex-row items-center gap-2"><LetterBadge person={hintPerson()}/><Text className="text-[13px] font-bold text-[#1d1d1f]">{hintError() ? 'À revoir' : 'Case déduite'}</Text><View className="grow"/><Text className="text-[14px] font-bold text-[#1d1d1f]">{'L'+(Math.floor(hintCell()/puzzle().columns)+1)+' · C'+(hintCell()%puzzle().columns+1)}</Text></View>
   <For each={puzzle().clues.filter((c: Clue) => (c.person === hintPerson() || (relational(c.kind) && c.other === hintPerson())))}>{(c: Clue) => <View className="flex-row items-center gap-2"><LetterBadge person={c.person}/><Text className="grow basis-0 min-w-0 text-[13px] text-[#1d1d1f]">{plain(clueSummary(puzzle(),c))}</Text>{relational(c.kind) && <LetterBadge person={c.other}/>}</View>}</For>
   {hintDependencies().length > 0 && <View className="gap-2"><Text className="text-[11px] text-[#6e6e73]">Personnes utilisées :</Text><View className="flex-row flex-wrap gap-2"><For each={hintDependencies()}>{(a: number) => <LetterBadge person={a}/>}</For></View></View>}
   <Text className="text-[12px] text-[#6e6e73]">{hintError() ? (hintRule() === 'wrong-exclusion' ? 'Rétablissez cette case avant de poursuivre.' : 'Retirez ce placement avant de poursuivre.') : hintRule() === 'line-group' ? 'Ces personnes réservent leurs lignes ou colonnes. Les autres doivent se placer ailleurs.' : hintRule() === 'testimony' ? 'Ces indices se recoupent sur une seule case.' : hintRule() === 'count' ? 'Le nombre d’occupants impose cette case.' : 'Les autres positions sont exclues par les lignes, les colonnes et les indices.'}</Text>
  </View>}
  <Text className="text-[12px] text-[#6e6e73]">{message()}</Text>
  <Text className="text-[11px] text-[#8e8e93]">Case → lettre. Maj + lettre : brouillon. X : éliminer. Suppr : vider. Ctrl/Cmd + Z : annuler.</Text>
 </View>;
}
