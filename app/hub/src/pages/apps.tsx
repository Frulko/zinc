// Apps: the catalog of the server with what is installed, one row per app: Open, Install, Update, Rollback and the channel.
import { SECTION, TITLE, LABEL, SMALL, STABLE } from '../constants';
import { AppRow, rows, paired, refresh, installApp, rollbackApp, setChannel, openApp } from '../state';
import { SolidButton, OutlineButton } from '../components/buttons';
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

/** The app's icon (zinc.json app.icon, from its package), or a framed square with its initial. */
function Icon(props: { row: AppRow }): i32 {
  const r = props.row;
  if (r.icon !== '' && picture(r) >= 0) return <Canvas className="w-[120px] h-[120px]" onDraw={(x: i32, y: i32, w: i32, h: i32) => drawImage(picture(r), x, y, w, h, 255, 0)} />;
  return <View className="w-[120px] h-[120px] items-center justify-center border-4 border-black rounded-lg">
    <Text className={TITLE}>{r.name.slice(0, 1).toUpperCase()}</Text>
  </View>;
}

function versionLine(r: AppRow): string {
  const have = r.installed !== '' ? `Installed ${r.installed}` : 'Not installed';
  const offer = r.available === '' ? `nothing on ${r.channel}` : r.updatable ? `${r.available} available` : `${r.channel} ${r.available}`;
  return `${have} · ${offer}`;
}

function Row(props: { row: AppRow }): i32 {
  const r = props.row;
  const other = r.channel === STABLE ? 'beta' : STABLE;
  return <View className="flex-col gap-4 py-6 border-b-2 border-black">
    <View className="flex-row gap-6 items-center">
      <Icon row={r} />
      <View className="flex-col gap-2 grow">
        <Text className={TITLE}>{r.name}</Text>
        <Text className={SMALL}>{r.id}</Text>
      </View>
    </View>
    <Text className={LABEL}>{versionLine(r)}</Text>
    <View className="flex-row gap-6">
      {r.installed !== '' ? <SolidButton label="Open" onClick={() => openApp(r.id)} /> : null}
      {r.installed === '' && r.available !== '' ? <SolidButton label="Install" onClick={() => installApp(r.id)} /> : null}
      {r.updatable ? <SolidButton label={`Update to ${r.available}`} onClick={() => installApp(r.id)} /> : null}
      {r.canRollback ? <OutlineButton label={`Rollback to ${r.previous}`} onClick={() => rollbackApp(r.id)} /> : null}
      {r.channels.indexOf(other) >= 0 || r.channel !== STABLE ? <OutlineButton label={`Channel: ${r.channel}`} onClick={() => setChannel(r.id, other)} /> : null}
    </View>
  </View>;
}

export function AppsPage(): i32 {
  return <View className={`${SECTION} grow`}>
    <View className="flex-row justify-between items-center">
      <Text className={TITLE}>Apps</Text>
      <OutlineButton label="Check for updates" onClick={() => refresh()} />
    </View>
    {!paired() ? <Text className={LABEL}>Pair this tablet with a server in Settings.</Text>
      : rows().length === 0 ? <Text className={LABEL}>The server has no apps yet.</Text> : null}
    <ScrollView className="grow">
      <View className="flex-col">{rows().map((r: AppRow) => <Row row={r} />)}</View>
    </ScrollView>
  </View>;
}
