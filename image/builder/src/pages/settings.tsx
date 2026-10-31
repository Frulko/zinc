// What goes in the image, as a short guided flow: the device, the network and the account, then what Zinc adds. The basics
// come first; the rest waits behind "Advanced". Every change is saved at once.
import { createSignal, For, Show } from 'zinc:ui/solid';
import { theme, hex, Input, Textarea, Select, Checkbox, Button } from 'zinc:ui/nuxt';
import { Icon } from 'zinc:icons';
import { Group, Row, Toggle } from '../components/group';
import { Choice, labelOf, keyOf } from '../services/catalog';
import { Profile } from '../services/profile';
import { catalog, profile, editProfile, toggleLibrary, chooseApp, useMySshKey, notice, page, setPage, Page } from '../state';

const [boardListOpen, setBoardListOpen] = createSignal<boolean>(false);
const [displayListOpen, setDisplayListOpen] = createSignal<boolean>(false);
const [advancedOpen, setAdvancedOpen] = createSignal<boolean>(false);

function labelsOf(choices: Choice[]): string[] { return choices.map((c: Choice) => c.label); }

function TextRow(p: { label: string; hint?: string; value: () => string; onChange: (v: string) => void; placeholder?: string; secret?: boolean; first?: boolean }): i32 {
  return <Row label={p.label} hint={p.hint} first={p.first}>
    <Input modelValue={p.value} onUpdate={p.onChange} placeholder={p.placeholder ?? ''} type={p.secret === true ? 'password' : 'text'} />
  </Row>;
}

function Title(p: { title: string; subtitle: string }): i32 {
  return <View className="flex-col gap-1.5 pb-2">
    <Text className="text-[30px] font-bold text-[#1d1d1f]">{p.title}</Text>
    <Text className="text-[15px] leading-[21px] text-[#6e6e73]">{p.subtitle}</Text>
  </View>;
}

function DevicePage(): i32 {
  return <View className="flex-col gap-6">
    <Title title="Your Raspberry Pi" subtitle="Choose the board and its screen. Everything else has a sensible default." />
    <Group title="Hardware">
      <Row first={true} label="Raspberry Pi" hint="Which models the image runs on">
        <Select items={labelsOf(catalog.boards)} modelValue={() => labelOf(catalog.boards, profile().board)}
          onUpdate={(label: string) => editProfile((p: Profile) => { p.board = keyOf(catalog.boards, label); })}
          open={boardListOpen} onOpen={setBoardListOpen} className="w-full" />
      </Row>
      <Row label="Screen" hint="An official panel needs its overlay">
        <Select items={labelsOf(catalog.displays)} modelValue={() => labelOf(catalog.displays, profile().display)}
          onUpdate={(label: string) => editProfile((p: Profile) => { p.display = keyOf(catalog.displays, label); })}
          open={displayListOpen} onOpen={setDisplayListOpen} className="w-full" />
      </Row>
      <Toggle label="Bluetooth" hint="For keyboards, game controllers and speakers" value={() => profile().bluetooth} onChange={(on: boolean) => editProfile((p: Profile) => { p.bluetooth = on; })} />
    </Group>
    <Group title="Image" footer="The name is the file you get in dist/. Leave the hostname empty for a unique name at first boot.">
      <TextRow first={true} label="Name" value={() => profile().name} onChange={(v: string) => editProfile((p: Profile) => { p.name = v; })} />
      <TextRow label="Hostname" value={() => profile().hostname} onChange={(v: string) => editProfile((p: Profile) => { p.hostname = v; })} placeholder="a unique name" />
      <TextRow label="Time zone" hint="Europe/Paris, America/New_York..." value={() => profile().timezone} onChange={(v: string) => editProfile((p: Profile) => { p.timezone = v; })} placeholder="Raspberry Pi OS's default" />
      <TextRow label="Keyboard" hint="fr, gb, us, de..." value={() => profile().keyboard} onChange={(v: string) => editProfile((p: Profile) => { p.keyboard = v; })} placeholder="Raspberry Pi OS's default" />
    </Group>
  </View>;
}

