// Zinc Hub (ZN-843): the app store of the reMarkable. It pairs with a hub server (app/hub-server), lists its apps, installs, updates and rolls
// them back after checking the catalog's signature, the app's and the SHA-256, and gives each installed app its own AppLoad tile (zinc-tile).
// E-paper: black on white, large targets, no animation; only the status line and a changed row redraw.
import { render } from 'zinc:ui/solid';
import { setPressFeedback } from 'zinc:ui';
import { RemarkableBar, RemarkableKeyboard } from 'zinc:remarkable';
import { PAGE, LABEL, TITLE, OUTLINE_BUTTON, OUTLINE_LABEL, BUTTON, BUTTON_LABEL } from './constants';
import { page, openPage, status, busy, paired, refresh, stuck, watchRunning, PAGE_APPS, PAGE_SETTINGS, PAGE_RUNNING, PAGE_INFO } from './state';
import { InfoPage } from './pages/info';
import { task, step, failure } from './services/progress';
import { dismiss, consent, allowConsent, cancelConsent, Consent } from './state';
import { AppsPage } from './pages/apps';
import { SettingsPage } from './pages/settings';
import { RunningPage, StuckBanner } from './pages/running';
import { scripted, runScript } from './script';

function Tab(props: { label: string; index: i32 }): i32 {
  const on = (): boolean => page() === props.index;
  return <Button className={on() ? BUTTON : OUTLINE_BUTTON} onClick={() => openPage(props.index)}>
    <Text className={on() ? BUTTON_LABEL : OUTLINE_LABEL}>{props.label}</Text>
  </Button>;
}

/** While an action runs: what it is and its current step, over the hub (not over the top bar: Quit stays), which takes no tap until it
 *  ends (no way to close it). A failure stays with OK. Drawn once per step, not animated: e-paper. */
function Activity(): i32 {
  return <View className="absolute top-0 left-0 right-0 bottom-0 items-center justify-center bg-white" onClick={() => {}}>
    <View className="flex-col gap-8 w-[1200px] p-12 border-4 border-black rounded-lg bg-white">
      <Text className={TITLE}>{failure() !== '' ? `${task()}: failed` : `${task()}…`}</Text>
      <Text className={LABEL}>{failure() !== '' ? failure() : step() !== '' ? step() : 'Starting.'}</Text>
      {failure() !== '' ? <View className="flex-row"><Button className={BUTTON} onClick={() => dismiss()}><Text className={BUTTON_LABEL}>OK</Text></Button></View>
        : <Text className={LABEL}>Please wait: the Hub takes no other action until this one ends.</Text>}
    </View>
  </View>;
}

/** Before an install (or an update that asks for more): what the app says it uses, Allow or Cancel. Nothing is downloaded before Allow. */
function ConsentBox(): i32 {
  const c = consent() as Consent;
  return <View className="absolute top-0 left-0 right-0 bottom-0 items-center justify-center bg-white" onClick={() => {}}>
    <View className="flex-col gap-6 w-[1300px] p-12 border-4 border-black rounded-lg bg-white">
      <Text className={TITLE}>{c.title}</Text>
      <Text className={LABEL}>It says it will:</Text>
      {c.lines.map((l: string) => <Text className={`font-bold ${LABEL}`}>{`• ${l}`}</Text>)}
      <Text className={LABEL}>Zinc on the reMarkable does not stop an app from doing more than it says yet: allow only apps you trust.</Text>
      <View className="flex-row gap-6">
        <Button className={BUTTON} onClick={() => { allowConsent(); }}><Text className={BUTTON_LABEL}>Allow</Text></Button>
        <Button className={OUTLINE_BUTTON} onClick={() => cancelConsent()}><Text className={OUTLINE_LABEL}>Cancel</Text></Button>
      </View>
    </View>
  </View>;
}

function App(): i32 {
  return <View className={PAGE}>
    <RemarkableBar title="Zinc Hub" />
    <View className="flex-col grow relative">
    <View className="flex-row gap-6 px-10 pt-8">
      <Tab label="Apps" index={PAGE_APPS} />
      <Tab label="Running" index={PAGE_RUNNING} />
      <Tab label="Info" index={PAGE_INFO} />
      <Tab label="Settings" index={PAGE_SETTINGS} />
    </View>
    {stuck().length > 0 ? <StuckBanner /> : null}
    <View className="flex-col grow">{page() === PAGE_APPS ? <AppsPage /> : page() === PAGE_RUNNING ? <RunningPage /> : page() === PAGE_INFO ? <InfoPage /> : <SettingsPage />}</View>
    <View className="px-10 py-6 border-t-2 border-black">
      <Text className={LABEL}>{busy() ? 'Working…' : status()}</Text>
    </View>
    {task() !== '' ? <Activity /> : consent() !== null ? <ConsentBox /> : null}
    </View>
    <RemarkableKeyboard />
  </View>;
}

// a pressed button fading in and out would ghost on e-paper and cost a dozen refreshes: it keeps its look while pressed
setPressFeedback(false);
render(App, 0xffffff, null);
async function start(): Promise<void> {
  watchRunning();
  if (paired()) await refresh();   // check for updates at start
  if (scripted()) await runScript();
}
start();
