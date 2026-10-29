// trieur's inbox: eight folders docked under the mail, the model learning from the envelope (never from the folder it belongs to).
import { Icon } from 'zinc:icons';
import { createDeck, Deck, kvStore, THEME } from 'zinc:trieur';
import { createRecommender } from '@trieur/learn';
import { flick } from '@trieur/core/flick';
import { mails, folders, meta, type Mail } from '@trieur/data/mail';

// trieur's glyphs are characters of a web font; the native tiles take Lucide names
const ICONS: Record<string, string> = { clients: 'briefcase', finance: 'landmark', team: 'users', later: 'clock', reply: 'reply', archive: 'archive', spam: 'shield-alert', trash: 'trash' };

export function MailPage(): any {
  const deck = createDeck<Mail>({
    items: mails,
    zones: folders.map((f) => ({ ...f, icon: ICONS[f.id] })),
    meta,
    keys: 'asdfghjk',
    layout: 'dock',
    tapZones: true,
    advisor: createRecommender({ key: 'demo-mail', store: kvStore() }),
    plugins: [flick()],
    cardW: 420,
    cardH: 250,
  });
  return <Deck deck={deck} renderCard={(m: Mail) => <MailCard mail={m} />} />;
}

function MailCard(p: { mail: Mail }): any {
  const m = p.mail;
  return <View className="grow p-5 gap-2">
    <View className="flex-row items-center gap-3">
      <View className="w-[36] h-[36] rounded-full items-center justify-center" style={{ backgroundColor: THEME.accentSoft }}>
        <Text className="text-[15px] font-bold" style={{ color: THEME.accent }}>{m.from.slice(0, 1)}</Text>
      </View>
      <View className="grow">
        <Text className="text-[14px] font-semibold" style={{ color: THEME.ink }} numberOfLines={1}>{m.from}</Text>
        <Text className="text-[11px]" style={{ color: THEME.dim }} numberOfLines={1}>{m.email}</Text>
      </View>
      <Text className="text-[11px]" style={{ color: THEME.dim }}>{m.at}</Text>
    </View>
    <Text className="text-[16px] font-semibold" style={{ color: THEME.ink }} numberOfLines={1}>{m.subject}</Text>
    <Text className="text-[13px] leading-[18px]" style={{ color: THEME.body }} numberOfLines={4}>{m.body.join(' ')}</Text>
    <View className="grow" />
    {m.attachments ? <View className="flex-row gap-1.5">
      {m.attachments.map((a) => <View className="flex-row items-center gap-1 px-2 h-[24] rounded-[7]" style={{ backgroundColor: THEME.tag }}>
        <Icon name="paperclip" size={12} color={() => THEME.tagInk} />
        <Text className="text-[11px]" style={{ color: THEME.tagInk }}>{a.name + ' · ' + a.size}</Text>
      </View>)}
    </View> : null}
  </View>;
}
