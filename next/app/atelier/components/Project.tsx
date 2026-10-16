// The project card (ZN-736), under the sketch pill of the header: what zinc.json says of the app (its name, id and version, its
// icon, its entry, the window on this machine and the other targets, what it requires, the plugins its code imports, its assets,
// its permissions with what each allows) and the means to manage it: the name, the version, the window's size and the
// permissions are edited here, zinc.json opens as a tab, the folder in the Finder, and Build makes the app for this machine.
// A plain sketch (no zinc.json) gets a card that offers to make it a project.
import { createSignal, createEffect, createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { imageFromBytes, drawImage, rrect } from 'zinc:gfx';
import * as fs from 'zinc:fs';
import { theme, bg, fg, bd } from '../app/theme';
import { sketchName, mainFile, sketchDir } from '../app/workspace';
import { build } from '../app/tools';
import { setStartOpen } from '../app/commands';
import { project, projectOpen, setProjectOpen, iconPath, sizeHere, plugins, assetsText, HERE, setName, setVersion, setSize, togglePermission, makeProject, openJson, showFolder } from '../app/project';
import { Project, Target, permissionText } from '../model';
import { Glyph, IconButton } from './Controls';
import { I_CLOSE, I_GRID } from './icons';

const FIELD = (): string => `h-[28] text-[13px] px-2.5 rounded-lg border-0 ${bg(theme().chrome)} ${fg(theme().text)} focus:${bd(theme().chrome)}`;
const LABEL = (): string => `w-[92] text-[12px] ${fg(theme().muted)}`;

// the icon's image, decoded once per file
let iconOf = '', iconImage: i32 = -1;
function icon(): i32 {
  const path = iconPath();
  if (path !== iconOf) { iconOf = path; iconImage = -1; if (path !== '') { try { iconImage = imageFromBytes(fs.readBytes(path)); } catch (e) { } } }
  return iconImage;
}
/** The app's icon, or the sketch glyph when it has none. */
export function ProjectIcon(props: { size: i32 }): i32 {
  return <View className="items-center justify-center" style={{ width: props.size, height: props.size }}>
    {iconPath() !== ''
      ? <Canvas style={{ width: props.size, height: props.size }} onDraw={(x: i32, y: i32, w: i32, h: i32) => { const img = icon(); if (img >= 0) drawImage(img, x, y, w, h, 255, w / 4.5); else rrect(x, y, w, h, w / 4.5, theme().chrome, 255); }} />
      : <Glyph kind={I_GRID} size={props.size < 16 ? props.size : 16} color={() => theme().muted} />}
  </View>;
}

/** A field that changes zinc.json when it is left or Enter is pressed. */
function Field(props: { value: () => string; width: string; hint: string; commit: (v: string) => void }): i32 {
  const node = <Input className={`${props.width} ${FIELD()}`} placeholder={props.hint} value={props.value()}
    onKeyDown={(e: ui.KeyEvent) => { if (e.key === 'Escape') { setProjectOpen(false); e.preventDefault(); } }} />;
  ui.onText(node, true, (v: string) => { if (v !== props.value()) props.commit(v); });
  return node;
}
function Fact(props: { label: string; value: () => string }): i32 {
  return <View className="flex-row items-start min-h-[24] px-2.5 py-[3]">
    <Text className={LABEL()}>{props.label}</Text>
    <Text className={`grow shrink text-[12px] ${fg(theme().text)}`}>{props.value() === '' ? 'none' : props.value()}</Text>
  </View>;
}
function Action(props: { label: string; primary?: boolean; onPress: () => void }): i32 {
  return <View className={`flex-row items-center h-[28] px-3 rounded-full cursor-pointer active:opacity-80 ${props.primary === true ? bg(theme().accent) : bg(theme().chrome)} hover:opacity-90`}
    onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) props.onPress(); }}>
    <Text className={`text-[12px] font-medium ${fg(props.primary === true ? theme().onAccent : theme().text)}`}>{props.label}</Text>
  </View>;
}
function Permission(props: { id: string }): i32 {
  return <View className={`flex-row items-center h-[26] pl-2.5 pr-1 gap-2 rounded-lg hover:${bg(theme().hover)}`}>
    <Text className={`w-[108] text-[12px] font-mono ${fg(theme().text)}`}>{props.id}</Text>
    <Text className={`grow shrink text-[12px] ${fg(theme().muted)}`}>{permissionText(props.id)}</Text>
    <IconButton kind={I_CLOSE} size={11} onPress={() => togglePermission(props.id)} />
  </View>;
}

