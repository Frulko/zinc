// The e-ink layout (owner feedback on the Paper Pro, 2026-11-01): one screen, nothing scrolls. Landscape (1080x810): the plan on the left with the clue,
// the suspect letters and the tools under it, the six testimonies in a column on the right. Portrait (810x1080): plan on top, tools, then the testimonies
// in two columns. Targets are 48 px or more, a state is a filled (inverted) or a thick-bordered box, never a tint or an opacity. Only used when INK.
import { quit } from 'zinc:gfx';
import { QUILL } from '../pen';
import { For } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { Clue, relational } from '../clues';
import { clueSummary } from '../hint-summary';
import { personName, personLetter } from '../puzzle';
import { puzzle, placements, selected, choosePerson, accuse, draft, setDraft, toggleElimination, activeCell, eliminated, undo, verify, hint, message, busy, freshAsync } from '../state';
import { mobileTab, setMobileTab, inkWide, viewport, INK_SIDE } from '../layout';
import { Board } from './Board';
import { HelpPanel } from './HelpPanel';
import { Rich } from './Rich';
import { Portrait } from './Portrait';
import { COLOUR_PANEL, colour, setColour } from '../skin';
function Tool(props: { icon: string; label: string; onClick: () => void; on?: boolean; primary?: boolean }): i32 {
 return <Button onClick={props.onClick} aria-label={props.label} className={'grow basis-0 min-w-0 h-[60] rounded-[8] gap-[2] items-center justify-center '+(props.on ? 'bg-black border-[3] border-black' : props.primary ? 'bg-white border-[7] border-black' : 'bg-white border-[3] border-black')}>
  <Icon name={props.icon} size={22} strokeWidth={2.5} color={() => props.on ? 0xffffff : 0x000000}/>
  <Text className={'text-[11px] font-bold '+(props.on ? 'text-white' : 'text-black')}>{props.label}</Text>
 </Button>;
}
function Letters(): i32 {
 return <View className="flex-row gap-2 items-center">
  <For each={puzzle().castOrder}>{(a: number) => <Button onClick={() => choosePerson(a)} aria-label={'Placer '+personLetter(puzzle(),a)} className={'w-[52] h-[52] rounded-[8] items-center justify-center '+(selected() === a ? 'bg-black border-[3] border-black' : 'bg-white border-[3] border-black')}><Text className={'text-[18px] font-bold '+(selected() === a ? 'text-white' : 'text-black')}>{personLetter(puzzle(),a)+(placements()[a] >= 0 ? '✓' : '')}</Text></Button>}</For>
 </View>;
}
function Witness(props: { a: number; width: number }): i32 {
 const a = props.a;
 return <Button onClick={() => choosePerson(a)} aria-label={personName(puzzle(),a)+(placements()[a] >= 0 ? ', déjà placé' : ', à placer')} style={{ width: props.width }} className={'rounded-[8] bg-white items-start justify-start px-2 py-[6] '+(selected() === a ? 'border-[7] border-black' : 'border-[3] border-black')}>
  <View className="w-full flex-row items-start gap-2">
   <Portrait person={a} size={52}/>
   <View className="grow basis-0 min-w-0 gap-[2]">
    <Text className="text-[20px] font-bold font-[Caveat] text-black">{personName(puzzle(),a)+(placements()[a] >= 0 ? ' ✓' : '')}</Text>
    <For each={puzzle().clues.filter((c: Clue) => c.person === a)}>{(c: Clue) => <Rich text={clueSummary(puzzle(),c)} width={props.width-92} other={relational(c.kind) ? c.other : -1} className="text-[12px] text-black"/>}</For>
    {a === puzzle().victim && <Rich text="**La victime.** Seul le meurtrier partageait sa pièce." width={props.width-92} other={-1} className="text-[12px] text-black"/>}
   </View>
  </View>
 </Button>;
}
function Witnesses(): i32 {
 const w = (): number => inkWide() ? INK_SIDE-24 : Math.floor((viewport()-36)/2);
 return <View className={inkWide() ? 'gap-2' : 'flex-row flex-wrap gap-2 justify-center'}><For each={puzzle().castOrder}>{(a: number) => <Witness a={a} width={w()}/>}</For></View>;
}
function Tools(props: { width: number }): i32 {
 return <View style={{ width: props.width }} className="gap-2">
  <Text numberOfLines={2} className="text-[11px] text-black">{message()}</Text>
  <View className="flex-row items-center gap-2"><Letters/><View className="grow"/><Button onClick={accuse} className="px-3 h-[52] rounded-[8] border-[3] border-black bg-white items-center justify-center"><Text className="text-[12px] font-bold text-black">Accuser</Text></Button></View>
  <View className="flex-row gap-2">
   <Tool icon="x" label={activeCell() >= 0 && eliminated()[activeCell()] === 1 ? 'Rétablir' : 'Éliminer'} onClick={toggleElimination}/>
   <Tool icon="pencil" label="Brouillon" on={draft()} onClick={() => setDraft(!draft())}/>
   <Tool icon="undo-2" label="Annuler" onClick={undo}/>
   <Tool icon="lightbulb" label="Indice" onClick={() => { hint(); setMobileTab('aide'); }}/>
   <Tool icon="check" label="Valider" primary={true} onClick={verify}/>
  </View>
 </View>;
}
function Plan(props: { width: number }): i32 {
 return <View style={{ width: props.width }} className="items-center">
  <View className="w-full px-4 h-[30] justify-center"><For each={puzzle().clues.filter((c: Clue) => c.person < 0)}>{(c: Clue) => <Text numberOfLines={1} className="text-[12px] text-black">{c.text}</Text>}</For></View>
  <Board/>
  <Tools width={props.width-32}/>
 </View>;
}
export function InkApp(): i32 {
 return <View className="w-full h-full bg-white flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
  <View className="h-[56] px-4 flex-row items-center border-b-[3] border-black gap-3 shrink-0">
   <View className="grow min-w-0"><Text className="text-[20px] font-black text-black whitespace-nowrap">Minuit au manoir</Text><Text className="text-[10px] text-black">{'Enquête '+puzzle().seed+' · '+['Découverte','Enquête','Expert'][puzzle().level]}</Text></View>
   {QUILL && <Button onClick={() => quit()} aria-label="Quitter" className="px-4 h-[48] rounded-[8] border-[3] border-black bg-white items-center justify-center"><Text className="text-[14px] font-bold text-black">Quitter</Text></Button>}
   <Button disabled={busy()} onClick={() => freshAsync(puzzle().level, () => setMobileTab('plan'))} className="px-4 h-[48] rounded-[8] border-[3] border-black bg-white items-center justify-center"><Text className="text-[13px] font-bold text-black">{busy() ? 'Génération…' : 'Nouvelle affaire'}</Text></Button>
   {COLOUR_PANEL && <Button onClick={() => setColour(!colour())} aria-label="Couleur ou noir et blanc" className="px-4 h-[48] rounded-[8] border-[3] border-black bg-white items-center justify-center"><Text className="text-[13px] font-bold text-black">{colour() ? 'Mode N&B' : 'Mode couleur'}</Text></Button>}
   <Button onClick={() => setMobileTab(mobileTab() === 'aide' ? 'plan' : 'aide')} aria-label="Règles et niveau" className={'w-[48] h-[48] rounded-full border-[3] border-black items-center justify-center '+(mobileTab() === 'aide' ? 'bg-black' : 'bg-white')}><Text className={'text-[18px] font-bold '+(mobileTab() === 'aide' ? 'text-white' : 'text-black')}>?</Text></Button>
  </View>
  {inkWide() ? <View className="grow basis-0 min-h-0 flex-row">
   <Plan width={viewport()-INK_SIDE}/>
   <View style={{ width: INK_SIDE }} className="shrink-0 p-3 border-l-[3] border-black"><Witnesses/></View>
  </View> : <View className="grow basis-0 min-h-0 items-center gap-2">
   <Plan width={viewport()}/>
   <Witnesses/>
  </View>}
  {mobileTab() === 'aide' && <View className="absolute top-[56] left-[0] right-[0] bottom-[0] bg-white border-t-[3] border-black p-4 gap-3">
   <Button onClick={() => setMobileTab('plan')} className="self-end px-4 h-[48] rounded-[8] border-[3] border-black bg-white items-center justify-center"><Text className="text-[13px] font-bold text-black">Fermer l’aide</Text></Button>
   <HelpPanel/>
  </View>}
 </View>;
}
