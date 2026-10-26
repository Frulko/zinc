// Zinc PDF (ZN-844): PDFs on the reMarkable. A library of the PDFs in ~/zinc-docs; a page fitted to the screen, turned by a swipe or
// the buttons, a strip to jump through the document, pinch and +/- zoom; pen notes per page in page points with xochitl's writing tools
// (zinc:remarkable's InkPalette: ballpoint to highlighter, colours, widths, erasers, undo/redo), saved beside the document;
// Export writes a copy of the PDF with the notes as ink annotations. E-paper: black on white, one refresh per gesture.
import { render } from 'zinc:ui/solid';
import { setPressFeedback } from 'zinc:ui';
import { ZoomView } from 'zinc:ui/kit';
import { quit } from 'zinc:gfx';
import { RemarkableBar, RemarkableApp, InkPalette } from 'zinc:remarkable';
import { MAX_ZOOM, PAGE, LABEL, TITLE, BUTTON, BUTTON_LABEL, OUTLINE_BUTTON, OUTLINE_LABEL, ROW, DOCS_DIR } from './constants';
import { screen, status, pageLabel, penMode, setPenMode, files, onTablet, view, ink, scanLibrary, showLibrary, openDoc,
  reopenLast, turn, goTo, zoomTo, setView, saveInk, exportPdf, refresh, remember, docName, SCREEN_LIBRARY } from './state';
import { pageView, pageStrip, writing, swipe } from './pageview';
import { scripted, runScript } from './script';

function Btn(props: { label: string; onClick: () => void; on?: boolean }): i32 {
  const on = props.on === true;
  return <Button className={on ? BUTTON : OUTLINE_BUTTON} onClick={props.onClick}><Text className={on ? BUTTON_LABEL : OUTLINE_LABEL}>{props.label}</Text></Button>;
}

function Library(): i32 {
  return <ScrollView className="grow">
    <View className="flex-col gap-4 p-8">
      <Text className={TITLE}>Documents</Text>
      <Text className={LABEL}>{DOCS_DIR}</Text>
      {files().length === 0 ? <Text className={LABEL}>Copy PDFs there: scp file.pdf root@10.11.99.1:/home/root/zinc-docs/ over USB, then Rescan.</Text> : null}
      {files().map((f: string) => <View className={ROW}>
        <Text className={`grow ${LABEL}`}>{f}</Text>
        <Btn label="Open" on={true} onClick={() => openDoc(f)} />
      </View>)}
      <View className="flex-row"><Btn label="Rescan" onClick={() => scanLibrary()} /></View>
    </View>
  </ScrollView>;
}

function Reader(): i32 {
  return <View className="flex-col grow">
    <View className="flex-row gap-4 px-6 py-4 items-center border-b-2 border-black">
      <Btn label="Documents" onClick={() => showLibrary()} />
      <View className="grow" />
      {onTablet ? null : <Btn label="Pen" on={penMode()} onClick={() => setPenMode(!penMode())} />}
      <Btn label="Export" onClick={() => exportPdf()} />
      <Btn label="Refresh" onClick={() => refresh()} />
    </View>
    <InkPalette ink={ink} open={false} />
    <ZoomView className="grow" zoom={() => view.zoom} maxZoom={MAX_ZOOM} draw={pageView} picture={() => ink.img} writing={writing}
      onView={setView} onSwipe={swipe} onWheel={(s: number) => { turn(s > 0 ? -1 : 1); }} />
    <View className="flex-row gap-4 px-6 py-4 items-center border-t-2 border-black">
      <Btn label="Previous" onClick={() => turn(-1)} />
      <Text className={`w-[260px] text-center ${LABEL}`}>{pageLabel()}</Text>
      <Btn label="Next" on={true} onClick={() => turn(1)} />
      <Btn label="−" onClick={() => zoomTo(view.zoom / 1.5, view.w / 2, view.h / 2)} />
      <Btn label="+" onClick={() => zoomTo(view.zoom * 1.5, view.w / 2, view.h / 2)} />
    </View>
    <Canvas className="h-[72px] mx-6 mb-2" onDraw={(x: i32, y: i32, w: i32, h: i32) => pageStrip(x, y, w, h, goTo)} />
  </View>;
}

function leave(): void { if (saveInk()) { remember(); quit(); } }

function App(): i32 {
  return <View className={PAGE}>
    <RemarkableBar title={screen() === SCREEN_LIBRARY ? 'PDF' : docName()} onHome={() => { saveInk(); remember(); }} onQuit={leave} />
    {screen() === SCREEN_LIBRARY ? <Library /> : <Reader />}
    <View className="px-6 py-3 border-t-2 border-black">
      <Text className={LABEL}>{status()}</Text>
    </View>
  </View>;
}

function Root(): i32 { return <RemarkableApp app={App} />; }

// a pressed button fading in and out would ghost on e-paper (as the hub)
setPressFeedback(false);
render(Root, 0xffffff, null);
scanLibrary();
if (scripted()) runScript();
else reopenLast();