const [wanted, setWanted] = createSignal<string>('');
const addRef = createNodeRef();
function others(p: Project): string {
  return p.targets.filter((t: Target) => t.name !== HERE).map((t: Target) => `${t.name} ${t.width > 0 ? `${t.width} × ${t.height}` : 'no size'}${t.display !== '' ? ' ' + t.display : ''}`).join(', ');
}
function ProjectBody(): i32 {
  const p = (): Project => project() as Project;
  const size = (): Target | null => sizeHere();
  const [w, setW] = createSignal<string>(''), [h, setH] = createSignal<string>('');
  createEffect(() => { const s = size(); setW(s === null || (s as Target).width === 0 ? '' : `${(s as Target).width}`); setH(s === null || (s as Target).height === 0 ? '' : `${(s as Target).height}`); });
  return <View className="flex-col">
    <View className="flex-row items-center px-2 pb-2 gap-2.5">
      <ProjectIcon size={40} />
      <View className="flex-col grow shrink gap-1">
        <View className="flex-row items-center gap-1.5">
          <Field width="grow" hint="Name" value={() => p().name} commit={setName} />
          <Field width="w-[84]" hint="Version" value={() => p().version} commit={setVersion} />
        </View>
        <Text className={`px-0.5 text-[11px] font-mono ${fg(theme().faint)}`}>{p().id !== '' ? p().id : 'no app id (zinc.json: app.id)'}</Text>
      </View>
    </View>
    <View className={`flex-col py-1 border-t ${bd(theme().borderSoft)}`}>
      <Fact label="Entry" value={() => p().entry !== '' ? p().entry : mainFile(sketchDir())} />
      <View className="flex-row items-center h-[32] px-2.5">
        <Text className={LABEL()}>{`Window, ${HERE}`}</Text>
        <Field width="w-[64]" hint="width" value={w} commit={(v: string) => { setW(v); if (h() !== '') setSize(v, h()); }} />
        <Text className={`px-1.5 text-[12px] ${fg(theme().faint)}`}>×</Text>
        <Field width="w-[64]" hint="height" value={h} commit={(v: string) => { setH(v); if (w() !== '') setSize(w(), v); }} />
      </View>
      <Fact label="Other targets" value={() => others(p())} />
      <Fact label="Requires" value={() => p().requires.join(', ')} />
      <Fact label="Plugins" value={() => plugins().join(', ')} />
      <Fact label="Assets" value={() => assetsText()} />
    </View>
    <View className={`flex-col pt-1.5 border-t ${bd(theme().borderSoft)}`}>
      <View className="flex-row items-center h-[30] pl-2.5 gap-2">
        <Text className={`grow text-[12px] font-semibold ${fg(theme().text)}`}>Permissions</Text>
        <Input ref={addRef} className={`w-[168] ${FIELD()}`} placeholder="Allow: fs:read:data, net…" value={wanted()} onInput={(v: string) => setWanted(v)}
          onKeyDown={(e: ui.KeyEvent) => {
            if (e.key === 'Enter') { togglePermission(wanted()); setWanted(''); ui.setValue(addRef.node, ''); } else if (e.key === 'Escape') setProjectOpen(false); else return;
            e.preventDefault();
          }} />
      </View>
      {p().permissions.map((id: string) => <Permission id={id} />)}
      <View className="px-2.5 py-1" style={{ hidden: p().permissions.length > 0 ? 1 : 0 }}>
        <Text className={`text-[12px] ${fg(theme().muted)}`}>{p().declared ? 'None: the app reads no file, opens no connection and starts no program.' : 'Not declared: files, network and processes are not checked. Allowing one thing starts the checks.'}</Text>
      </View>
    </View>
    <View className={`flex-row items-center pt-2 mt-1.5 px-1 gap-1.5 border-t ${bd(theme().borderSoft)}`}>
      <Action label="Build App" primary onPress={() => { setProjectOpen(false); build(); }} />
      <Action label="Open zinc.json" onPress={() => openJson()} />
      <Action label="Show Folder" onPress={() => showFolder()} />
    </View>
  </View>;
}
function SketchBody(): i32 {
  return <View className="flex-col">
    <View className="flex-col px-2.5 pb-2 gap-1">
      <Text className={`text-[13px] ${fg(theme().text)}`}>A sketch: a folder of code, run as it is.</Text>
      <Text className={`text-[12px] ${fg(theme().muted)}`}>A project adds a zinc.json: the app's name and version, its window, what it may do, its targets. It is what Build App and a device need to make an app of it.</Text>
    </View>
    <View className={`flex-col py-1 border-t ${bd(theme().borderSoft)}`}>
      <Fact label="Entry" value={() => mainFile(sketchDir())} />
    </View>
    <View className={`flex-row items-center pt-2 mt-0.5 px-1 gap-1.5 border-t ${bd(theme().borderSoft)}`}>
      <Action label="Make it a Project" primary onPress={() => makeProject()} />
      <Action label="Show Folder" onPress={() => showFolder()} />
    </View>
  </View>;
}

export function ProjectCard(): i32 {
  return <View className="absolute inset-0" style={{ hidden: projectOpen() ? 0 : 1 }}>
    <View className="absolute inset-0" onPointerDown={() => setProjectOpen(false)} />
    <View className={`absolute top-[50] right-[92] w-[420] flex-col p-2 rounded-xl border shadow-lg ${bg(theme().elevated)} ${bd(theme().border)}`} onPointerDown={() => {}}>
      <View className="flex-row items-center h-[30] pl-2.5 pb-1 gap-2">
        <Text className={`grow text-[13px] font-semibold ${fg(theme().text)}`}>{project() === null ? sketchName() : 'Project'}</Text>
        <View className={`flex-row items-center h-[24] px-2.5 rounded-full cursor-pointer hover:${bg(theme().hover)}`} onPointerDown={(e: ui.PointerEvent) => { setProjectOpen(false); setStartOpen(true); }}>
          <Text className={`text-[12px] ${fg(theme().muted)}`}>Sketchbook…</Text>
        </View>
        <IconButton kind={I_CLOSE} size={12} onPress={() => setProjectOpen(false)} />
      </View>
      {project() === null ? <SketchBody /> : <ProjectBody />}
    </View>
  </View>;
}
