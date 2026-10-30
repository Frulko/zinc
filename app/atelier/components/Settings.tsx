// The Settings page: what zinc.json says of the app, edited in place as macOS's System Settings would show it. The app (icon, name,
// version, identifier), its window on this Mac, how a Raspberry Pi's shell shows it, its permissions, where it is published, and what
// the project holds. Every change is written to zinc.json at once (app/project.ts) and checked by `zinc check`.
// A plain sketch (no zinc.json) gets the offer to make it a project.
import { createSignal, createEffect, createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { theme, bg, fg, bd } from '../app/theme';
import { sketchDir, sketchName, mainFile } from '../app/workspace';
import { project, projectOpen, sizeHere, plugins, assetsText, HERE, setName, setVersion, setId, setSize, setResize, setFullscreen, setShell,
  togglePermission, makeProject, openJson, showFolder, permissionText, chooseIcon, hub, setHub, seed, makeKey } from '../app/project';
import { Project, Target } from '../model';
import { Page, Group, Row, Field, Button, Segmented, Toggle } from './Form';
import { ProjectIcon } from './Project';
import { IconButton } from './Controls';
import { t } from '../app/text';
import { I_CLOSE } from './icons';

const SHELL: string[] = ['window', 'fullscreen', 'kiosk'];
const RESIZE: string[] = ['fill', 'letterbox'];

function Value(props: { text: () => string }): i32 {
  return <Text className={`shrink text-[12px] ${fg(theme().muted)}`}>{props.text() === '' ? t('atelier.project.none') : props.text()}</Text>;
}

const [wanted, setWanted] = createSignal<string>('');
const addRef = createNodeRef();

function ProjectSettings(): i32 {
  const p = (): Project => project() as Project;
  const here = (): Target | null => sizeHere();
  const [w, setW] = createSignal<string>(''), [h, setH] = createSignal<string>('');
  createEffect(() => { const s = here(); setW(s === null || (s as Target).width === 0 ? '' : `${(s as Target).width}`); setH(s === null || (s as Target).height === 0 ? '' : `${(s as Target).height}`); });
  const shell = (): i32 => { const i = SHELL.indexOf(p().shell); return i < 0 ? 0 : i; };
  const resize = (): i32 => { const s = here(); return s !== null && (s as Target).resize === 'letterbox' ? 1 : 0; };
  return <View className="flex-col">
    <Group title={t('atelier.settings.app')}>
      <Row label={() => t('atelier.settings.icon')} hint={() => t('atelier.settings.icon_hint')}>
        <ProjectIcon size={40} name={() => p().name !== '' ? p().name : sketchName()} />
        <Button label={() => t('atelier.settings.choose')} onPress={() => chooseIcon()} />
      </Row>
      <Row label={() => t('atelier.project.name')}><Field width="w-[240]" value={() => p().name} commit={setName} /></Row>
      <Row label={() => t('atelier.project.version_hint')}><Field width="w-[100]" hint="1.0.0" value={() => p().version} commit={setVersion} /></Row>
      <Row label={() => t('atelier.settings.id')} hint={() => t('atelier.settings.id_hint')}><Field width="w-[240]" mono hint="com.example.app" value={() => p().id} commit={setId} /></Row>
    </Group>
    <Group title={t('atelier.settings.window', ['target', HERE === 'macos' ? 'macOS' : 'Linux'])}>
      <Row label={() => t('atelier.settings.size')}>
        <View className="flex-row items-center gap-1.5">
          <Field width="w-[64]" hint={t('atelier.project.width')} value={w} commit={(v: string) => { setW(v); if (h() !== '') setSize(v, h()); }} />
          <Text className={`text-[12px] ${fg(theme().faint)}`}>×</Text>
          <Field width="w-[64]" hint={t('atelier.project.height')} value={h} commit={(v: string) => { setH(v); if (w() !== '') setSize(w(), v); }} />
        </View>
      </Row>
      <Row label={() => t('atelier.settings.resize')} hint={() => t('atelier.settings.resize_' + RESIZE[resize()])}>
        <Segmented items={() => [t('atelier.settings.resize_fill_label'), t('atelier.settings.resize_letterbox_label')]} selected={resize} onSelect={(i: i32) => setResize(RESIZE[i])} />
      </Row>
      <Row label={() => t('atelier.settings.fullscreen')}>
        <Toggle on={() => { const s = here(); return s !== null && (s as Target).fullscreen; }} onChange={setFullscreen} />
      </Row>
    </Group>
    <Group title={t('atelier.settings.pi')} note={() => t('atelier.settings.pi_note')}>
      <Row label={() => t('atelier.settings.shell')} hint={() => t('atelier.settings.shell_' + SHELL[shell()])}>
        <Segmented items={() => SHELL.map((m: string) => t('atelier.settings.shell_' + m + '_label'))} selected={shell} onSelect={(i: i32) => setShell(SHELL[i])} />
      </Row>
    </Group>
    <Group title={t('atelier.project.permissions')} note={() => t(p().declared ? 'atelier.settings.permissions_note' : 'atelier.project.undeclared')}>
      {p().permissions.map((id: string) => <Row label={() => id} hint={() => permissionText(id)}>
        <IconButton kind={I_CLOSE} size={11} onPress={() => togglePermission(id)} />
      </Row>)}
      <Row label={() => t('atelier.settings.allow')}>
        <Input ref={addRef} className={`h-[26] w-[220] text-[13px] px-2 rounded-[6] border ${bg(theme().bg)} ${bd(theme().border)} ${fg(theme().text)} focus:${bd(theme().accent)}`}
          placeholder={t('atelier.project.allow')} value={wanted()} onInput={(v: string) => setWanted(v)}
          onKeyDown={(e: ui.KeyEvent) => { if (e.key !== 'Enter') return; togglePermission(wanted()); setWanted(''); ui.setValue(addRef.node, ''); e.preventDefault(); }} />
      </Row>
    </Group>
    <Group title={t('atelier.settings.publishing')} note={() => t('atelier.settings.publishing_note')}>
      <Row label={() => t('atelier.settings.hub')} hint={() => t('atelier.settings.hub_hint')}>
        <Field width="w-[240]" mono hint="http://hub.local:8787" value={() => hub()[0]} commit={(v: string) => setHub(v, hub()[1])} />
      </Row>
      <Row label={() => t('atelier.settings.token')}>
        <Field width="w-[240]" mono secret value={() => hub()[1]} commit={(v: string) => setHub(hub()[0], v)} />
      </Row>
      <Row label={() => t('atelier.settings.key')} hint={() => p().publicKey === '' ? t('atelier.settings.key_none') : seed() === '' ? t('atelier.settings.key_elsewhere') : t('atelier.settings.key_ready', ['key', p().publicKey.slice(0, 16)])}>
        {seed() === '' && <Button label={() => t('atelier.settings.make_key')} onPress={() => makeKey()} />}
      </Row>
    </Group>
    <Group title={t('atelier.settings.contents')}>
      <Row label={() => t('atelier.project.entry')}><Value text={() => p().entry !== '' ? p().entry : mainFile(sketchDir())} /></Row>
      <Row label={() => t('atelier.project.plugins')}><Value text={() => plugins().join(', ')} /></Row>
      <Row label={() => t('atelier.project.assets_label')}><Value text={() => assetsText()} /></Row>
      <Row label={() => t('atelier.project.requires')}><Value text={() => p().requires.join(', ')} /></Row>
    </Group>
    <View className="flex-row pt-4 gap-2">
      <Button label={() => t('atelier.project.open_json')} onPress={() => openJson()} />
      <Button label={() => t('atelier.project.show_folder')} onPress={() => showFolder()} />
    </View>
  </View>;
}

function SketchSettings(): i32 {
  return <View className="flex-col">
    <Group note={() => t('atelier.project.project_is')}>
      <Row label={() => t('atelier.project.sketch_is')}><Button primary label={() => t('atelier.project.make')} onPress={() => makeProject()} /></Row>
    </Group>
    <View className="flex-row pt-4 gap-2">
      <Button label={() => t('atelier.project.show_folder')} onPress={() => showFolder()} />
    </View>
  </View>;
}

export function SettingsPage(): i32 {
  return <Page shown={projectOpen} title={() => t('atelier.side.settings')} subtitle={() => project() === null ? sketchName() : t('atelier.settings.subtitle', ['name', sketchName()])}>
    {project() === null ? <SketchSettings /> : <ProjectSettings />}
  </Page>;
}
