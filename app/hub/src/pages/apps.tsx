// Apps, the home page: the installed apps as a grid of large tiles, a tap opens one. A badge says an update waits or the app is not
// responding; the engine's update shows above. Everything else (install, update, rollback, pin, reset, uninstall) is in the Store.
import { SECTION, TITLE, LABEL, SMALL, HUB_ID } from '../constants';
import { AppRow, rows, paired, openApp, stuck, engineOffer, engineNow, updateEngine, updateAll, updatesWaiting } from '../state';
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
export function Icon(props: { row: AppRow; size: i32; bare?: boolean }): i32 {
  const r = props.row, s = props.size;
  if (r.icon !== '' && picture(r) >= 0) return <Canvas style={{ width: s, height: s }} onDraw={(x: i32, y: i32, w: i32, h: i32) => drawImage(picture(r), x, y, w, h, 255, 0)} />;
  return <View className={props.bare ? 'items-center justify-center' : 'items-center justify-center border-4 border-black rounded-lg'} style={{ width: s, height: s }}>
    <Text className={TITLE}>{r.name.slice(0, 1).toUpperCase()}</Text>
  </View>;
}

function hung(r: AppRow): boolean { return stuck().some((a: RunningApp) => a.name === r.name); }

/** One tile, as iOS's home screen draws it: the icon in a rounded square, the name under it, small; a round badge on the corner, a dot
 *  when an update waits, "!" when the app does not respond. Six to a row on the portrait page (6 x 220 + 5 x 40 = 1520, in the 1540 px
 *  inside its padding: no rounding pushes one down). */
function Tile(props: { row: AppRow }): i32 {
  const r = props.row;
  const badge = hung(r) ? '!' : r.updatable ? ' ' : '';
  return <Button className="w-[220px] flex-col items-center gap-3 bg-white focus:bg-white" onClick={() => openApp(r.id)}>
    <View className="w-[220px] h-[196px] items-center justify-center">
      <View className="w-[176px] h-[176px] items-center justify-center border-2 border-black rounded-[40px]"><Icon row={r} size={112} bare={true} /></View>
      {badge !== '' ? <View className="absolute top-0 right-[6px] w-[48px] h-[48px] items-center justify-center rounded-full bg-black border-4 border-white">
        <Text className="text-[28px] font-bold text-white">{badge}</Text></View> : null}
    </View>
    <Text className="w-[220px] truncate text-center text-[26px] text-black">{r.name}</Text>
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
  return <View className={`${SECTION} grow`}>
    <View className="flex-row justify-between items-center">
      <Text className={TITLE}>Apps</Text>
      {updatesWaiting() > 0 ? <SolidButton label={`Update all (${updatesWaiting()})`} onClick={() => updateAll()} /> : null}
    </View>
    {engineOffer() !== '' ? <EngineBanner /> : null}
    {mine().length === 0 ? <Text className={LABEL}>{paired() ? 'No app installed yet: find one in the Store.' : 'Pair this tablet with a server in Settings, then find apps in the Store.'}</Text> : null}
    <ScrollView className="grow">
      <View className="flex-row flex-wrap gap-x-10 gap-y-10 pb-10">{mine().map((r: AppRow) => <Tile row={r} />)}</View>
    </ScrollView>
    <Text className={SMALL}>Tap an app to open it. The Store installs, updates, pins and removes apps.</Text>
  </View>;
}
