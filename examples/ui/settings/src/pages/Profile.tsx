import { Avatar, Input, Textarea, Select, Separator, theme } from 'zinc:ui/kit';
import { Settings } from '../state';
export function Profile(p: { model: Settings; narrow: boolean }): i32 {
  const m = p.model;
  return <View className="flex-col gap-6">
    <View className="flex-row items-center gap-4">
      <Avatar name={m.draft().first + ' ' + m.draft().last} size={56} />
      <View className="flex-col gap-1 min-w-0">
        <Text className={`text-[15px] font-medium text-${theme().foreground}`}>{m.draft().first + ' ' + m.draft().last}</Text>
        <Text className={`text-[12px] text-${theme().mutedForeground}`}>Your fictional public profile</Text>
      </View>
    </View>
    <Separator />
    <View className={`${p.narrow ? 'flex-col' : 'flex-row'} gap-4`}>
      <Input label="First name" value={() => m.draft().first} onInput={(first: string) => m.edit({ ...m.draft(), first })} error={m.error('first')} className="flex-1 min-w-0" onSubmit={m.save} />
      <Input label="Last name" value={() => m.draft().last} onInput={(last: string) => m.edit({ ...m.draft(), last })} error={m.error('last')} className="flex-1 min-w-0" onSubmit={m.save} />
    </View>
    <View className={`${p.narrow ? 'flex-col' : 'flex-row'} gap-4`}>
      <Input label="Email" type="email" value={() => m.draft().email} onInput={(email: string) => m.edit({ ...m.draft(), email })} error={m.error('email')} hint="Used only in this local demo." className="flex-1 min-w-0" onSubmit={m.save} />
      <Input label="Username" value={() => m.draft().username} onInput={(username: string) => m.edit({ ...m.draft(), username })} error={m.error('username')} className="flex-1 min-w-0" onSubmit={m.save} />
    </View>
    <Input label="Website" value={() => m.draft().website} onInput={(website: string) => m.edit({ ...m.draft(), website })} error={m.error('website')} onSubmit={m.save} />
    <Textarea label="Bio" value={() => m.draft().bio} onInput={(bio: string) => m.edit({ ...m.draft(), bio })} rows={3} hint={String(m.draft().bio.length) + ' / 280 characters · shown on your profile'} error={m.error('bio')} />
    <View className={`${p.narrow ? 'flex-col' : 'flex-row'} gap-4`}>
      <Select label="Time zone" value={() => m.draft().timezone} onChange={(timezone: string) => m.edit({ ...m.draft(), timezone })} items={[{ value: 'Europe/Paris', label: 'Paris · Europe/Paris' }, { value: 'America/New_York', label: 'New York · America/New_York' }, { value: 'Asia/Tokyo', label: 'Tokyo · Asia/Tokyo' }]} className="flex-1 min-w-0" />
      <Select label="Language preference" value={() => m.draft().language} onChange={(language: string) => m.edit({ ...m.draft(), language })} items={[{ value: 'English', label: 'English' }, { value: 'Français', label: 'Français' }, { value: 'Deutsch', label: 'Deutsch' }]} className="flex-1 min-w-0" />
    </View>
    <Text className={`text-[12px] text-${theme().mutedForeground}`}>Time zone and language are stored preferences; this demo stays in English.</Text>
  </View>;
}
