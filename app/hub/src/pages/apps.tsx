// Apps: the catalog of the server with what is installed, one row per app: Install, Update, Rollback and the channel.
import { SECTION, TITLE, LABEL, SMALL, STABLE } from '../constants';
import { AppRow, rows, paired, refresh, installApp, rollbackApp, setChannel } from '../state';
import { SolidButton, OutlineButton } from '../components/buttons';

function versionLine(r: AppRow): string {
  const have = r.installed !== '' ? `Installed ${r.installed}` : 'Not installed';
  const offer = r.available === '' ? `nothing on ${r.channel}` : r.updatable ? `${r.available} available` : `${r.channel} ${r.available}`;
  return `${have} · ${offer}`;
}

function Row(props: { row: AppRow }): i32 {
  const r = props.row;
  const other = r.channel === STABLE ? 'beta' : STABLE;
  return <View className="flex-col gap-4 py-6 border-b-2 border-black">
    <View className="flex-row justify-between items-end">
      <Text className={TITLE}>{r.name}</Text>
      <Text className={SMALL}>{r.id}</Text>
    </View>
    <Text className={LABEL}>{versionLine(r)}</Text>
    <View className="flex-row gap-6">
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
