// The Store: "All" lists every app of the server, compact, with what it is, who makes it, its size and what it uses, and Install / Update;
// "Installed" keeps the installed ones up: Update, Rollback, the channel, Pin to sidebar, Reset data and Uninstall (the last two ask twice).
import { TITLE, LABEL, SMALL, STABLE, HUB_ID, BUTTON, BUTTON_LABEL, OUTLINE_BUTTON, OUTLINE_LABEL } from '../constants';
import { AppRow, rows, paired, refresh, installApp, rollbackApp, setChannel, uninstallApp, resetApp, togglePin, armed, storeTab, setStoreTab,
  STORE_ALL, STORE_INSTALLED } from '../state';
import { SolidButton, OutlineButton } from '../components/buttons';
import { Icon } from './apps';

function sizeOf(r: AppRow): string {
  return r.size >= 1048576 ? `${(r.size / 1048576).toFixed(1)} MB` : r.size > 0 ? `${Math.max(1, Math.round(r.size / 1024))} KB` : '';
}
function versionLine(r: AppRow): string {
  const parts: string[] = [];
  parts.push(r.installed !== '' ? `Installed ${r.installed}` : 'Not installed');
  parts.push(!r.inCatalog ? 'no longer on the server' : r.available === '' ? `nothing on ${r.channel}` : r.updatable ? `${r.available} available` : `${r.channel} ${r.available}`);
  if (sizeOf(r) !== '') parts.push(sizeOf(r));
  return parts.join(' · ');
}
/** What it says it uses, as the consent screen words it. */
function usesLine(r: AppRow): string { return !r.declared ? 'Uses: does not say' : r.uses === '' ? 'Uses: nothing sensitive' : `Uses: ${r.uses}`; }

/** All: one compact row per app of the server. */
function CatalogRow(props: { row: AppRow }): i32 {
  const r = props.row;
  return <View className="flex-row gap-6 py-6 border-b-2 border-black">
    <Icon row={r} size={110} />
    <View className="flex-col gap-2 grow w-0">
      <Text className={`truncate font-bold ${LABEL}`}>{r.author !== '' ? `${r.name} · by ${r.author}` : r.name}</Text>
      {r.description !== '' ? <Text className={SMALL} numberOfLines={2}>{r.description}</Text> : null}
      <Text className={`truncate ${SMALL}`}>{versionLine(r)}</Text>
      <Text className={SMALL} numberOfLines={2}>{usesLine(r)}</Text>
    </View>
    <View className="w-[300px] items-end justify-center">
      {r.installed === '' && r.available !== '' ? <SolidButton label="Install" onClick={() => installApp(r.id)} />
        : r.updatable ? <SolidButton label="Update" onClick={() => installApp(r.id)} />
        : r.installed !== '' ? <Text className={SMALL}>Installed</Text> : null}
    </View>
  </View>;
}

/** Installed: what can be done to an installed app; the buttons wrap onto a second line. */
function InstalledRow(props: { row: AppRow }): i32 {
  const r = props.row;
  const other = r.channel === STABLE ? 'beta' : STABLE;
  const self = r.id === HUB_ID;
  return <View className="flex-col gap-4 py-6 border-b-2 border-black">
    <View className="flex-row gap-6 items-center">
      <Icon row={r} size={110} />
      <View className="flex-col gap-2 grow w-0">
        <Text className={`truncate font-bold ${LABEL}`}>{self ? `${r.name} · this app` : r.name}</Text>
        <Text className={`truncate ${SMALL}`}>{versionLine(r)}</Text>
      </View>
    </View>
    <View className="flex-row flex-wrap gap-4">
      {r.updatable ? <SolidButton label={`Update to ${r.available}`} onClick={() => installApp(r.id)} /> : null}
      {r.canRollback ? <OutlineButton label={`Rollback to ${r.previous}`} onClick={() => rollbackApp(r.id)} /> : null}
      {r.inCatalog && (r.channels.indexOf(other) >= 0 || r.channel !== STABLE) ? <OutlineButton label={`Channel: ${r.channel}`} onClick={() => setChannel(r.id, other)} /> : null}
      {!self ? <OutlineButton label={r.pinned ? 'Unpin from sidebar' : 'Pin to sidebar'} onClick={() => togglePin(r.id)} /> : null}
      {!self ? <OutlineButton label={armed() === 'reset:' + r.id ? 'Confirm reset' : 'Reset data'} onClick={() => resetApp(r.id)} /> : null}
      {!self ? <OutlineButton label={armed() === r.id ? 'Confirm uninstall' : 'Uninstall'} onClick={() => uninstallApp(r.id)} /> : null}
    </View>
  </View>;
}

function StoreTab(props: { label: string; tab: string }): i32 {
  const on = (): boolean => storeTab() === props.tab;
  return <Button className={on() ? BUTTON : OUTLINE_BUTTON} onClick={() => setStoreTab(props.tab)}>
    <Text className={on() ? BUTTON_LABEL : OUTLINE_LABEL}>{props.label}</Text>
  </Button>;
}

export function StorePage(): i32 {
  const all = (): AppRow[] => rows().filter((r: AppRow) => r.inCatalog);
  const mine = (): AppRow[] => rows().filter((r: AppRow) => r.installed !== '');
  return <View className="flex-col gap-6 p-10 grow">
    <View className="flex-row gap-6 items-center">
      <Text className={`grow ${TITLE}`}>Store</Text>
      <StoreTab label="All" tab={STORE_ALL} />
      <StoreTab label={`Installed ${mine().length}`} tab={STORE_INSTALLED} />
      <OutlineButton label="Check" onClick={() => refresh()} />
    </View>
    {!paired() ? <Text className={LABEL}>Pair this tablet with a server in Settings.</Text>
      : storeTab() === STORE_ALL && all().length === 0 ? <Text className={LABEL}>The server has no apps yet.</Text>
      : storeTab() === STORE_INSTALLED && mine().length === 0 ? <Text className={LABEL}>No app installed yet.</Text> : null}
    <ScrollView className="grow">
      <View className="flex-col">
        {(storeTab() === STORE_ALL ? all() : []).map((r: AppRow) => <CatalogRow row={r} />)}
        {(storeTab() === STORE_INSTALLED ? mine() : []).map((r: AppRow) => <InstalledRow row={r} />)}
      </View>
    </ScrollView>
  </View>;
}
