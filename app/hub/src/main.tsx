// Zinc Hub (ZN-843): the app store of the reMarkable. It pairs with a hub server (app/hub-server), lists its apps, installs, updates and rolls
// them back after checking the catalog's signature, the app's and the SHA-256, and gives each installed app its own AppLoad tile (zinc-tile).
// E-paper: black on white, large targets, no animation; only the status line and a changed row redraw.
import { render } from 'zinc:ui/solid';
import { setPressFeedback } from 'zinc:ui';
import { RemarkableBar, RemarkableKeyboard } from 'zinc:remarkable';
import { PAGE, LABEL, OUTLINE_BUTTON, OUTLINE_LABEL, BUTTON, BUTTON_LABEL } from './constants';
import { page, setPage, status, busy, paired, refresh, PAGE_APPS, PAGE_SETTINGS } from './state';
import { AppsPage } from './pages/apps';
import { SettingsPage } from './pages/settings';
import { scripted, runScript } from './script';

function Tab(props: { label: string; index: i32 }): i32 {
  const on = (): boolean => page() === props.index;
  return <Button className={on() ? BUTTON : OUTLINE_BUTTON} onClick={() => setPage(props.index)}>
    <Text className={on() ? BUTTON_LABEL : OUTLINE_LABEL}>{props.label}</Text>
  </Button>;
}

function App(): i32 {
  return <View className={PAGE}>
    <RemarkableBar title="Zinc Hub" />
    <View className="flex-row gap-6 px-10 pt-8">
      <Tab label="Apps" index={PAGE_APPS} />
      <Tab label="Settings" index={PAGE_SETTINGS} />
    </View>
    <View className="flex-col grow">{page() === PAGE_APPS ? <AppsPage /> : <SettingsPage />}</View>
    <View className="px-10 py-6 border-t-2 border-black">
      <Text className={LABEL}>{busy() ? 'Working…' : status()}</Text>
    </View>
    <RemarkableKeyboard />
  </View>;
}

// a pressed button fading in and out would ghost on e-paper and cost a dozen refreshes: it keeps its look while pressed
setPressFeedback(false);
render(App, 0xffffff, null);
async function start(): Promise<void> {
  if (paired()) await refresh();   // check for updates at start
  if (scripted()) await runScript();
}
start();
