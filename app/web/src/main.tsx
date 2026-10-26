// Zinc Web (ZN-844): web pages on the reMarkable. The Mac's relay (app/web-relay) renders them in Chrome at the tablet's size; this app
// shows them a page at a time, follows links by tap, zooms with two fingers, keeps pen notes per page and exports page + ink as PNG.
// E-paper: black on white, page turns instead of scrolling, one refresh per gesture; Refresh clears the ghosting.
import { render, createSignal } from 'zinc:ui/solid';
import { setPressFeedback } from 'zinc:ui';
import { quit } from 'zinc:gfx';
import { RemarkableBar, RemarkableApp, RemarkableKeyboard, InkPalette } from 'zinc:remarkable';
import { PAGE, LABEL, TITLE, FIELD, BUTTON, BUTTON_LABEL, OUTLINE_BUTTON, OUTLINE_LABEL } from './constants';
import { ink, screen, setScreen, address, setAddress, status, busy, pageLabel, penMode, setPenMode, bookmarks, onTablet, relay, view,
  openUrl, back, turn, zoomTo, saveInk, exportPng, addBookmark, removeBookmark, saveRelay, setColour, nextContrast, setEinkStyle, checkInbox, reader, toggleReader, refresh,
  tabList, tabIndex, scale, pageSize, full, setFullScreen, switchTab, closeTab, newTab, currentTab, Tab, SCREEN_PAGE, SCREEN_BOOKMARKS, SCREEN_SETTINGS, SCREEN_TABS, conf } from './state';
import { pageView } from './pageview';
import { dashUrl, every, updated, widgetPreview, startDash, stopDash, setPeriod, dashView, widgetView, PERIODS, WIDGET_W, WIDGET_H } from './dashboard';
import { scripted, runScript } from './script';

function Btn(props: { label: string; onClick: () => void; on?: boolean }): i32 {
  const on = props.on === true;
  return <Button className={on ? BUTTON : OUTLINE_BUTTON} onClick={props.onClick}><Text className={on ? BUTTON_LABEL : OUTLINE_LABEL}>{props.label}</Text></Button>;
}

function Bookmarks(): i32 {
  return <ScrollView className="grow">
    <View className="flex-col gap-4 p-8">
      <Text className={TITLE}>Bookmarks</Text>
      {bookmarks().length === 0 ? <Text className={LABEL}>None yet: open a page and tap ★.</Text> : null}
      {bookmarks().map((u: string) => <View className="flex-row gap-4 items-center py-3 border-b-2 border-black">
        <Text className={`grow ${LABEL}`}>{u}</Text>
        <Btn label="Open" on={true} onClick={() => openUrl(u)} />
        <Btn label="Dashboard" onClick={() => startDash(u)} />
        <Btn label="Remove" onClick={() => removeBookmark(u)} />
      </View>)}
    </View>
  </ScrollView>;
}

function Tabs(): i32 {
  return <ScrollView className="grow">
    <View className="flex-col gap-4 p-8">
      <Text className={TITLE}>Tabs</Text>
      <Text className={LABEL}>A page sent from the Mac opens in a new tab; the one you were reading stays here, at the same page.</Text>
      {tabList().map((t: Tab, i: i32) => <View className="flex-row gap-4 items-center py-3 border-b-2 border-black">
        <Text className={`grow ${LABEL}`}>{(i === tabIndex() ? '▶ ' : '') + (t.title !== '' ? t.title + ' · ' : '') + t.url}</Text>
        <Btn label="Open" on={true} onClick={() => switchTab(i)} />
        <Btn label="Close" onClick={() => closeTab(i)} />
      </View>)}
      <View className="flex-row"><Btn label="New tab" onClick={() => newTab(address())} /></View>
    </View>
  </ScrollView>;
}

