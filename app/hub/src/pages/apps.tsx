// Apps, the home page: the installed apps as a grid of large tiles, a tap opens one. A badge says an update waits or the app is not
// responding; the engine's update shows above. Everything else (install, update, rollback, pin, reset, uninstall) is in the Store.
import { SECTION, TITLE, LABEL, SMALL, HUB_ID } from '../constants';
import { AppRow, rows, paired, openApp, openPage, setStoreTab, stuck, engineOffer, engineNow, updateEngine, PAGE_STORE, STORE_INSTALLED } from '../state';
import { RunningApp } from '../services/running';
import { SolidButton } from '../components/buttons';
import * as fs from 'zinc:fs';
import { imageFromBytes, drawImage } from 'zinc:gfx';

// the decoded icons by SHA-256: a row redrawn keeps its picture, a new icon of the app is another key
// ponytail: never freed; a few icons of 150 px (90 KB each) for a catalog of a few apps
const pictures = new Map<string, i32>();
function picture(r: AppRow): i32 {
  if (!pictures.has(r.iconSha256)) {
    let img: i32 = -1;
    try { img = imageFromBytes(fs.readBytes(r.icon)); } catch (e) { }
    pictures.set(r.iconSha256, img);
  }
  return pictures.get(r.iconSha256) as i32;
}

/** The app's icon (zinc.json app.icon, from its package), or a framed square with its initial; `size` in pixels. */
export function Icon(props: { row: AppRow; size: i32 }): i32 {
  const r = props.row, s = props.size;
  if (r.icon !== '' && picture(r) >= 0) return <Canvas style={{ width: s, height: s }} onDraw={(x: i32, y: i32, w: i32, h: i32) => drawImage(picture(r), x, y, w, h, 255, 0)} />;
  return <View className="items-center justify-center border-4 border-black rounded-lg" style={{ width: s, height: s }}>
    <Text className={TITLE}>{r.name.slice(0, 1).toUpperCase()}</Text>
  </View>;
}

function hung(r: AppRow): boolean { return stuck().some((a: RunningApp) => a.name === r.name); }

/** One tile: the icon, the name, and its badge. */
function Tile(props: { row: AppRow }): i32 {
  const r = props.row;
  const badge = hung(r) ? 'Not responding' : r.updatable ? 'Update' : '';
  return <Button className="w-[460px] h-[400px] flex-col items-center justify-center gap-6 border-2 border-black rounded-lg bg-white focus:bg-white"
    onClick={() => openApp(r.id)}>
    <Icon row={r} size={200} />
    <Text className={`truncate font-bold ${LABEL}`}>{r.name}</Text>
    {badge !== '' ? <View className="px-6 py-2 rounded-full bg-black"><Text className="text-[26px] font-bold text-white">{badge}</Text></View>
      : <View className="h-[46px]" />}
  </Button>;
}

/** The engine on the tablet, when the server offers a newer one (ZN-844). */
function EngineBanner(): i32 {
  const now = engineNow();
  return <View className="flex-row items-center justify-between gap-6 p-6 border-4 border-black rounded-lg">
    <Text className={`grow ${LABEL}`}>{`Zinc engine ${now !== '' ? now : 'installed'} · ${engineOffer()} available`}</Text>
    <SolidButton label="Update the engine" onClick={() => updateEngine()} />
  </View>;
}

export function AppsPage(): i32 {
  // the Hub itself is not a tile: it is open already (its updates are in Store › Installed)
  const mine = (): AppRow[] => rows().filter((r: AppRow) => r.installed !== '' && r.id !== HUB_ID);
  const waiting = (): i32 => rows().filter((r: AppRow) => r.updatable).length;
  return <View className={`${SECTION} grow`}>
    <View className="flex-row justify-between items-center">
      <Text className={TITLE}>Apps</Text>
      {waiting() > 0 ? <SolidButton label={waiting() === 1 ? '1 update' : `${waiting()} updates`} onClick={() => { setStoreTab(STORE_INSTALLED); openPage(PAGE_STORE); }} /> : null}
    </View>
    {engineOffer() !== '' ? <EngineBanner /> : null}
    {mine().length === 0 ? <Text className={LABEL}>{paired() ? 'No app installed yet: find one in the Store.' : 'Pair this tablet with a server in Settings, then find apps in the Store.'}</Text> : null}
    <ScrollView className="grow">
      <View className="flex-row flex-wrap gap-10">{mine().map((r: AppRow) => <Tile row={r} />)}</View>
    </ScrollView>
    <Text className={SMALL}>Tap an app to open it. The Store installs, updates, pins and removes apps.</Text>
  </View>;
}
