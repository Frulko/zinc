// One sample document in a card: its name, its shape count, and the document drawn at three sizes.
import { rrect, border } from 'zinc:gfx';
import { Card, CardContent, Badge, heading } from 'zinc:ui/kit';
import { Document } from '../documents';

const SCALES: number[] = [0.45, 0.72, 1.0];
const GAP = 16;

/** Canvas callback: three renderings side by side on light tiles, as tall as the canvas allows (wide documents
 *  such as the icon strip are shrunk until the three fit the width). */
function drawSizes(doc: Document, x: i32, y: i32, w: i32, h: i32): void {
  const aspect = doc.svg.width / doc.svg.height;
  const widthAtFullHeight = SCALES.reduce((sum: number, s: number) => sum + s * h * aspect, 0) + GAP * (SCALES.length - 1);
  const height = h * Math.min(1, w / widthAtFullHeight);
  let left = x;
  for (const scale of SCALES) {
    const th = Math.round(height * scale);
    const tw = Math.round(th * aspect);
    const top = y + h - th;       // bottoms aligned
    rrect(left, top, tw, th, 6, 0xfafafa, 255);
    border(left, top, tw, th, 6, 1, 0xe4e4e7, 255);
    doc.svg.draw(left, top, tw, th, 255);
    left += tw + GAP;
  }
}

export function SampleCard(props: { doc: Document }): i32 {
  const doc = props.doc;
  return <Card>
    <CardContent>
      <View class="flex-row items-center justify-between">
        <Text class={heading(4)}>{doc.name}</Text>
        <Badge label={`${doc.svg.items()} shapes`} variant="secondary" />
      </View>
      <Canvas class="h-24" onDraw={(x: i32, y: i32, w: i32, h: i32) => drawSizes(doc, x, y, w, h)} />
    </CardContent>
  </Card>;
}
