// The sidebar, as macOS apps have one: the app (its icon, name and version: a click opens its settings), the four pages of a
// project (Code, Settings, Devices, Share), the files of the sketch, and at the bottom the way to the examples and templates.
import { For } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';
import { theme, bg, fg, bd } from '../app/theme';
import { active, activate, buffers, Buffer, sketchDir, sketchName, sketchFiles, openFile, tabName } from '../app/workspace';
import { project } from '../app/project';
import { Project } from '../model';
import { page, go } from '../app/commands';
import { ProjectIcon } from './Project';
import { t } from '../app/text';

export const SIDEBAR_W: i32 = 224;

function Row(props: { icon: string; label: () => string; on: () => boolean; onPress: () => void }): i32 {
  return <View className={`flex-row items-center h-[30] px-2 gap-2 rounded-[7] cursor-pointer ${props.on() ? bg(theme().active) : ''} hover:${bg(props.on() ? theme().active : theme().hover)}`}
    onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) props.onPress(); }}>
    <Icon name={props.icon} size={16} strokeWidth={1.75} color={() => props.on() ? theme().accent : theme().muted} />
    <Text className={`text-[13px] ${fg(theme().text)}`}>{props.label()}</Text>
  </View>;
}

function Caption(props: { label: () => string }): i32 {
  return <Text className={`px-2 pt-4 pb-1 text-[11px] font-semibold ${fg(theme().faint)}`}>{props.label()}</Text>;
}

function FileRow(props: { path: string }): i32 {
  const full = (): string => sketchDir() + '/' + props.path;
  const on = (): boolean => { const b = active(); return page() === 'code' && b !== null && (b as Buffer).path === full(); };
  return <View className={`flex-row items-center h-[26] pl-2 pr-1.5 gap-2 rounded-[6] cursor-pointer ${on() ? bg(theme().active) : ''} hover:${bg(on() ? theme().active : theme().hover)}`}
    onPointerDown={(e: ui.PointerEvent) => {
      if (e.button !== 0) return;
      go('code');
      const b = openFile(full());
      if (b !== null) activate(b as Buffer);
    }}>
    <Icon name={props.path.endsWith('.json') ? 'braces' : props.path.endsWith('.md') ? 'file-text' : 'file-code'} size={14} strokeWidth={1.75} color={() => theme().faint} />
    <Text className={`grow shrink text-[12px] ${fg(theme().text)}`}>{tabName(full())}</Text>
  </View>;
}

function appName(): string { const p = project(); return p !== null && (p as Project).name !== '' ? (p as Project).name : sketchName(); }
function appLine(): string {
  const p = project();
  if (sketchDir() === '') return t('atelier.side.no_project');
  if (p === null) return t('atelier.side.sketch');
  const q = p as Project;
  return q.version !== '' ? t('atelier.side.version', ['version', q.version]) : t('atelier.side.project');
}

export function Sidebar(): i32 {
  const has = (): boolean => sketchDir() !== '';
  const files = (): string[] => { buffers(); return has() ? sketchFiles(sketchDir()) : []; };
  return <View className={`flex-col h-full px-2.5 pt-3 pb-2.5 border-r ${bg(theme().sidebar)} ${bd(theme().borderSoft)}`} style={{ width: SIDEBAR_W }}>
    <View className={`flex-row items-center px-1.5 py-1.5 gap-2.5 rounded-[9] cursor-pointer hover:${bg(theme().hover)}`}
      onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) go(has() ? 'settings' : 'start'); }}>
      <ProjectIcon size={32} name={() => has() ? appName() : ''} />
      <View className="flex-col grow shrink gap-[1]">
        <Text className={`text-[13px] font-semibold ${fg(theme().text)}`}>{has() ? appName() : t('atelier.side.welcome')}</Text>
        <Text className={`text-[11px] ${fg(theme().muted)}`}>{appLine()}</Text>
      </View>
    </View>
    <View className="flex-col pt-3 gap-[2]">
      <Row icon="code" label={() => t('atelier.side.code')} on={() => page() === 'code'} onPress={() => go('code')} />
      <Row icon="settings" label={() => t('atelier.side.settings')} on={() => page() === 'settings'} onPress={() => go('settings')} />
      <Row icon="monitor-smartphone" label={() => t('atelier.side.devices')} on={() => page() === 'devices'} onPress={() => go('devices')} />
      <Row icon="share" label={() => t('atelier.side.share')} on={() => page() === 'share'} onPress={() => go('share')} />
    </View>
    <View className="flex-col" style={{ hidden: has() ? 0 : 1 }}>
      <Caption label={() => t('atelier.side.files')} />
    </View>
    <ScrollView className="grow flex-col gap-[1]">
      <For each={files()}>{(f: string, i: i32) => <FileRow path={f} />}</For>
    </ScrollView>
    <View className={`flex-col pt-2 border-t ${bd(theme().borderSoft)}`}>
      <Row icon="layout-grid" label={() => t('atelier.side.start')} on={() => page() === 'start'} onPress={() => go(page() === 'start' && has() ? 'code' : 'start')} />
    </View>
  </View>;
}
