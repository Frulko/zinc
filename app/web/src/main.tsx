// Zinc Web (ZN-844): web pages on the reMarkable. The Mac's relay (app/web-relay) renders them in Chrome at the tablet's size; this app
// shows them a page at a time, follows links by tap, zooms with two fingers, keeps pen notes per page and exports page + ink as PNG.
// E-paper: black on white, page turns instead of scrolling, one refresh per gesture; Refresh clears the ghosting.
import { render, createSignal } from 'zinc:ui/solid';
import { setPressFeedback } from 'zinc:ui';
import { ZoomView, Slider } from 'zinc:ui/kit';
import { quit } from 'zinc:gfx';
import { RemarkableBar, RemarkableApp, RemarkableKeyboard, InkPalette } from 'zinc:remarkable';
import { Icon } from 'zinc:icons';
import { PAGE, LABEL, SMALL, TITLE, FIELD, BUTTON, BUTTON_LABEL, OUTLINE_BUTTON, OUTLINE_LABEL, BAR, ICON } from './constants';
import { ink, screen, setScreen, address, setAddress, status, busy, pageLabel, penMode, setPenMode, bookmarks, onTablet, relay, view,
  openUrl, goHome, showBlank, back, turn, firstPage, zoomTo, setView, tapAt, saveInk, exportPng, addBookmark, removeBookmark, saveRelay, setColour, setContrast, contrastValue, setEinkStyle, checkInbox, reader, toggleReader, refresh,
  tabList, tabIndex, scale, pageSize, full, setFullScreen, switchTab, closeTab, closeAllTabs, newTab, currentTab, Tab, SCREEN_PAGE, SCREEN_BOOKMARKS, SCREEN_SETTINGS, SCREEN_TABS, conf } from './state';
import { pageView, writing, swipe } from './pageview';
import { MAX_ZOOM } from './constants';
import { dashUrl, every, updated, widgetPreview, startDash, stopDash, setPeriod, dashView, widgetView, PERIODS, WIDGET_W, WIDGET_H } from './dashboard';
import { scripted, runScript } from './script';

/** A Lucide icon (zinc.json "icons" lists them: the name is a prop here), a short label where the icon alone would be ambiguous. */
function Btn(props: { icon?: string; label?: string; onClick: () => void; on?: boolean }): i32 {
  const on = props.on === true;
  return <Button className={on ? BUTTON : OUTLINE_BUTTON} onClick={props.onClick}>
    {props.icon !== undefined ? <Icon name={props.icon as string} size={ICON} strokeWidth={2} color={() => on ? 0xffffff : 0x000000} /> : null}
    {props.label !== undefined ? <Text className={on ? BUTTON_LABEL : OUTLINE_LABEL}>{props.label as string}</Text> : null}
  </Button>;
}

function Bookmarks(): i32 {
  return <ScrollView className="grow">
    <View className="flex-col gap-3 px-6 py-6">
      <Text className={TITLE}>Bookmarks</Text>
      {bookmarks().length === 0 ? <Text className={LABEL}>None yet: open a page and tap the bookmark + button.</Text> : null}
      {bookmarks().map((u: string) => <View className="flex-row gap-2 items-center py-2 border-b-2 border-black">
        <Text className={`grow w-0 break-all ${LABEL}`} numberOfLines={2}>{u}</Text>
        <Btn icon="arrow-right" on={true} onClick={() => openUrl(u)} />
        <Btn icon="layout-dashboard" onClick={() => startDash(u)} />
        <Btn icon="x" onClick={() => removeBookmark(u)} />
      </View>)}
    </View>
  </ScrollView>;
}

function Tabs(): i32 {
  return <ScrollView className="grow">
    <View className="flex-col gap-3 px-6 py-6">
      <Text className={TITLE}>Tabs</Text>
      <Text className={SMALL}>A page sent from the Mac opens in a new tab; the one you were reading stays here, at the same page.</Text>
      {tabList().map((t: Tab, i: i32) => <View className="flex-row gap-2 items-center py-2 border-b-2 border-black">
        <View className="flex-col grow w-0">
          <Text className={`${i === tabIndex() ? 'font-bold ' : ''}${LABEL}`} numberOfLines={1}>{(i === tabIndex() ? '▶ ' : '') + (t.title !== '' ? t.title : t.url)}</Text>
          {t.title !== '' ? <Text className={`break-all ${SMALL}`} numberOfLines={1}>{t.url}</Text> : null}
        </View>
        <Btn icon="arrow-right" on={i === tabIndex()} onClick={() => switchTab(i)} />
        <Btn icon="x" onClick={() => closeTab(i)} />
      </View>)}
      <View className="flex-row gap-2 pt-2"><Btn icon="plus" label="New tab" onClick={() => newTab(address())} /><Btn icon="x" label="Close all" onClick={() => closeAllTabs()} /></View>
    </View>
  </ScrollView>;
}

