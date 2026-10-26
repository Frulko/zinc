// notes: a handwriting notebook for the reMarkable Paper Pro (zinc:ink + display-rmpp).
// The pen draws with pressure; the Marker's eraser end (or the Eraser tool) removes strokes; pages, colours,
// widths, undo / clear, save (JSON) and export (SVG). On the desktop the mouse is the pen (right button erases). Two fingers zoom the page
// (up to 4x), one finger pans it when zoomed, a double tap goes back to the whole page: the kit's ZoomView.
import { render } from 'zinc:ui/solid';
import { ZoomView } from 'zinc:ui/kit';
import { quit } from 'zinc:gfx';
import { RemarkableBar, RemarkableApp } from 'zinc:remarkable';
import { ink, loadPages, savePage } from './notebook';
import { stepDemo } from './demo';
import { DrawingBar, PageBar, DisplayBar } from './components/toolbar';

// the committed view: ink point p shows at (p - (ox, oy)) * z, kept inside the page
const view = { ox: 0, oy: 0, z: 1, w: 0, h: 0 };
async function setView(f: number, cx: number, cy: number, dx: number, dy: number): Promise<void> {
  const px = view.ox + cx / view.z, py = view.oy + cy / view.z;
  view.z = Math.max(1, Math.min(4, view.z * f));
  view.ox = Math.max(0, Math.min(view.w - view.w / view.z, px - (cx + dx) / view.z));
  view.oy = Math.max(0, Math.min(view.h - view.h / view.z, py - (cy + dy) / view.z));
}
function page(x: i32, y: i32, w: i32, h: i32): void { view.w = w; view.h = h; ink.draw(x, y, w, h, view.ox, view.oy, view.z); }

/** A 3 px black rule between the bars and the page. */
function Rule(): i32 {
  return <View className="h-[3px] bg-black" />;
}

function App(): i32 {
  return <View className="flex-col h-full bg-white">
    <RemarkableBar title="Notes" onQuit={() => { if (savePage()) quit(); }} />
    <DrawingBar />
    <Rule />
    <PageBar />
    <DisplayBar />
    <Rule />
    <ZoomView className="grow" zoom={() => view.z} maxZoom={4} draw={page} picture={() => ink.img} writing={() => ink.live !== null}
      onView={setView} />
  </View>;
}

loadPages();
render(() => <RemarkableApp app={App} />, 0xffffff, stepDemo);
