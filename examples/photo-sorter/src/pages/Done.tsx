// The summary: what went where (each album opens in the Finder), and the trash, emptied into the system's or put back.
import { createSignal, For, Show } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { openPath, trash } from 'zinc:system/opener';
import { THEME, colorOf } from 'zinc:trieur';
import { t } from '../i18n';
import { settings, setScreen, trashed, setTrashed, filed } from '../state';
import { revert, dirName, removeIfEmpty, type Album } from '../library';
import { Section, Pill } from '../components/ui';

export function Done(): any {
  const [note, setNote] = createSignal('');
  const total = () => Object.values(filed()).reduce((n, f) => n + f.n, 0);
  const albums = () => settings().albums.filter((a) => (filed()[a.id]?.n ?? 0) > 0);
  const tidy = (dirs: string[]) => { for (const d of new Set(dirs)) removeIfEmpty(d); };
  const empty = () => {
    const ops = trashed();
    let n = 0;
    for (const o of ops) if (trash(o.to)) n++;
    tidy(ops.map((o) => dirName(o.to)));
    setTrashed([]);
    setNote(t.trashed(n));
  };
  const restore = () => {
    const ops = trashed();
    revert(ops);
    tidy(ops.map((o) => dirName(o.to)));
    setTrashed([]);
  };
  return <ScrollView className="grow">
    <View className="w-full max-w-[760] self-center px-6 py-8 gap-4">
      <View className="items-center gap-3 py-4">
        <View className="w-[72] h-[72] rounded-full items-center justify-center" style={{ backgroundColor: THEME.accentSoft }}>
          <Icon name="party-popper" size={36} color={() => THEME.accent} />
        </View>
        <Text className="text-[26px] font-bold" style={{ color: THEME.ink }}>{t.done}</Text>
        <Text className="text-[14px]" style={{ color: THEME.body }}>{t.summary(total())}</Text>
      </View>
      <View className="flex-row flex-wrap gap-3">
        <For each={albums()}>{(a: Album) => <View className="w-[230] rounded-[16] p-4 gap-3" style={{ backgroundColor: THEME.card, borderWidth: 1, borderColor: THEME.cardLine }}>
          <View className="flex-row items-center gap-3">
            <View className="w-[40] h-[40] rounded-[12] items-center justify-center" style={{ backgroundColor: colorOf(a) }}><Icon name={a.icon} size={20} color={() => 0xffffff} /></View>
            <View className="grow">
              <Text className="text-[15px] font-semibold" style={{ color: THEME.ink }}>{a.label}</Text>
              <Text className="text-[12px]" style={{ color: THEME.dim }}>{t.sorted(filed()[a.id]?.n ?? 0)}</Text>
            </View>
          </View>
          <Pill label={() => t.open} icon="external-link" onClick={() => void openPath(filed()[a.id]!.dir)} />
        </View>}</For>
      </View>
      <Show when={trashed().length > 0}>
        <Section title={() => t.trashTitle(trashed().length)} icon="trash">
          <Text className="text-[13px]" style={{ color: THEME.dim }}>{t.trashHint}</Text>
          <View className="flex-row gap-2">
            <Pill danger label={() => t.emptyTrash} icon="trash" onClick={empty} />
            <Pill label={() => t.restore} icon="undo-2" onClick={restore} />
          </View>
        </Section>
      </Show>
      <Show when={note() !== ''}><Text className="text-[13px]" style={{ color: THEME.body }}>{note()}</Text></Show>
      <View className="flex-row gap-2 pt-2">
        <Pill primary label={() => t.again} icon="rotate-ccw" onClick={() => setScreen('setup')} />
      </View>
    </View>
  </ScrollView>;
}
