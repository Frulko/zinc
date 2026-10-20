// Read-only views in place of the chat: a configuration file or folder, and the whole of a long text kept on disk
// (« Show all » on a tool's output or a long paragraph), one part of PART_CHARS at a time so even a 200 MB output
// never comes into memory whole.
import { createSignal } from 'zinc:ui/solid';
import * as fs from 'zinc:fs';
import { ConfigFile } from '../services/discovery';
import { Spill } from '../services/stream';
import { viewFile, viewOutput, viewedOutput } from '../state';
import { BACKGROUND, BORDER, TEXT, MUTED, FAINT, SURFACE_HOVER, bg, fg, bd, sizeLabel } from '../theme';

/** A larger file shows its beginning: the viewer is for reading settings, not logs. */
const MAX_SHOWN_BYTES = 200 * 1024;

function contentOf(f: ConfigFile): string {
  try {
    if (f.isDirectory) return fs.list(f.path).sort((a: string, b: string) => a < b ? -1 : a > b ? 1 : 0).join('\n');
    const text = fs.readText(f.path);
    return text.length > MAX_SHOWN_BYTES ? text.slice(0, MAX_SHOWN_BYTES) + '\n…' : text;
  } catch (e) {
    return `cannot read ${f.path}: ${e.message}`;
  }
}

function ViewerButton(props: { label: string; onPress: () => void }): i32 {
  return <View className={`h-[26] px-3 rounded-md items-center justify-center cursor-pointer hover:${bg(SURFACE_HOVER)}`} onPress={props.onPress}>
    <Text className={`text-[12px] ${fg(MUTED)}`}>{props.label}</Text>
  </View>;
}

export function FileViewer(props: { file: ConfigFile }): i32 {
  return <View className="grow flex-col">
    <View className={`flex-row items-center gap-3 h-[44] px-4 border-b ${bd(BORDER)}`}>
      <Text className={`text-[13px] font-semibold ${fg(TEXT)}`}>{props.file.label}</Text>
      <Text className={`grow shrink min-w-0 truncate text-[12px] ${fg(FAINT)}`}>{props.file.path}</Text>
      <ViewerButton label="Back to the chat" onPress={() => viewFile(null)} />
    </View>
    <TextArea readOnly wrap={false} className={`grow font-mono text-[12px] p-3 ${bg(BACKGROUND)} ${fg(TEXT)}`} value={contentOf(props.file)} />
  </View>;
}

function partOf(s: Spill, k: i32): string {
  try { return s.read(k); } catch (e) { return `cannot read ${s.part(k)}: ${e.message}`; }
}

export function OutputViewer(): i32 {
  const s = viewedOutput() as Spill;
  const [page, setPage] = createSignal<i32>(0);
  return <View className="grow flex-col">
    <View className={`flex-row items-center gap-3 h-[44] px-4 border-b ${bd(BORDER)}`}>
      <Text className={`text-[13px] font-semibold ${fg(TEXT)}`}>{`Whole text · ${sizeLabel(s.total, false)}`}</Text>
      <Text className={`grow shrink min-w-0 truncate text-[12px] ${fg(FAINT)}`}>{s.parts > 1 ? `part ${page() + 1} of ${s.parts} · ${s.part(page())}` : s.part(0)}</Text>
      {page() > 0 && <ViewerButton label="Previous" onPress={() => setPage(page() - 1)} />}
      {page() < s.parts - 1 && <ViewerButton label="Next" onPress={() => setPage(page() + 1)} />}
      <ViewerButton label="Back to the chat" onPress={() => viewOutput(null)} />
    </View>
    <TextArea readOnly wrap={false} className={`grow font-mono text-[12px] p-3 ${bg(BACKGROUND)} ${fg(TEXT)}`} value={partOf(s, page())} />
  </View>;
}
