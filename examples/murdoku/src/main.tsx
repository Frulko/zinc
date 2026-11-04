import { render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';
import { width, height, penCount } from 'zinc:gfx';
import { INK, ink } from './skin';
import { viewport, setViewport, viewportHeight, setViewportHeight, compact, boardWidth, mobileTab, setMobileTab } from './layout';
import { puzzle, assignLetter, clearCell, toggleElimination, draft, setDraft, freshAsync, busy, hint, verify, undo, message } from './state';
import { SceneClues } from './components/SceneClues';
import { Board } from './components/Board';
import { WitnessList } from './components/WitnessList';
import { HelpPanel } from './components/HelpPanel';
import { MobileTabs } from './components/MobileTabs';
import { GameControls } from './components/GameControls';
import { InkApp } from './components/InkApp';
import { penStep } from './pen';
import { replayStep, replaying } from './replay';
function App(): i32 {
 return <View className="w-full h-full bg-[#f2f0f7] flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
  <View className={compact() ? 'h-[56] px-3 flex-row items-center border-b border-[#e5e5ea] gap-3 shrink-0' + ink('border-black') : 'h-[64] px-6 flex-row items-center border-b border-[#e5e5ea] gap-6 shrink-0' + ink('border-black')}>
   <View className="grow min-w-0 gap-1"><Text className={(compact() ? "text-[20px]" : "text-[26px]")+" font-black tracking-wide text-[#000000] whitespace-nowrap"}>Minuit au manoir</Text><Text className="text-[10px] text-[#8e8e93]">{'Édition 03 · Enquête '+puzzle().seed}</Text></View>
   <Button disabled={busy()} onClick={() => freshAsync(puzzle().level, () => setMobileTab('plan'))} className={'px-3 h-[40] bg-transparent rounded-[6] justify-center flex-row items-center gap-2 '+(busy() ? 'opacity-60' : '')}>{busy() && <Icon name="loader-circle" size={16} strokeWidth={2.5} color={() => 0x191922}/>}<Text className="text-[#191922] text-[13px]">{busy() ? 'Génération…' : compact() ? 'Nouvelle' : 'Nouvelle affaire'}</Text></Button>
   <Button onClick={() => setMobileTab(mobileTab() === 'aide' ? 'plan' : 'aide')} aria-label="Règles et niveau" className={"w-[44] h-[44] rounded-full border border-[#dedee4] items-center justify-center shrink-0"+ink("border-black border-[2]")}><Text className="text-[18px] font-semibold text-[#50515a]">?</Text></Button>
  </View>
  {compact() ? <View className="grow basis-0 min-h-0">
   <MobileTabs/>
   <ScrollView className="grow min-h-0">
    <View className="p-3 gap-5 items-center">
     {mobileTab() === 'plan' && <View className="gap-2 items-center" style={{ width: boardWidth() }}><SceneClues/><Board/></View>}
     {mobileTab() !== 'aide' && <WitnessList/>}
     {mobileTab() === 'aide' && <HelpPanel/>}
    </View>
   </ScrollView>
   <GameControls/>
  </View> : <View className="grow basis-0 min-h-0 flex-row">
   <ScrollView className="w-[392] shrink-0 min-h-0 border-r-[2] border-[#191922] bg-[#f2f0f7]"><View className="p-4"><WitnessList/></View></ScrollView>
   <ScrollView className="grow min-w-0 min-h-0"><View className="p-6 gap-4 items-center">
    <View style={{ width: boardWidth() }} className="flex-row items-center"><Text className="grow text-[13px] font-semibold text-[#303139]">La scène du crime</Text><Text className="text-[11px] text-[#777a82]">{puzzle().columns+' × '+puzzle().rows+' · '+['Découverte','Enquête','Expert'][puzzle().level]}</Text></View>
    <View style={{ width: boardWidth() }}><SceneClues/></View>
    <Board/>
    <Text style={{ width: boardWidth() }} className="text-[12px] text-[#777a82] text-center">{message()}</Text>
   </View></ScrollView>
   <GameControls/>
  </View>}
  {!compact() && mobileTab() === 'aide' && <View className={"absolute top-[76] right-[100] w-[310] bg-[#ffffff] rounded-[12] border border-[#dedee4] shadow-lg"+ink("border-[3] border-black")}>
   <Button onClick={() => setMobileTab('plan')} className="h-[40] px-4 items-end justify-center"><Text className="text-[12px] text-[#191922]">Fermer l’aide</Text></Button>
   <ScrollView style={{ height: viewportHeight()-150 }}><View className="p-4"><HelpPanel/></View></ScrollView>
  </View>}

 </View>;
}
ui.onKey((e: ui.KeyEvent) => {
 const k = e.key.toLowerCase();
 if (e.primary && k === 'z') { undo(); e.preventDefault(); return; }
 if (e.primary || e.alt || e.repeat) return;
 if (k.length === 1 && assignLetter(k,e.shift)) { e.preventDefault(); return; }
 if (k === ' ') { setDraft(!draft()); e.preventDefault(); }
 if (k === 'backspace' || k === 'delete') { clearCell(); e.preventDefault(); }
 if (k === 'x') { toggleElimination(); e.preventDefault(); }
 if (k === 'h') { hint(); setMobileTab('aide'); }
 if (k === 'enter') { verify(); e.preventDefault(); }
});
ui.onTwoFingerTap(() => undo());   // a two-finger tap takes the last move back, recognised pen marks included
render(INK ? InkApp : App,INK ? 0xffffff : 0xf2f0f7,(dt: number) => { replayStep(); penStep(dt); if (INK && (penCount() > 0 || replaying())) ui.repaint(); const safe = ui.safeArea(); const current = width()-safe[1]-safe[3]; if (current !== viewport()) setViewport(current); const currentHeight = height()-safe[0]-safe[2]; if (currentHeight !== viewportHeight()) setViewportHeight(currentHeight); });