function NetworkPage(): i32 {
  return <View className="flex-col gap-6">
    <Title title="Network and account" subtitle="Ready to connect from the first boot, and to log in from your computer." />
    <Group title="Wi-Fi" footer="Without a network the Pi uses Ethernet, or you set Wi-Fi on the Pi itself.">
      <TextRow first={true} label="Network" value={() => profile().wifiName} onChange={(v: string) => editProfile((p: Profile) => { p.wifiName = v; })} placeholder="none" />
      <TextRow label="Password" value={() => profile().wifiPassword} onChange={(v: string) => editProfile((p: Profile) => { p.wifiPassword = v; })} secret={true} />
      <TextRow label="Country" hint="Two letters; Wi-Fi stays off without it" value={() => profile().wifiCountry} onChange={(v: string) => editProfile((p: Profile) => { p.wifiCountry = v; })} placeholder="FR" />
    </Group>
    <Group title="Account" footer="Leave the user empty for a screen only: the Pi just runs Zinc.">
      <TextRow first={true} label="User" hint="To log in" value={() => profile().userName} onChange={(v: string) => editProfile((p: Profile) => { p.userName = v; })} placeholder="no user" />
      <TextRow label="Password" value={() => profile().password} onChange={(v: string) => editProfile((p: Profile) => { p.password = v; })} secret={true} />
      <Toggle label="Turn SSH on" hint="Log in from a computer over the network" value={() => profile().ssh} onChange={(on: boolean) => editProfile((p: Profile) => { p.ssh = on; })} />
      <Row label="Public keys" hint="One per line: log in without the password">
        <Textarea rows={3} modelValue={() => profile().sshKeys} onUpdate={(v: string) => editProfile((p: Profile) => { p.sshKeys = v; })} placeholder="ssh-ed25519 AAAA..." />
        <View className="flex-row items-center gap-2">
          <Button label="Use my key" icon="key-round" color="neutral" variant="outline" size="sm" onClick={useMySshKey} />
          <Text className={`text-xs text-${hex(theme().textMuted)}`}>{notice()}</Text>
        </View>
      </Row>
    </Group>
  </View>;
}

function AppsPage(): i32 {
  return <View className="flex-col gap-6">
    <Title title="Apps and options" subtitle="What the Pi does when it starts, and how you reach it." />
    <Group title="Experience">
      <Toggle first={true} label="Zinc shell" hint="Boots to a home screen with a top bar, an app hub and the store, instead of a single app" value={() => profile().shell} onChange={(on: boolean) => editProfile((p: Profile) => { p.shell = on; })} />
      <Row label="App at boot" hint="A Zinc project the Pi starts alone (kiosk); the player shows without one">
        <View className="flex-row gap-2">
          <Input className="grow" modelValue={() => profile().app} onUpdate={(v: string) => editProfile((p: Profile) => { p.app = v; })} placeholder="the player alone" />
          <Button label="Choose" icon="folder-open" color="neutral" variant="outline" onClick={() => { chooseApp(); }} />
        </View>
      </Row>
      <Toggle label="Zinc agent" hint="Pair the Pi with your Mac, then deploy and read logs over the network or a USB cable" value={() => profile().agent} onChange={(on: boolean) => editProfile((p: Profile) => { p.agent = on; })} />
    </Group>
    <View className="flex-col gap-3">
      <Button label="Advanced" icon={advancedOpen() ? 'chevron-down' : 'chevron-right'} color="neutral" variant="link" size="sm" className="self-start" onClick={() => setAdvancedOpen(!advancedOpen())} />
      <Show when={advancedOpen()}><View className="flex-col gap-6">
        <Group title="System" footer="An A/B image needs the update certificates once: tools/pi-image keys.">
          <Toggle first={true} label="A/B system updates" hint="Two system copies: an update installs on the idle one and falls back if it fails" value={() => profile().ab} onChange={(on: boolean) => editProfile((p: Profile) => { p.ab = on; })} />
          <Toggle label="Boot messages on screen" hint="For debugging a Pi that does not start" value={() => profile().debugConsole} onChange={(on: boolean) => editProfile((p: Profile) => { p.debugConsole = on; })} />
          <TextRow label="Free space" hint="MiB added to the system partition" value={() => profile().growMiB} onChange={(v: string) => editProfile((p: Profile) => { p.growMiB = v; })} />
        </Group>
        <Group title="Libraries and packages" footer="Libraries come from Raspberry Pi OS and are ready for plugins.">
          <For each={catalog.libraries}>{(library: Choice, i: i32) =>
            <Toggle first={i === 0} label={library.label} hint="" value={() => profile().libraries.indexOf(library.key) >= 0} onChange={(on: boolean) => toggleLibrary(library.key, on)} />}</For>
          <TextRow label="More packages" hint="Debian names, separated by spaces" value={() => profile().packages} onChange={(v: string) => editProfile((p: Profile) => { p.packages = v; })} placeholder="htop i2c-tools" />
        </Group>
      </View></Show>
    </View>
  </View>;
}

const FLOW: Page[] = ['device', 'network', 'apps', 'build'];

function Footer(): i32 {
  const at = (): i32 => FLOW.indexOf(page());
  return <View className="flex-row items-center pt-2 pb-4">
    <Show when={at() > 0}><Button label="Back" icon="arrow-left" color="neutral" variant="outline" onClick={() => setPage(FLOW[at() - 1])} /></Show>
    <View className="grow" />
    <Button label={at() === 2 ? 'Review and build' : 'Continue'} trailingIcon="arrow-right" onClick={() => setPage(FLOW[at() + 1])} />
  </View>;
}

export function SettingsPage(): i32 {
  return <View className="flex-col gap-6">
    <Show when={page() === 'device'}><DevicePage /></Show>
    <Show when={page() === 'network'}><NetworkPage /></Show>
    <Show when={page() === 'apps'}><AppsPage /></Show>
    <Footer />
  </View>;
}
