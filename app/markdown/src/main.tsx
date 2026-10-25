// Zinc Read (ZN-844): Markdown documents and Notion pages on the reMarkable. md4c (zinc:markdown) parses a .md of the library folder,
// the reader lays it out on fixed pages (page turns by swipe or buttons, no scrolling), with a table of contents from the headings,
// links to other .md files, task boxes ticked into the file and pen notes per document. Notion pages are imported as .md (Settings, Sync)
// and read offline. E-paper: black on white, big targets, one refresh per gesture.
import { render, createSignal } from 'zinc:ui/solid';
import { setPressFeedback } from 'zinc:ui';
import { Keyboard } from 'zinc:ui/kit';
import { quit } from 'zinc:gfx';
import { RemarkableApp, RemarkableBar } from 'zinc:remarkable';
import { PAGE, LABEL, SMALL, TITLE, FIELD, BUTTON, BUTTON_LABEL, OUTLINE_BUTTON, OUTLINE_LABEL, ROW, KEY, DOCS_DIR, FONT_SIZES } from './constants';
import { screen, setScreen, status, busy, pageLabel, library, docTitle, fontIndex, penMode, setPenMode, onTablet, doc, version,
  openDoc, turn, jump, setFont, back, saveInk, undoInk, scanLibrary, notionToken, notionPage, saveNotion, syncNotion, refresh, restore,
  SCREEN_LIBRARY, SCREEN_READ, SCREEN_TOC, SCREEN_SETTINGS } from './state';
import { Heading } from './layout';
import { pageView } from './pageview';
import { scripted, runScript } from './script';

function Btn(props: { label: string; onClick: () => void; on?: boolean }): i32 {
  const on = props.on === true;
  return <Button className={on ? BUTTON : OUTLINE_BUTTON} onClick={props.onClick}><Text className={on ? BUTTON_LABEL : OUTLINE_LABEL}>{props.label}</Text></Button>;
}
function toggle(s: i32): void { setScreen(screen() === s ? (doc.path !== '' ? SCREEN_READ : SCREEN_LIBRARY) : s); }

function Library(): i32 {
  return <ScrollView className="grow">
    <View className="flex-col gap-2 p-8">
      <View className="flex-row items-center gap-4">
        <Text className={`grow ${TITLE}`}>Library</Text>
        <Btn label="Rescan" onClick={() => scanLibrary()} />
      </View>
      <Text className={SMALL}>{DOCS_DIR}</Text>
      {library().map((p: string) => <Button className={ROW} onClick={() => openDoc(p)}>
        <Text className={`grow ${LABEL}`}>{p}</Text>
        <Text className={OUTLINE_LABEL}>Open ›</Text>
      </Button>)}
    </View>
  </ScrollView>;
}

function Contents(): i32 {
  version();
  return <ScrollView className="grow">
    <View className="flex-col gap-2 p-8">
      <Text className={TITLE}>Contents</Text>
      {doc.lay.headings.length === 0 ? <Text className={LABEL}>This document has no headings.</Text> : null}
      {doc.lay.headings.map((h: Heading) => <Button className={ROW} onClick={() => jump(h.page)}>
        <View style={{ width: (h.level - 1) * 36 }} />
        <Text className={`grow ${h.level <= 2 ? OUTLINE_LABEL : LABEL}`}>{h.text}</Text>
        <Text className={LABEL}>{(h.page + 1).toString()}</Text>
      </Button>)}
    </View>
  </ScrollView>;
}

function Settings(): i32 {
  const [token, setToken] = createSignal<string>(notionToken());
  const [page, setPage] = createSignal<string>(notionPage());
  return <ScrollView className="grow">
    <View className="flex-col gap-6 p-8">
      <Text className={TITLE}>Notion</Text>
      <Text className={LABEL}>1. On notion.so/profile/integrations create an internal integration and copy its secret.</Text>
      <Text className={LABEL}>2. In Notion, open the page, … menu, Connections: add the integration.</Text>
      <Text className={LABEL}>Integration secret:</Text>
      <Input className={FIELD} value={token()} onInput={(v: string) => setToken(v)} />
      <Text className={LABEL}>Page link or id (each page saved is synced again by Sync):</Text>
      <Input className={FIELD} inputMode="url" value={page()} onInput={(v: string) => setPage(v)} />
      <View className="flex-row gap-6">
        <Btn label="Save" onClick={() => { saveNotion(token(), page()); }} />
        <Btn label={busy() ? 'Syncing…' : 'Save and sync'} on={true} onClick={() => { if (saveNotion(token(), page())) syncNotion(); }} />
      </View>
      <Text className={SMALL}>The pages are saved as Markdown in {DOCS_DIR}/notion and read offline. The tablet needs Wi-Fi with internet to sync.</Text>
    </View>
  </ScrollView>;
}

function Reader(): i32 {
  return <Canvas className="grow" onDraw={pageView} />;
}

function App(): i32 {
  return <View className={PAGE}>
    <RemarkableBar title="Zinc Read" onHome={() => { saveInk(); }} onQuit={() => { if (saveInk()) quit(); }} />
    <View className="flex-row gap-4 px-6 py-4 items-center border-b-2 border-black">
      <Btn label="Library" on={screen() === SCREEN_LIBRARY} onClick={() => toggle(SCREEN_LIBRARY)} />
      <Btn label="Contents" on={screen() === SCREEN_TOC} onClick={() => toggle(SCREEN_TOC)} />
      <Btn label="‹ Back" onClick={() => back()} />
      <View className="grow" />
      {onTablet ? null : <Btn label="Pen" on={penMode()} onClick={() => setPenMode(!penMode())} />}
      <Btn label="Undo" onClick={() => undoInk()} />
      <Btn label="Sync" onClick={() => syncNotion()} />
      <Btn label="Settings" on={screen() === SCREEN_SETTINGS} onClick={() => toggle(SCREEN_SETTINGS)} />
    </View>
    {screen() === SCREEN_READ ? <View className="px-6 pt-3"><Text className={SMALL}>{docTitle()}</Text></View> : null}
    {screen() === SCREEN_READ ? <Reader /> : screen() === SCREEN_TOC ? <Contents /> : screen() === SCREEN_SETTINGS ? <Settings /> : <Library />}
    <View className="flex-row gap-4 px-6 py-4 items-center border-t-2 border-black">
      <Btn label="Previous" onClick={() => turn(-1)} />
      <Text className={`w-[220px] text-center ${LABEL}`}>{pageLabel()}</Text>
      <Btn label="Next" on={true} onClick={() => turn(1)} />
      <Btn label="A−" onClick={() => setFont(-1)} />
      <Text className={`w-[90px] text-center ${SMALL}`}>{FONT_SIZES[fontIndex()].toString()}</Text>
      <Btn label="A+" onClick={() => setFont(1)} />
      <View className="grow" />
      <Btn label="Refresh" onClick={() => refresh()} />
    </View>
    <View className="px-6 py-3 border-t-2 border-black">
      <Text className={LABEL}>{busy() ? 'Working…' : status()}</Text>
    </View>
    {screen() === SCREEN_SETTINGS
      ? <Keyboard keyHeight={88} gap={10} keyClass={KEY} specialKeyClass={KEY} className="bg-white border-t-2 border-black" preview={false} />
      : null}
  </View>;
}

// a pressed button fading in and out would ghost on e-paper (as the hub)
setPressFeedback(false);
render(() => <RemarkableApp app={App} />, 0xffffff, null);
restore();
if (scripted()) runScript();
