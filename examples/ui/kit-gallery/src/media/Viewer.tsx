import { createSignal } from 'zinc:ui/solid';
import { ImageViewer, ImageView, Button, openImageViewer, theme } from 'zinc:ui/kit';
export function MediaViewer(p: { pictures: i32[] }): i32 {
  const [view, setView] = createSignal(new ImageView());
  return <View className="flex-col gap-3">
    <ImageViewer image={p.pictures[0]} label="Studio reference" view={view} onChange={setView} height={300} checkerboard={true}/>
    <Text className={`text-[12px] text-${theme().mutedForeground}`}>Wheel or pinch to zoom. Drag to pan. + / − zoom, 0 fits, 1 shows actual pixels.</Text>
    <Button label="Open full screen" variant="outline" onClick={() => openImageViewer({items: p.pictures.map((image:i32,index:i32)=>({image:image,width:640,height:400,title:index===0?'Original studio':'Colour study',detail:'640 × 400 px'})),index:0})}/>
  </View>;
}
