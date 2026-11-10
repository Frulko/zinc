import { createSignal } from 'zinc:ui/solid';
import { ZoomView, Button, heading, captionText, theme } from 'zinc:ui/kit';

export function ZoomExample(): i32 {
  const [zoom, setZoom] = createSignal(1);
  const [x, setX] = createSignal(0);
  const [y, setY] = createSignal(0);
  return <View className="flex-col gap-3 w-full max-w-[420px]">
    <Text className={heading(4)}>Zoomable content</Text>
    <Text className={captionText()}>Pinch, double tap or use Control wheel. Buttons offer keyboard zoom.</Text>
    <View className="flex-row flex-wrap gap-2">
      <Button label="Zoom out" variant="outline" onClick={() => setZoom(Math.max(1, zoom() / 1.25))} />
      <Button label="Zoom in" variant="outline" onClick={() => setZoom(Math.min(4, zoom() * 1.25))} />
      <Button label="Fit" variant="outline" onClick={() => { setZoom(1); setX(0); setY(0); }} />
    </View>
    <ZoomView zoom={zoom} maxZoom={4} className={`h-[180px] border border-${theme().border} rounded-[18px] bg-${theme().card}`}
      onView={async (factor: number, cx: number, cy: number, dx: number, dy: number) => {
        setX((x() - cx) * factor + cx + dx);
        setY((y() - cy) * factor + cy + dy);
        setZoom(zoom() * factor);
      }}>
      <View translateX={x() / zoom()} translateY={y() / zoom()} className="p-6 flex-col gap-3">
        <Text className={heading(4)}>Paper circuits</Text>
        <Text className={captionText()}>LED · copper tape · folded paper</Text>
      </View>
    </ZoomView>
    <Text role="status" className={captionText()}>{Math.round(zoom() * 100)} %</Text>
  </View>;
}
