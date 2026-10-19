// The left column: the agents found on the computer with their global configuration, then the folders to chat in.
import { createSignal } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { ConfigFile, shortPath } from '../services/discovery';
import { AgentInfo, agents, agent, selectAgent, folders, folder, selectFolder, addFolder, viewFile, viewed } from '../state';
import { SURFACE, SURFACE_HOVER, SELECTED, BORDER, TEXT, MUTED, FAINT, ERROR, bg, fg, bd, sizeLabel } from '../theme';

function SectionTitle(props: { text: string }): i32 {
  return <Text className={`text-[11px] font-semibold mt-4 mb-1 px-2 ${fg(FAINT)}`}>{props.text}</Text>;
}

/** A configuration file: opens in the main pane; a file holding credentials is listed, never opened. */
export function FileRow(props: { file: ConfigFile }): i32 {
  const f = props.file;
  return <View className={`flex-row items-center gap-2 h-[24] px-2 rounded ${f.secret ? '' : 'cursor-pointer'} ${viewed() === f ? bg(SELECTED) : ''} hover:${bg(SURFACE_HOVER)}`}
    onPress={() => { if (!f.secret) viewFile(f); }}>
    <Icon name={f.secret ? 'lock' : f.isDirectory ? 'folder' : 'file-text'} size={13} color={() => FAINT} />
    <Text className={`grow shrink min-w-0 truncate text-[12px] ${fg(f.secret ? FAINT : MUTED)}`}>{f.label}</Text>
    <Text className={`text-[11px] ${fg(FAINT)}`}>{f.secret ? 'secret' : sizeLabel(f.size, f.isDirectory)}</Text>
  </View>;
}

function AgentRow(props: { info: AgentInfo }): i32 {
  const a = props.info;
  const status = (): string => a.binary === '' ? 'not installed' : a.version() !== '' ? a.version() : 'installed';
  return <View className="flex-col">
    <View className={`flex-row items-center gap-2 h-[34] px-2 rounded-md cursor-pointer ${agent() === a ? bg(SELECTED) : ''} hover:${bg(SURFACE_HOVER)}`}
      onPress={() => selectAgent(a)}>
      <View className="w-[8] h-[8] rounded-full" style={{ backgroundColor: a.agent.color }} />
      <Text className={`grow text-[13px] font-semibold ${fg(TEXT)}`}>{a.agent.name}</Text>
      <Text className={`text-[11px] ${fg(a.binary === '' ? ERROR : FAINT)}`}>{status()}</Text>
    </View>
    {agent() === a && <View className="flex-col pl-3">
      {a.config.length === 0 && <Text className={`text-[12px] px-2 ${fg(FAINT)}`}>no configuration in ~</Text>}
      {a.config.map((f: ConfigFile) => <FileRow file={f} />)}
    </View>}
  </View>;
}

function FolderRow(props: { path: string }): i32 {
  return <View className={`flex-row items-center gap-2 h-[28] px-2 rounded-md cursor-pointer ${folder() === props.path ? bg(SELECTED) : ''} hover:${bg(SURFACE_HOVER)}`}
    onPress={() => selectFolder(props.path)}>
    <Icon name="folder" size={14} color={() => folder() === props.path ? TEXT : FAINT} />
    <Text className={`grow shrink min-w-0 truncate text-[12px] ${fg(folder() === props.path ? TEXT : MUTED)}`}>{shortPath(props.path)}</Text>
  </View>;
}

/** A field to add a folder by its path; Enter adds it, a path that is not a folder turns the field red. */
function AddFolder(): i32 {
  const [typed, setTyped] = createSignal('');
  const [wrong, setWrong] = createSignal(false);
  const submit = (): void => {
    if (addFolder(typed())) { setTyped(''); setWrong(false); } else setWrong(true);
  };
  return <View className="px-1 mb-1" onSubmit={submit}>
    <Input className={`w-full h-[28] px-2 rounded text-[12px] border ${bg(SURFACE)} ${fg(TEXT)} ${bd(wrong() ? ERROR : BORDER)}`}
      value={typed()} onInput={(v: string) => { setTyped(v); setWrong(false); }} placeholder="Add a folder: ~/path/to/project" />
  </View>;
}

export function Sidebar(): i32 {
  return <View className={`w-[300] flex-col border-r ${bg(SURFACE)} ${bd(BORDER)}`}>
    <ScrollView className="grow flex-col px-2 pb-3">
      <SectionTitle text="AGENTS" />
      {agents.map((a: AgentInfo) => <AgentRow info={a} />)}
      <SectionTitle text="FOLDERS" />
      <AddFolder />
      {folders().map((p: string) => <FolderRow path={p} />)}
    </ScrollView>
  </View>;
}