function Settings(): i32 {
  const [url, setUrl] = createSignal<string>(relay.url);
  const [token, setToken] = createSignal<string>(relay.token);
  const [contrast, setContrast] = createSignal<string>(relay.contrast);
  const [eink, setEink] = createSignal<boolean>(relay.style === 'eink');
  return <View className="flex-col gap-6 p-8 grow">
    <Text className={TITLE}>Relay</Text>
    <Text className={LABEL}>The Mac that renders the pages: zinc run app/web-relay (over USB the Mac is http://10.11.99.2:8790).</Text>
    <Input className={FIELD} inputMode="url" value={url()} onInput={(v: string) => setUrl(v)} />
    <Text className={LABEL}>Its token (the relay prints it; empty when it runs with --no-token):</Text>
    <Input className={FIELD} value={token()} onInput={(v: string) => setToken(v)} />
    <View className="flex-row gap-6">
      <Btn label="Save" on={true} onClick={() => { saveRelay(url(), token()); setScreen(SCREEN_PAGE); }} />
      <Btn label={relay.mode === 'color' ? 'Colour: on' : 'Colour: off'} onClick={() => setColour(relay.mode !== 'color')} />
      <Btn label={'Contrast: ' + contrast()} onClick={() => { nextContrast(); setContrast(relay.contrast); }} />
      <Btn label={eink() ? 'E-ink style: on' : 'E-ink style: off'} onClick={() => { setEinkStyle(!eink()); setEink(relay.style === 'eink'); }} />
    </View>
  </View>;
}

const SMALL = 'text-[24px] text-black';
/** Dashboard mode: the page full screen, a thin bar, the period and the time of the last render; a tap on the page renders it now. */
function Dashboard(): i32 {
  return <View className={PAGE}>
    <RemarkableBar title="Dashboard" onQuit={() => quit()} />
    <Canvas className="grow" onDraw={dashView} />
    <View className="flex-row gap-3 px-4 py-2 items-center border-t-2 border-black">
      <Text className={SMALL}>{updated() === '' ? (busy() ? 'Loading…' : status()) : 'Updated ' + updated() + ' · every'}</Text>
      {PERIODS.map((m: i32) => <Button className={`px-4 h-[56px] items-center justify-center rounded-lg border-2 border-black ${m === every() ? 'bg-black focus:bg-black' : 'bg-white focus:bg-white'}`}
        onClick={() => setPeriod(m)}><Text className={m === every() ? 'text-[24px] text-white' : SMALL}>{m.toString() + ' min'}</Text></Button>)}
      <View className="grow" />
      <Button className="px-4 h-[56px] items-center justify-center rounded-lg border-2 border-black bg-white focus:bg-white" onClick={() => stopDash()}>
        <Text className={SMALL}>Reader</Text>
      </Button>
    </View>
  </View>;
}
/** Accueil's card: the top of the dashboard page; without a dashboard, how to make one. */
function Widget(): i32 {
  return <View className="flex-col bg-white" style={{ width: WIDGET_W, height: WIDGET_H }}>
    {dashUrl() !== '' ? <Canvas className="grow" onDraw={widgetView} /> : <Text className={`p-6 ${LABEL}`}>No dashboard: open Web, Bookmarks, Dashboard.</Text>}
    <Text className={`px-2 ${SMALL}`}>{dashUrl() === '' ? '' : updated() === '' ? 'Loading…' : 'Updated ' + updated()}</Text>
  </View>;
}

/** Full screen: the top bar, one thin row (back to the normal view, the page, its size), the page. Swipes still turn pages. */
function FullReader(): i32 {
  return <View className={PAGE}>
    <RemarkableBar title="Web" onQuit={() => { if (saveInk()) quit(); }} />
    <View className="flex-row gap-4 px-6 py-2 items-center border-b-2 border-black">
      <Btn label="Normal view" onClick={() => setFullScreen(false)} />
      <View className="grow" />
      <Text className={LABEL}>{pageLabel()}</Text>
      <Btn label="A−" onClick={() => pageSize(-1)} />
      <Btn label="A+" onClick={() => pageSize(1)} />
    </View>
    <InkPalette ink={ink} open={false} />
    <Canvas className="grow" onDraw={pageView} />
  </View>;
}

function Reader(): i32 {
  return <View className={PAGE}>
    <RemarkableBar title="Web" onQuit={() => { if (saveInk()) quit(); }} />
    <View className="flex-row gap-4 px-6 pt-4 items-center" onSubmit={() => openUrl(address())}>
      <Btn label="‹" onClick={() => back()} />
      <Input className={`grow ${FIELD}`} inputMode="url" value={address()} onInput={(v: string) => setAddress(v)} />
      <Btn label="Go" on={true} onClick={() => openUrl(address())} />
    </View>
    <View className="flex-row gap-4 px-6 py-4 items-center border-b-2 border-black">
      <Btn label="Reader" on={reader()} onClick={() => toggleReader()} />
      <Btn label="★" onClick={() => addBookmark()} />
      <Btn label={'Tabs ' + tabList().length.toString()} on={screen() === SCREEN_TABS} onClick={() => setScreen(screen() === SCREEN_TABS ? SCREEN_PAGE : SCREEN_TABS)} />
      <Btn label="Bookmarks" on={screen() === SCREEN_BOOKMARKS} onClick={() => setScreen(screen() === SCREEN_BOOKMARKS ? SCREEN_PAGE : SCREEN_BOOKMARKS)} />
      <Btn label="Settings" on={screen() === SCREEN_SETTINGS} onClick={() => setScreen(screen() === SCREEN_SETTINGS ? SCREEN_PAGE : SCREEN_SETTINGS)} />
      <View className="grow" />
      {onTablet ? null : <Btn label="Pen" on={penMode()} onClick={() => setPenMode(!penMode())} />}
      <Btn label="Save" onClick={() => saveInk()} />
      <Btn label="Export" onClick={() => exportPng()} />
    </View>
    {screen() === SCREEN_PAGE ? <InkPalette ink={ink} open={false} /> : null}
    {screen() === SCREEN_PAGE ? <Canvas className="grow" onDraw={pageView} />
      : screen() === SCREEN_BOOKMARKS ? <Bookmarks /> : screen() === SCREEN_TABS ? <Tabs /> : <Settings />}
    <View className="flex-row gap-4 px-6 py-4 items-center border-t-2 border-black">
      <Btn label="Previous" onClick={() => turn(-1)} />
      <Text className={`w-[260px] text-center ${LABEL}`}>{pageLabel()}</Text>
      <Btn label="Next" on={true} onClick={() => turn(1)} />
      <Btn label="−" onClick={() => zoomTo(view.zoom / 1.5, view.w / 2, view.h / 2)} />
      <Btn label="+" onClick={() => zoomTo(view.zoom * 1.5, view.w / 2, view.h / 2)} />
      <Btn label="A−" onClick={() => pageSize(-1)} />
      <Text className={LABEL}>{Math.round(scale() * 50).toString() + ' %'}</Text>
      <Btn label="A+" onClick={() => pageSize(1)} />
      <View className="grow" />
      <Btn label="Full screen" onClick={() => { setScreen(SCREEN_PAGE); setFullScreen(true); }} />
      <Btn label="Refresh" onClick={() => refresh()} />
    </View>
    <View className="px-6 py-3 border-t-2 border-black">
      <Text className={LABEL}>{busy() ? 'Loading…' : status()}</Text>
    </View>
    <RemarkableKeyboard />
  </View>;
}

// a pressed button fading in and out would ghost on e-paper (as the hub)
setPressFeedback(false);
// signals read in braces: the switch follows them (a component's body runs once)
function App(): i32 { return <View className="flex-col h-full">{dashUrl() !== '' ? <Dashboard /> : full() ? <FullReader /> : <Reader />}</View>; }
function Root(): i32 {
  return <View className="flex-col h-full">{widgetPreview() ? <Widget /> : <RemarkableApp app={App} widget={{ view: Widget, width: WIDGET_W, height: WIDGET_H }} />}</View>;
}
render(Root, 0xffffff, null);
async function start(): Promise<void> {
  if (scripted()) { await runScript(); return; }
  setInterval(() => { if (dashUrl() === '') checkInbox(); }, 3000);
  if (conf.get('relay') !== '' && dashUrl() === '') { while (view.w === 0) await new Promise<void>((resolve) => { setTimeout(() => { resolve(); }, 50); }); await openUrl(currentTab().url, false, currentTab().oy); }
}
start();
