import { RollingCounter, Ticker, ShimmerText, Typewriter, WordReveal, SpotlightCard, Loader, Button, heading, theme } from 'zinc:ui/kit';
import { createSignal } from 'zinc:ui/solid';
export function ExtendedMotion(): i32 {
  const [active,setActive]=createSignal(false),[count,setCount]=createSignal(12408),[text,setText]=createSignal('Every change has a reason.'),[notice,setNotice]=createSignal('Effects are stopped until requested.');
  return <View className="flex-col gap-5 min-w-0"><Text className={heading(4)}>Motion on request</Text>
    <View className="flex-row flex-wrap items-center gap-3"><Button label={active()?'Stop effects':'Start effects'} onClick={()=>setActive(!active())}/><Button label="Add 127" variant="outline" onClick={()=>setCount(count()+127)}/><RollingCounter value={count()} suffix="builds"/></View>
    <Ticker active={active()} items={[{label:'Build time',value:'3m 42s',delta:-17.6,lowerIsBetter:true},{label:'Coverage',value:'76.3%',delta:2.1},{label:'Flaky tests',value:'7',delta:2,lowerIsBetter:true}]}/>
    <ShimmerText text="Preparing the next release" active={active()}/><Typewriter text={text()} active={active()} onDone={()=>setNotice('Typewriter complete')}/><WordReveal text="Small, deliberate transitions help people follow what changed." active={active()}/>
    <View className="flex-row flex-wrap gap-3"><Button label="Append text" variant="outline" onClick={()=>setText(text()+' Ready.')}/><Button label="Replace text" variant="outline" onClick={()=>setText('A new sentence starts here.')}/></View>
    <SpotlightCard title="A focused card" description="The light follows your pointer only while effects are enabled." active={active()} beam={true} onClick={()=>setNotice('Card opened')}/>
    <View className="flex-row flex-wrap gap-5 items-center"><Loader active={active} style="dots"/><Loader active={active} style="bars"/><Loader active={active} style="pulse"/><Loader active={active} style="orbit"/><Loader active={active} style="grid"/></View>
    <Text role="status" className={`text-[12px] text-${theme().mutedForeground}`}>{notice()}</Text>
  </View>;
}
