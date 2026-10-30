// The first screen: the folders to sort, where the albums go, moved or copied, and the albums themselves.
import { createSignal, For, Show } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { THEME, colorOf } from 'zinc:trieur';
import { open, OpenOptions } from 'zinc:system/dialog';
import { t } from '../i18n';
import { settings, setSettings, setAlbums } from '../state';
import { baseName, type Album } from '../library';
import { Section, Pill, Choice } from '../components/ui';

const COLORS = ['#f43f5e', '#0ea5e9', '#22c55e', '#eab308', '#6366f1', '#d946ef', '#f97316', '#64748b'];

async function pickFolders(multiple: boolean): Promise<string[]> {
  const o = new OpenOptions();
  o.directory = true;
  o.multiple = multiple;
  return (await open(o)) ?? [];
}

export function Setup(p: { count: () => number; scanning: () => boolean; onStart: () => void }): any {
  const [name, setName] = createSignal('');
  const addSources = async () => {
    const picked = await pickFolders(true);
    const s = settings().sources;
    setSettings({ sources: [...s, ...picked.filter((x) => !s.includes(x))] });
  };
  const addAlbum = () => {
    const label = name().trim();
    if (!label || settings().albums.some((a) => a.label === label)) return;
    const n = settings().albums.length;
    setAlbums([...settings().albums, { id: 'a' + Date.now(), label, icon: 'folder', color: COLORS[n % COLORS.length]! }]);
    setName('');
  };
  return <View className="grow flex-col"><ScrollView className="grow">
    <View className="w-full max-w-[760] self-center px-6 py-8 gap-4">
      <View className="gap-2 pb-2">
        <Text className="text-[30px] font-bold" style={{ color: THEME.ink }}>{t.title}</Text>
        <Text className="text-[14px] leading-[20px]" style={{ color: THEME.body }}>{t.tagline}</Text>
      </View>

      <Section title={() => t.sources} icon="folder-open">
        <For each={settings().sources}>{(src: string) => <View className="flex-row items-center gap-3 h-[44] px-3 rounded-[11]" style={{ backgroundColor: THEME.chip }}>
          <Icon name="folder" size={18} color={() => THEME.accent} />
          <View className="grow min-w-0">
            <Text className="text-[13px] font-semibold" numberOfLines={1} style={{ color: THEME.ink }}>{baseName(src)}</Text>
            <Text className="text-[11px]" numberOfLines={1} style={{ color: THEME.dim }}>{src}</Text>
          </View>
          <Button onClick={() => setSettings({ sources: settings().sources.filter((x) => x !== src) })} className="w-[28] h-[28] rounded-full items-center justify-center">
            <Icon name="x" size={15} color={() => THEME.dim} />
          </Button>
        </View>}</For>
        <Show when={settings().sources.length === 0}><Text className="text-[13px]" style={{ color: THEME.dim }}>{t.noSource}</Text></Show>
        <View className="flex-row"><Pill label={() => t.addFolder} icon="folder-plus" onClick={() => void addSources()} /></View>
      </Section>

      <Section title={() => t.output} icon="folder-tree">
        <Choice value={() => (settings().output === '' ? 'in' : 'other')} onPick={async (v: string) => {
          if (v === 'in') { setSettings({ output: '' }); return; }
          const [dir] = await pickFolders(false);
          if (dir) setSettings({ output: dir });
        }} options={[{ v: 'in', label: () => t.inSource, icon: 'folder-input' }, { v: 'other', label: () => t.otherFolder, icon: 'folder-output' }]} />
        <Show when={settings().output !== ''}>
          <View className="flex-row items-center gap-2">
            <Icon name="corner-down-right" size={15} color={() => THEME.dim} />
            <Text className="text-[13px] grow" numberOfLines={1} style={{ color: THEME.body }}>{settings().output}</Text>
          </View>
        </Show>
        <Text className="text-[13px] pt-1" style={{ color: THEME.ink }}>{t.mode}</Text>
        <Choice value={() => settings().mode} onPick={(v: 'move' | 'copy') => setSettings({ mode: v })}
          options={[{ v: 'move', label: () => t.moved, icon: 'move-right' }, { v: 'copy', label: () => t.copied, icon: 'copy' }]} />
        <Text className="text-[12px]" style={{ color: THEME.dim }}>{settings().mode === 'move' ? t.moveHint : t.copyHint}</Text>
      </Section>

      <Section title={() => t.albums} icon="library">
        <View className="flex-row flex-wrap gap-2">
          <For each={settings().albums}>{(a: Album) => <View className="h-[36] pl-2 pr-1 rounded-full flex-row items-center gap-2" style={{ backgroundColor: THEME.chip, borderWidth: 1, borderColor: THEME.cardLine }}>
            <View className="w-[24] h-[24] rounded-full items-center justify-center" style={{ backgroundColor: colorOf(a) }}><Icon name={a.icon} size={13} color={() => 0xffffff} /></View>
            <Text className="text-[13px] font-medium" style={{ color: THEME.ink }}>{a.label}</Text>
            <Button onClick={() => setAlbums(settings().albums.filter((x) => x.id !== a.id))} className="w-[24] h-[24] rounded-full items-center justify-center">
              <Icon name="x" size={13} color={() => THEME.dim} />
            </Button>
          </View>}</For>
          <View className="h-[36] pl-2 pr-2 rounded-full flex-row items-center gap-2" style={{ backgroundColor: 0xef4444 }}>
            <Icon name="trash" size={14} color={() => 0xffffff} />
            <Text className="text-[13px] font-semibold text-white">{t.trash}</Text>
          </View>
        </View>
        <View className="flex-row gap-2 items-center">
          <Input value={name()} onInput={(v: string) => setName(v)} onChange={() => addAlbum()} placeholder={t.newAlbum}
            className="h-[38] px-3 rounded-[11] w-[260]" style={{ backgroundColor: THEME.chip, color: THEME.ink, borderWidth: 1, borderColor: THEME.cardLine }} />
          <Pill label={() => t.add} icon="plus" onClick={addAlbum} />
        </View>
      </Section>

    </View>
  </ScrollView>
  <View className="h-[68] shrink-0 flex-row items-center justify-center gap-3 px-6" style={{ borderTopWidth: 1, borderColor: THEME.cardLine }}>
    <Text className="text-[13px]" style={{ color: THEME.dim }}>{settings().sources.length ? settings().sources.map(baseName).join(' · ') : ''}</Text>
    <Pill primary label={() => (p.scanning() ? t.scanning : t.start(p.count()))} icon="sparkles" onClick={p.onStart} disabled={() => p.count() === 0 || settings().albums.length === 0} />
  </View></View>;
}
