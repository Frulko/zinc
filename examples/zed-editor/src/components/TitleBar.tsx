// Title bar: the project name and the active file on the left, the toolbar on the right.
import { theme, bg, fg, bd, toggleTheme } from '../app/theme';
import { root } from '../app/project';
import { active, Buffer } from '../app/workspace';
import { panelOpen, togglePanel, terminalOpen, toggleTerminal, showTerminal, softWrap, setSoftWrap, minimapOn, setMinimapOn } from '../app/settings';
import { findOpen, openFind, closeFind } from '../app/search';
import { openPalette, PAL_COMMANDS } from '../app/commands';
import { runProject, running, stopProject } from '../app/tools';
import { IconButton } from './Controls';
import { I_SIDEBAR, I_SEARCH, I_WRAP, I_MINIMAP, I_TERMINAL, I_PLAY, I_STOP, I_SUN, I_MOON, I_COMMAND } from './icons';

function activePath(): string {
  const b = active();
  if (b === null) return '';
  const p = (b as Buffer).path;
  return p.startsWith(root.path + '/') ? p.slice(root.path.length + 1) : p;
}

export function TitleBar(): i32 {
  return <View class={`flex-row items-center h-[38] pl-2 pr-2 gap-1 border-b ${bg(theme().surface)} ${bd(theme().borderSoft)}`}>
    <IconButton kind={I_SIDEBAR} on={panelOpen} onPress={togglePanel} />
    <View class={`flex-row items-center h-[26] px-2 rounded-md cursor-pointer hover:${bg(theme().hover)}`}
      onPointerDown={() => openPalette(1)}>
      <Text class={`text-[13px] font-semibold ${fg(theme().text)}`}>{root.name}</Text>
    </View>
    <Text class={`text-[13px] ${fg(theme().faint)}`}>{activePath()}</Text>
    <View class="grow" />
    <IconButton kind={I_SEARCH} on={findOpen} onPress={() => findOpen() ? closeFind() : openFind()} />
    <IconButton kind={I_WRAP} on={softWrap} onPress={() => setSoftWrap(!softWrap())} />
    <IconButton kind={I_MINIMAP} on={minimapOn} onPress={() => setMinimapOn(!minimapOn())} />
    <IconButton kind={I_TERMINAL} on={terminalOpen} onPress={toggleTerminal} />
    {running() ? <IconButton kind={I_STOP} onPress={stopProject} />
      : <IconButton kind={I_PLAY} onPress={() => { showTerminal(true); runProject(); }} />}
    <View class={`w-px h-[16] mx-1 ${bg(theme().border)}`} />
    {theme().dark ? <IconButton kind={I_MOON} onPress={toggleTheme} /> : <IconButton kind={I_SUN} onPress={toggleTheme} />}
    <IconButton kind={I_COMMAND} onPress={() => openPalette(PAL_COMMANDS)} />
  </View>;
}
