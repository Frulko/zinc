// What goes in the image, in the order Raspberry Pi Imager asks it: the board and its screen, the name, the user and
// SSH, Wi-Fi, the region, then what Zinc adds (libraries, the app, the agent). Every change is saved at once.
import { createSignal, For } from 'zinc:ui/solid';
import { theme, hex, Card, Input, Textarea, Select, Checkbox, Switch, Button } from 'zinc:ui/nuxt';
import { Field } from '../components/field';
import { Presets } from '../components/presets';
import { Choice, labelOf, keyOf } from '../services/catalog';
import { Profile } from '../services/profile';
import { catalog, profile, editProfile, toggleLibrary, chooseApp, useMySshKey, notice } from '../state';

const [boardListOpen, setBoardListOpen] = createSignal<boolean>(false);
const [displayListOpen, setDisplayListOpen] = createSignal<boolean>(false);

function labelsOf(choices: Choice[]): string[] { return choices.map((c: Choice) => c.label); }

function TextField(p: { label: string; hint?: string; value: () => string; onChange: (v: string) => void; placeholder?: string; secret?: boolean }): i32 {
  return <Field label={p.label} hint={p.hint}>
    <Input modelValue={p.value} onUpdate={p.onChange} placeholder={p.placeholder ?? ''} type={p.secret === true ? 'password' : 'text'} />
  </Field>;
}

function BoardSection(): i32 {
  return <Card title="Board">
    <Field label="Raspberry Pi" hint="Which models the image is for">
      <Select items={labelsOf(catalog.boards)} modelValue={() => labelOf(catalog.boards, profile().board)}
        onUpdate={(label: string) => editProfile((p: Profile) => { p.board = keyOf(catalog.boards, label); })}
        open={boardListOpen} onOpen={setBoardListOpen} className="w-full" />
    </Field>
    <Field label="Screen" hint="An official panel needs its overlay">
      <Select items={labelsOf(catalog.displays)} modelValue={() => labelOf(catalog.displays, profile().display)}
        onUpdate={(label: string) => editProfile((p: Profile) => { p.display = keyOf(catalog.displays, label); })}
        open={displayListOpen} onOpen={setDisplayListOpen} className="w-full" />
    </Field>
  </Card>;
}

function GeneralSection(): i32 {
  return <Card title="General">
    <TextField label="Image name" hint="The file in dist/" value={() => profile().name} onChange={(v: string) => editProfile((p: Profile) => { p.name = v; })} />
    <TextField label="Hostname" hint="The Pi answers at <name>.local" value={() => profile().hostname} onChange={(v: string) => editProfile((p: Profile) => { p.hostname = v; })} />
    <TextField label="Time zone" hint="Europe/Paris, America/New_York..." value={() => profile().timezone} onChange={(v: string) => editProfile((p: Profile) => { p.timezone = v; })} placeholder="Raspberry Pi OS's default" />
    <TextField label="Keyboard" hint="fr, gb, us, de..." value={() => profile().keyboard} onChange={(v: string) => editProfile((p: Profile) => { p.keyboard = v; })} placeholder="Raspberry Pi OS's default" />
  </Card>;
}

function UserSection(): i32 {
  return <Card title="User and SSH">
    <TextField label="User" hint="To log in; none for a screen only" value={() => profile().userName} onChange={(v: string) => editProfile((p: Profile) => { p.userName = v; })} placeholder="no user" />
    <TextField label="Password" value={() => profile().password} onChange={(v: string) => editProfile((p: Profile) => { p.password = v; })} secret={true} />
    <Field label="SSH" hint="Log in from a computer">
      <Switch modelValue={() => profile().ssh} onUpdate={(on: boolean) => editProfile((p: Profile) => { p.ssh = on; })} label="Turn SSH on" />
    </Field>
    <Field label="Public keys" hint="One per line: log in without the password">
      <View className="flex-col gap-2">
        <Textarea rows={3} modelValue={() => profile().sshKeys} onUpdate={(v: string) => editProfile((p: Profile) => { p.sshKeys = v; })} placeholder="ssh-ed25519 AAAA..." />
        <View className="flex-row items-center gap-2">
          <Button label="Use my key" icon="key-round" color="neutral" variant="outline" size="sm" onClick={useMySshKey} />
          <Text className={`text-xs text-${hex(theme().textMuted)}`}>{notice()}</Text>
        </View>
      </View>
    </Field>
  </Card>;
}

function WifiSection(): i32 {
  return <Card title="Wi-Fi">
    <TextField label="Network" value={() => profile().wifiName} onChange={(v: string) => editProfile((p: Profile) => { p.wifiName = v; })} placeholder="none (Ethernet, or set it on the Pi)" />
    <TextField label="Password" value={() => profile().wifiPassword} onChange={(v: string) => editProfile((p: Profile) => { p.wifiPassword = v; })} secret={true} />
    <TextField label="Country" hint="Two letters; Wi-Fi stays off without it" value={() => profile().wifiCountry} onChange={(v: string) => editProfile((p: Profile) => { p.wifiCountry = v; })} placeholder="FR" />
  </Card>;
}

function ZincSection(): i32 {
  return <Card title="Zinc">
    <Field label="App" hint="A Zinc project started at boot; the player shows without one">
      <View className="flex-row gap-2">
        <Input className="grow" modelValue={() => profile().app} onUpdate={(v: string) => editProfile((p: Profile) => { p.app = v; })} placeholder="the player alone" />
        <Button label="Choose" icon="folder-open" color="neutral" variant="outline" onClick={() => { chooseApp(); }} />
      </View>
    </Field>
    <Field label="Libraries" hint="From Raspberry Pi OS, ready for plugins">
      <View className="flex-col gap-1.5">
        <For each={catalog.libraries}>{(library: Choice, i: i32) =>
          <Checkbox label={library.label} modelValue={() => profile().libraries.indexOf(library.key) >= 0} onUpdate={(on: boolean) => toggleLibrary(library.key, on)} />}</For>
      </View>
    </Field>
    <TextField label="More packages" hint="Debian package names, separated by spaces" value={() => profile().packages} onChange={(v: string) => editProfile((p: Profile) => { p.packages = v; })} placeholder="htop i2c-tools" />
    <Field label="Options">
      <View className="flex-col gap-2">
        <Switch modelValue={() => profile().agent} onUpdate={(on: boolean) => editProfile((p: Profile) => { p.agent = on; })} label="Zinc agent (zinc device push, run, logs)" />
        <Switch modelValue={() => profile().bluetooth} onUpdate={(on: boolean) => editProfile((p: Profile) => { p.bluetooth = on; })} label="Bluetooth" />
        <Switch modelValue={() => profile().debugConsole} onUpdate={(on: boolean) => editProfile((p: Profile) => { p.debugConsole = on; })} label="Boot messages on screen (debugging)" />
      </View>
    </Field>
  </Card>;
}

export function SettingsPage(): i32 {
  return <ScrollView className="grow basis-0">
    <View className="flex-col gap-4 p-4">
      <Presets />
      <BoardSection />
      <GeneralSection />
      <UserSection />
      <WifiSection />
      <ZincSection />
    </View>
  </ScrollView>;
}
