// The Share page: where the app goes once it runs. An app for this Mac (`zinc export`), a package any machine with zinc runs (`zinc pack`,
// a .zapp), the device chosen in the toolbar (Run sends it there: `zinc device <name> deploy`), and a Zinc hub that devices install
// from (`zinc publish --hub`, signed with the app's key, for any machine or a Raspberry Pi). The steps go to the console; what was made
// is shown under its action.
import * as sys from 'zinc:sys';
import * as proc from 'zinc:process';
import { theme, fg } from '../app/theme';
import { sketchDir, say } from '../app/workspace';
import { build, pack, made, device, run, phase, IDLE } from '../app/tools';
import { hub, HERE, PUBLISH_TARGETS, publishTarget, setPublishTarget, publishChannel, setPublishChannel, publishMissing, publishApp } from '../app/project';
import { shareOpen, go } from '../app/commands';
import { Page, Group, Row, Button, Segmented } from './Form';
import { t } from '../app/text';

const CHANNELS: string[] = ['stable', 'beta'];

/** The file or folder in the Finder, selected. */
function reveal(rel: string): void {
  const path = rel.startsWith('/') ? rel : sketchDir() + '/' + rel;
  if (sys.env('ZINC_HEADLESS') !== '' || sys.env('ZINC_DETERMINISTIC') !== '') { say(t('atelier.project.folder', ['path', path])); return; }
  try { proc.spawn('/usr/bin/env', HERE === 'macos' ? ['open', '-R', path] : ['xdg-open', path.slice(0, path.lastIndexOf('/'))], {}); } catch (e) { say(t('atelier.project.folder', ['path', path])); }
}
/** What `kind` made last, under its row: its path and a way to it. */
function Made(props: { kind: string }): i32 {
  const shown = (): boolean => made()[0] === props.kind && made()[1] !== '';
  return <View className="flex-row items-center gap-2" style={{ hidden: shown() ? 0 : 1 }}>
    <Text className={`text-[11px] font-mono ${fg(theme().success)}`}>{made()[1]}</Text>
    <Text className={`text-[11px] cursor-pointer ${fg(theme().accent)}`} onPointerDown={() => reveal(made()[1])}>{t('atelier.share.reveal')}</Text>
  </View>;
}

export function SharePage(): i32 {
  const idle = (): boolean => phase() === IDLE;
  return <Page shown={shareOpen} title={() => t('atelier.side.share')} subtitle={() => t('atelier.share.subtitle')}>
    <Group title={t('atelier.share.this_mac')}>
      <Row label={() => t('atelier.share.build')} hint={() => t('atelier.share.build_hint')}>
        <Made kind="build" />
        <Button primary label={() => t('atelier.cmd.build')} onPress={() => { if (idle()) build(); }} />
      </Row>
      <Row label={() => t('atelier.share.pack')} hint={() => t('atelier.share.pack_hint')}>
        <Made kind="pack" />
        <Button label={() => t('atelier.share.pack_button')} onPress={() => { if (idle()) pack(); }} />
      </Row>
    </Group>
    <Group title={t('atelier.share.device')}>
      <Row label={() => device() === '' ? t('atelier.share.no_device') : t('atelier.share.on_device', ['device', device()])} hint={() => t('atelier.share.device_hint')}>
        {device() === ''
          ? <Button label={() => t('atelier.share.choose_device')} onPress={() => go('devices')} />
          : <Button primary label={() => t('atelier.share.run_there')} onPress={() => { if (idle()) { go('code'); run(false); } }} />}
      </Row>
    </Group>
    <Group title={t('atelier.share.hub')} note={() => publishMissing() !== '' ? publishMissing() : t('atelier.share.hub_note', ['hub', hub()[0]])}>
      <Row label={() => t('atelier.share.for')}>
        <Segmented items={() => PUBLISH_TARGETS.map((x: string) => t('atelier.share.target_' + (x === '' ? 'any' : x)))} selected={publishTarget} onSelect={setPublishTarget} />
      </Row>
      <Row label={() => t('atelier.share.channel')}>
        <Segmented items={() => CHANNELS} selected={() => CHANNELS.indexOf(publishChannel())} onSelect={(i: i32) => setPublishChannel(CHANNELS[i])} />
      </Row>
      <Row label={() => t('atelier.share.publish')} hint={() => t('atelier.share.publish_hint')}>
        <Made kind="publish" />
        {publishMissing() !== ''
          ? <Button label={() => t('atelier.share.set_up')} onPress={() => go('settings')} />
          : <Button primary label={() => t('atelier.share.publish_button')} onPress={() => { if (idle()) publishApp(); }} />}
      </Row>
    </Group>
  </Page>;
}
