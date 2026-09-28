// notes: a handwriting notebook for the reMarkable Paper Pro (zinc:ink + display-rmpp).
// The pen draws with pressure; the Marker's eraser end (or the Eraser tool) removes strokes; pages, colours,
// widths, undo / clear, save (JSON) and export (SVG). On the desktop the mouse is the pen (right button erases).
import { render } from 'zinc:ui/solid';
import { InkCanvas } from 'zinc:ink';
import { ink, loadPages } from './notebook';
import { stepDemo } from './demo';
import { DrawingBar, PageBar } from './components/toolbar';

/** A 3 px black rule between the bars and the page. */
function Rule(): i32 {
  return <View class="h-[3px] bg-black" />;
}

function App(): i32 {
  return <View class="flex-col h-full bg-white">
    <DrawingBar />
    <Rule />
    <PageBar />
    <Rule />
    <InkCanvas ink={ink} class="grow" />
  </View>;
}

loadPages();
render(App, 0xffffff, stepDemo);