function Settings(): i32 {
  const [url, setUrl] = createSignal<string>(relay.url);
  const [token, setToken] = createSignal<string>(relay.token);
  const [contrast, setShown] = createSignal<number>(contrastValue(relay.contrast));
  const [eink, setEink] = createSignal<boolean>(relay.style === 'eink');
  return <View className="flex-col gap-4 px-6 py-6 grow">
    <Text className={TITLE}>Relay</Text>
    <Text className={SMALL}>The Mac that renders the pages: zinc run app/web-relay (over USB the Mac is http://10.11.99.2:8790).</Text>
    <Input className={FIELD} inputMode="url" value={url()} onInput={(v: string) => setUrl(v)} />
    <Text className={SMALL}>Its token (the relay prints it; empty when it runs with --no-token):</Text>
    <Input className={FIELD} value={token()} onInput={(v: string) => setToken(v)} />
    <View className="flex-row gap-2">
      <Btn icon="check" label="Save" on={true} onClick={() => { saveRelay(url(), token()); setScreen(SCREEN_PAGE); }} />
    </View>
    <Text className={`pt-4 ${TITLE}`}>Page</Text>
    <View className="flex-row gap-2">
      <Btn icon="palette" label="Colour" on={relay.mode === 'color'} onClick={() => setColour(relay.mode !== 'color')} />
      <Btn icon="book-open" label="E-ink style" on={eink()} onClick={() => { setEinkStyle(!eink()); setEink(relay.style === 'eink'); }} />
    </View>
    <View className="flex-row gap-2 items-center">
      <Text className={`w-[280px] ${LABEL}`}>{contrast() <= 1 ? 'Contrast: as is' : `Contrast: ${contrast().toFixed(1)}×`}</Text>
      <Btn icon="minus" onClick={() => { const v = Math.max(1, contrast() - 0.2); setShown(v); setContrast(v); }} />
      <View className="grow px-4 justify-center h-[88px]"><Slider min={1} max={4} step={0.2} value={contrast} onChange={(v: number) => { setShown(v); setContrast(v); }} /></View>
      <Btn icon="plus" onClick={() => { const v = Math.min(4, contrast() + 0.2); setShown(v); setContrast(v); }} />
    </View>
  </View>;
}

/** Dashboard mode: the page full screen, a thin bar, the period and the time of the last render; a tap on the page renders it now. */
function Dashboard(): i32 {
  return <View className={PAGE}>
    <RemarkableBar title="Dashboard" onQuit={() => quit()} />
    <Canvas className="grow" onDraw={dashView} />
    <View className={`${BAR} border-t-2 border-black`}>
      <Text className={`truncate ${SMALL}`}>{updated() === '' ? (busy() ? 'Loading…' : status()) : 'Updated ' + updated() + ' · every'}</Text>
      {PERIODS.map((m: i32) => <Btn label={m.toString() + ' min'} on={m === every()} onClick={() => setPeriod(m)} />)}
      <View className="grow" />
      <Btn icon="book-open-text" label="Reader" onClick={() => stopDash()} />
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

/** The page with the writing tools floating over its top: unfolding them does not change the page view's size (which would render the page again). */
function Page(): i32 {
  return <View className="grow relative">
    <ZoomView className="grow" zoom={() => view.zoom} maxZoom={MAX_ZOOM} draw={pageView} picture={() => ink.img} writing={writing}
      onView={setView} onSwipe={swipe} onTap={(x: number, y: number) => { tapAt(x, y); }} onWheel={(s: number) => { turn(s > 0 ? -1 : 1); }} />
    <View className="absolute top-0 left-0 right-0"><InkPalette ink={ink} open={false} /></View>
  </View>;
}

/** Full screen: the top bar, one thin row (back to the normal view, the page, its size), the page. Swipes still turn pages. */
function FullReader(): i32 {
  return <View className={PAGE}>
    <RemarkableBar title="Web" onQuit={() => { if (saveInk()) quit(); }} />
    <View className={`${BAR} border-b-2 border-black`}>
      <Btn icon="minimize" onClick={() => setFullScreen(false)} />
      <View className="grow" />
      <Text className={LABEL}>{pageLabel()}</Text>
      <Btn icon="a-arrow-down" onClick={() => pageSize(-1)} />
      <Btn icon="a-arrow-up" onClick={() => pageSize(1)} />
    </View>
    <Page />
  </View>;
}

function Reader(): i32 {
  return <View className={PAGE}>
    <RemarkableBar title="Web" onQuit={() => { if (saveInk()) quit(); }} />
    <View className={`${BAR} pt-3`} onSubmit={() => openUrl(address())}>
      <Btn icon="arrow-left" onClick={() => back()} />
      <Btn icon="house" onClick={() => goHome()} />
      <Input className={`grow ${FIELD}`} inputMode="url" value={address()} onInput={(v: string) => setAddress(v)} />
      <Btn icon="x" onClick={() => showBlank()} />
      <Btn icon="arrow-right" on={true} onClick={() => openUrl(address())} />
    </View>
    <View className={`${BAR} pb-3 border-b-2 border-black`}>
      <Btn icon="layers" label={tabList().length.toString()} on={screen() === SCREEN_TABS} onClick={() => setScreen(screen() === SCREEN_TABS ? SCREEN_PAGE : SCREEN_TABS)} />
      <Btn icon="bookmark" on={screen() === SCREEN_BOOKMARKS} onClick={() => setScreen(screen() === SCREEN_BOOKMARKS ? SCREEN_PAGE : SCREEN_BOOKMARKS)} />
      <Btn icon="bookmark-plus" onClick={() => addBookmark()} />
      <Btn icon="book-open-text" on={reader()} onClick={() => toggleReader()} />
      <View className="grow" />
      {onTablet ? null : <Btn icon="pen-line" on={penMode()} onClick={() => setPenMode(!penMode())} />}
      <Btn icon="save" onClick={() => saveInk()} />
      <Btn icon="image-down" onClick={() => exportPng()} />
      <Btn icon="settings" on={screen() === SCREEN_SETTINGS} onClick={() => setScreen(screen() === SCREEN_SETTINGS ? SCREEN_PAGE : SCREEN_SETTINGS)} />
    </View>
    {screen() === SCREEN_PAGE ? <Page />
      : screen() === SCREEN_BOOKMARKS ? <Bookmarks /> : screen() === SCREEN_TABS ? <Tabs /> : <Settings />}
    <View className={`${BAR} border-t-2 border-black`}>
      <Btn icon="arrow-up-to-line" onClick={() => firstPage()} />
      <Btn icon="chevron-up" onClick={() => turn(-1)} />
      <Text className={`w-[200px] text-center ${LABEL}`}>{pageLabel()}</Text>
      <Btn icon="chevron-down" on={true} onClick={() => turn(1)} />
      <View className="w-4" />
      <Btn icon="zoom-out" onClick={() => zoomTo(view.zoom / 1.5, view.w / 2, view.h / 2)} />
      <Btn icon="zoom-in" onClick={() => zoomTo(view.zoom * 1.5, view.w / 2, view.h / 2)} />
      <View className="w-4" />
      <Btn icon="a-arrow-down" onClick={() => pageSize(-1)} />
      <Text className={`w-[110px] text-center ${SMALL}`}>{Math.round(scale() * 50).toString() + ' %'}</Text>
      <Btn icon="a-arrow-up" onClick={() => pageSize(1)} />
      <View className="grow" />
      <Btn icon="maximize" onClick={() => { setScreen(SCREEN_PAGE); setFullScreen(true); }} />
      <Btn icon="refresh-cw" onClick={() => refresh()} />
    </View>
    <View className="px-4 py-2 border-t-2 border-black">
      {/* one line, cut with …: a status that wrapped (a long URL) made the page view shorter, which rendered the page again, whose
          new status was shorter: the page loaded forever */}
      <Text className={`truncate ${SMALL}`}>{busy() ? 'Loading…' : status()}</Text>
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
