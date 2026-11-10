import { createSignal } from 'zinc:ui/solid';
import { ImageCropper, MediaRect, Button, theme } from 'zinc:ui/kit';
export function MediaCrop(p: { pictures: i32[] }): i32 {
  const [crop,setCrop]=createSignal(new MediaRect());
  const [round,setRound]=createSignal(false);
  return <View className="flex-col gap-3">
    <ImageCropper label="Choose a cover" image={p.pictures[0]} crop={crop} onChange={setCrop} round={round()} aspect={round()?1:1.5} height={300}/>
    <View className="flex-row flex-wrap gap-2"><Button label={round()?'Use landscape crop':'Use round crop'} variant="outline" onClick={()=>{setRound(!round());setCrop(new MediaRect());}}/><Button label="Reset crop" variant="outline" onClick={()=>setCrop(new MediaRect())}/></View>
    <Text className={`text-[12px] text-${theme().mutedForeground}`}>Drag a corner or edge to resize, inside to move, or outside to draw. Arrows move a pixel; Shift moves ten.</Text>
  </View>;
}
