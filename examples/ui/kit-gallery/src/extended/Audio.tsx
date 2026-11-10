import { NowPlaying, Waveform, heading, theme } from 'zinc:ui/kit';
import { createSignal } from 'zinc:ui/solid';
const tracks=['Small hours','After the rain','Morning light'];
export function ExtendedAudio(): i32 {
  const [playing,setPlaying]=createSignal(false),[position,setPosition]=createSignal(48),[track,setTrack]=createSignal<i32>(0);
  const peaks:number[]=[];for(let i=0;i<240;i++)peaks.push(0.15+Math.abs(Math.sin(i*0.43)*Math.cos(i*0.09))*0.85);
  const change=(direction:i32):void=>{setTrack((track()+direction+tracks.length)%tracks.length);setPosition(0);setPlaying(false);};
  return <View className="flex-col gap-5 min-w-0"><Text className={heading(4)}>Caller controlled audio</Text>
    <NowPlaying title={tracks[track()]} artist="Northlight · local preview" peaks={peaks} playing={playing} position={position} duration={204} onPlay={setPlaying} onSeek={setPosition} onPrevious={()=>change(-1)} onNext={()=>change(1)} countdown={true}/>
    <Text className={`text-[12px] text-${theme().mutedForeground}`}>The callbacks update this UI model. Connect your player to hear audio.</Text>
    <Waveform peaks={peaks} label="Waveform preview" position={()=>position()/204} onSeek={(value:number)=>setPosition(value*204)}/>
    <NowPlaying title="Compact player" artist="Same controlled position" peaks={peaks} playing={playing} position={position} duration={204} onPlay={setPlaying} onSeek={setPosition} compact={true}/>
  </View>;
}
